import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../config/logger';
import prisma from '../config/prisma';
import { InvoiceStatus } from '@prisma/client';
import { generateInvoicePdf } from './pdf.service';
import { AppError } from '../middlewares/error.middleware';

// ── Transporter ───────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth:
      config.SMTP_USER && config.SMTP_PASS
        ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
        : undefined,
  });
}

// ── Templates ─────────────────────────────────────────────
function invoiceEmailHtml(invoiceNumber: string, clientName: string, total: string, dueDate: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background:#f8f8f8; margin:0; padding:0;">
  <div style="max-width:600px; margin:30px auto; background:#fff; border-radius:10px; overflow:hidden; border:1px solid #e5e5e5;">
    <div style="background:#1C6AE4; padding:28px 32px;">
      <h1 style="color:#fff; margin:0; font-size:20px;">E-Tafakna</h1>
      <p style="color:rgba(255,255,255,0.8); margin:4px 0 0; font-size:13px;">Système de Facturation</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#3b3b3b; font-size:15px;">Bonjour <strong>${clientName}</strong>,</p>
      <p style="color:#6B7280; font-size:14px; line-height:1.6;">
        Veuillez trouver ci-joint votre facture <strong style="color:#1C6AE4;">${invoiceNumber}</strong>
        d'un montant de <strong>${total}</strong>, à régler avant le <strong>${dueDate}</strong>.
      </p>
      <div style="background:#EFF6FF; border-radius:8px; padding:16px 20px; margin:24px 0; border-left:3px solid #1C6AE4;">
        <p style="margin:0; color:#1C6AE4; font-size:13px; font-weight:bold;">N° Facture : ${invoiceNumber}</p>
        <p style="margin:4px 0 0; color:#6B7280; font-size:13px;">Montant TTC : ${total}</p>
        <p style="margin:4px 0 0; color:#6B7280; font-size:13px;">Échéance : ${dueDate}</p>
      </div>
      <p style="color:#6B7280; font-size:13px;">
        Pour toute question concernant cette facture, n'hésitez pas à nous contacter à
        <a href="mailto:contact@etafakna.com" style="color:#1C6AE4;">contact@etafakna.com</a>.
      </p>
    </div>
    <div style="background:#f3f4f6; padding:16px 32px; text-align:center;">
      <p style="color:#9CA3AF; font-size:11px; margin:0;">
        E-Tafakna SARL — Facture générée automatiquement conformément à la réglementation fiscale tunisienne
      </p>
    </div>
  </div>
</body>
</html>`;
}

function reminderEmailHtml(invoiceNumber: string, clientName: string, total: string, daysOverdue: number): string {
  const urgency = daysOverdue >= 30 ? '🔴 URGENT' : daysOverdue >= 15 ? '🟠 Rappel important' : '🟡 Rappel de paiement';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background:#f8f8f8; margin:0; padding:0;">
  <div style="max-width:600px; margin:30px auto; background:#fff; border-radius:10px; overflow:hidden; border:1px solid #e5e5e5;">
    <div style="background:#F04C6A; padding:28px 32px;">
      <h1 style="color:#fff; margin:0; font-size:20px;">E-Tafakna — ${urgency}</h1>
    </div>
    <div style="padding:32px;">
      <p style="color:#3b3b3b; font-size:15px;">Bonjour <strong>${clientName}</strong>,</p>
      <p style="color:#6B7280; font-size:14px; line-height:1.6;">
        Nous vous rappelons que la facture <strong style="color:#F04C6A;">${invoiceNumber}</strong>
        d'un montant de <strong>${total}</strong> est en attente de règlement
        depuis <strong>${daysOverdue} jour(s)</strong>.
      </p>
      <div style="background:#FED8D8; border-radius:8px; padding:16px 20px; margin:24px 0; border-left:3px solid #F04C6A;">
        <p style="margin:0; color:#F04C6A; font-size:13px; font-weight:bold;">Facture en retard : ${invoiceNumber}</p>
        <p style="margin:4px 0 0; color:#6B7280; font-size:13px;">Montant TTC dû : ${total}</p>
        <p style="margin:4px 0 0; color:#6B7280; font-size:13px;">Retard : ${daysOverdue} jour(s)</p>
      </div>
      <p style="color:#6B7280; font-size:13px;">
        Merci de procéder au règlement dans les meilleurs délais ou de nous contacter pour tout arrangement.
      </p>
    </div>
    <div style="background:#f3f4f6; padding:16px 32px; text-align:center;">
      <p style="color:#9CA3AF; font-size:11px; margin:0;">E-Tafakna SARL — contact@etafakna.com</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Send invoice by email ─────────────────────────────────
export async function sendInvoiceByEmail(
  invoiceId: string,
  userId: string,
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });

  if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Facture introuvable');
  if (invoice.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Accès refusé');
  if (!invoice.client.email) throw new AppError(422, 'NO_EMAIL', 'Le client n\'a pas d\'adresse email');
  if (invoice.status === 'DRAFT') throw new AppError(422, 'INVALID_STATUS', 'Impossible d\'envoyer un brouillon');

  // Generate PDF
  const pdfBuffer = await generateInvoicePdf(invoiceId, userId);

  const dueDate = new Date(invoice.dueDate).toLocaleDateString('fr-TN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const transporter = createTransporter();

  await transporter.sendMail({
    from: config.EMAIL_FROM,
    to: invoice.client.email,
    subject: `Facture ${invoice.invoiceNumber} — E-Tafakna`,
    html: invoiceEmailHtml(
      invoice.invoiceNumber,
      invoice.client.name,
      `${Number(invoice.total).toFixed(3)} ${invoice.currency}`,
      dueDate,
    ),
    attachments: [
      {
        filename: `${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  // Update emailSentAt + audit log
  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoiceId },
      data: { emailSentAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        invoiceId,
        userId,
        action: 'EMAIL_SENT',
        metadata: { to: invoice.client.email },
      },
    }),
  ]);

  logger.info(`Email sent for invoice ${invoice.invoiceNumber} to ${invoice.client.email}`);
}

// ── Automatic reminders scheduler ───────────────────────
export async function sendAutomaticReminders(): Promise<{ sent: number; errors: number }> {
  const now = new Date();
  let sent = 0;
  let errors = 0;

  // Find all overdue invoices that still have a client email
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      status: InvoiceStatus.OVERDUE,
      client: { email: { not: null } },
    },
    include: { client: true },
  });

  for (const invoice of overdueInvoices) {
    if (!invoice.client.email) continue;

    const daysOverdue = Math.floor(
      (now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24),
    );

    // Determine which reminder to send (J+7, J+15, J+30)
    const reminderDays = [7, 15, 30];
    const sentReminders = (invoice.reminderSentAt as Record<string, string> | null) ?? {};

    for (const day of reminderDays) {
      if (daysOverdue >= day && !sentReminders[String(day)]) {
        try {
          const transporter = createTransporter();

          await transporter.sendMail({
            from: config.EMAIL_FROM,
            to: invoice.client.email,
            subject: `Rappel J+${day} — Facture ${invoice.invoiceNumber} en attente — E-Tafakna`,
            html: reminderEmailHtml(
              invoice.invoiceNumber,
              invoice.client.name,
              `${Number(invoice.total).toFixed(3)} ${invoice.currency}`,
              daysOverdue,
            ),
          });

          // Mark reminder as sent
          sentReminders[String(day)] = now.toISOString();

          await prisma.$transaction([
            prisma.invoice.update({
              where: { id: invoice.id },
              data: { reminderSentAt: sentReminders },
            }),
            prisma.auditLog.create({
              data: {
                invoiceId: invoice.id,
                userId: invoice.userId,
                action: `REMINDER_J${day}`,
                metadata: { to: invoice.client.email, daysOverdue },
              },
            }),
          ]);

          sent++;
          logger.info(`Reminder J+${day} sent for ${invoice.invoiceNumber}`);
        } catch (err) {
          errors++;
          logger.error(`Failed to send reminder for ${invoice.invoiceNumber}`, { err });
        }
        break; // Send only one reminder per run per invoice
      }
    }
  }

  return { sent, errors };
}
