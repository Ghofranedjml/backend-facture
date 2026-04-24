import PDFDocument from 'pdfkit';
import prisma from '../config/prisma';
import { AppError } from '../middlewares/error.middleware';
import { formatAmount } from '../utils/fiscalCalculator';
import { VAT_RATES } from '../types';
import { VatRate } from '@prisma/client';

interface PdfInvoice {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  paidDate?: Date | null;
  status: string;
  currency: string;
  notes?: string | null;
  subtotal: number;
  totalVat: number;
  stampDuty: number;
  withholdingTax: number;
  total: number;
  client: {
    name: string;
    taxId?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  lines: {
    position: number;
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: VatRate;
    lineTotal: number;
  }[];
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('fr-TN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export async function generateInvoicePdf(
  invoiceId: string,
  userId: string,
): Promise<Buffer> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      client: true,
      lines: { orderBy: { position: 'asc' } },
    },
  });

  if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Facture introuvable');
  if (invoice.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Accès refusé');

  const data: PdfInvoice = {
    ...invoice,
    subtotal: Number(invoice.subtotal),
    totalVat: Number(invoice.totalVat),
    stampDuty: Number(invoice.stampDuty),
    withholdingTax: Number(invoice.withholdingTax),
    total: Number(invoice.total),
    lines: invoice.lines.map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      lineTotal: Number(l.lineTotal),
    })),
  };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PRIMARY = '#1C6AE4';
    const GRAY = '#6B7280';
    const LIGHT = '#F3F4F6';
    const pageWidth = doc.page.width - 100; // 50px margin each side

    // ── HEADER ────────────────────────────────────────────
    doc
      .fontSize(22)
      .fillColor(PRIMARY)
      .font('Helvetica-Bold')
      .text('E-TAFAKNA', 50, 50);

    doc
      .fontSize(9)
      .fillColor(GRAY)
      .font('Helvetica')
      .text('LegalTech Tunisienne', 50, 76)
      .text('contact@etafakna.com', 50, 88);

    // Invoice number (top right)
    doc
      .fontSize(18)
      .fillColor(PRIMARY)
      .font('Helvetica-Bold')
      .text(data.invoiceNumber, 350, 50, { align: 'right', width: pageWidth - 300 });

    doc
      .fontSize(9)
      .fillColor(GRAY)
      .font('Helvetica')
      .text(`Émise le : ${formatDate(data.issueDate)}`, 350, 76, { align: 'right', width: pageWidth - 300 })
      .text(`Échéance : ${formatDate(data.dueDate)}`, 350, 88, { align: 'right', width: pageWidth - 300 });

    // Status badge
    const statusColors: Record<string, string> = {
      DRAFT: '#6B7280',
      ISSUED: '#1C6AE4',
      PAID: '#136359',
      OVERDUE: '#F04C6A',
      CANCELLED: '#FFB660',
    };
    const statusColor = statusColors[data.status] ?? GRAY;
    doc
      .fontSize(9)
      .fillColor(statusColor)
      .font('Helvetica-Bold')
      .text(`[ ${data.status} ]`, 350, 100, { align: 'right', width: pageWidth - 300 });

    // Separator
    doc.moveTo(50, 120).lineTo(545, 120).strokeColor(PRIMARY).lineWidth(1.5).stroke();

    // ── PARTIES ───────────────────────────────────────────
    const partiesY = 135;

    // Emitter (left)
    doc.fontSize(8).fillColor(GRAY).font('Helvetica').text('ÉMETTEUR', 50, partiesY);
    doc
      .fontSize(10)
      .fillColor('#1a1a1a')
      .font('Helvetica-Bold')
      .text('E-Tafakna SARL', 50, partiesY + 14);
    doc
      .fontSize(8.5)
      .fillColor('#3b3b3b')
      .font('Helvetica')
      .text('Rue du Lac Huron, Les Berges du Lac II', 50, partiesY + 28)
      .text('Tunis 1053, Tunisie', 50, partiesY + 40)
      .text('MF : 1654321/B/M/000', 50, partiesY + 52);

    // Client (right)
    doc.fontSize(8).fillColor(GRAY).font('Helvetica').text('CLIENT', 300, partiesY);
    doc
      .fontSize(10)
      .fillColor('#1a1a1a')
      .font('Helvetica-Bold')
      .text(data.client.name, 300, partiesY + 14, { width: 245 });

    let clientY = partiesY + 28;
    if (data.client.address) {
      doc.fontSize(8.5).fillColor('#3b3b3b').font('Helvetica').text(data.client.address, 300, clientY, { width: 245 });
      clientY += 12;
    }
    if (data.client.taxId) {
      doc.text(`MF : ${data.client.taxId}`, 300, clientY, { width: 245 });
      clientY += 12;
    }
    if (data.client.email) {
      doc.text(data.client.email, 300, clientY, { width: 245 });
      clientY += 12;
    }

    // ── LINES TABLE ───────────────────────────────────────
    const tableY = Math.max(partiesY + 85, clientY + 20);

    // Table header
    doc.rect(50, tableY, pageWidth, 20).fillColor(PRIMARY).fill();

    doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold');
    doc.text('Description', 55, tableY + 6, { width: 200 });
    doc.text('Qté', 260, tableY + 6, { width: 40, align: 'center' });
    doc.text('Prix U. HT', 305, tableY + 6, { width: 75, align: 'right' });
    doc.text('TVA', 385, tableY + 6, { width: 35, align: 'center' });
    doc.text('Total HT', 425, tableY + 6, { width: 70, align: 'right' });

    // Table rows
    let rowY = tableY + 20;
    data.lines.forEach((line, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : LIGHT;
      doc.rect(50, rowY, pageWidth, 18).fillColor(bg).fill();

      doc.fontSize(8).fillColor('#3b3b3b').font('Helvetica');
      doc.text(line.description, 55, rowY + 5, { width: 200 });
      doc.text(String(line.quantity), 260, rowY + 5, { width: 40, align: 'center' });
      doc.text(formatAmount(line.unitPrice, data.currency), 305, rowY + 5, { width: 75, align: 'right' });
      doc.text(`${VAT_RATES[line.vatRate]}%`, 385, rowY + 5, { width: 35, align: 'center' });
      doc.text(formatAmount(line.lineTotal, data.currency), 425, rowY + 5, { width: 70, align: 'right' });

      rowY += 18;
    });

    // Table border
    doc.rect(50, tableY, pageWidth, rowY - tableY).strokeColor('#d1d5db').lineWidth(0.5).stroke();

    // ── TOTALS ─────────────────────────────────────────────
    const totalsX = 350;
    let totalsY = rowY + 20;

    const addTotalRow = (label: string, value: string, bold = false, color = '#3b3b3b') => {
      doc
        .fontSize(9)
        .fillColor(GRAY)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, totalsX, totalsY, { width: 110 });
      doc
        .fontSize(9)
        .fillColor(color)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(value, totalsX + 115, totalsY, { width: 75, align: 'right' });
      totalsY += 16;
    };

    addTotalRow('Total HT', formatAmount(data.subtotal, data.currency));

    // TVA by rate
    const vatByRate: Record<number, number> = {};
    data.lines.forEach((l) => {
      const rate = VAT_RATES[l.vatRate];
      vatByRate[rate] = (vatByRate[rate] ?? 0) + l.lineTotal * rate / 100;
    });
    Object.entries(vatByRate)
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([rate, amount]) => {
        addTotalRow(`TVA ${rate}%`, formatAmount(Math.round(amount * 1000) / 1000, data.currency));
      });

    if (data.stampDuty > 0) {
      addTotalRow('Timbre fiscal', formatAmount(data.stampDuty, data.currency), false, '#D27D2D');
    }
    if (data.withholdingTax > 0) {
      addTotalRow('Retenue à la source', `- ${formatAmount(data.withholdingTax, data.currency)}`, false, '#F04C6A');
    }

    // Total TTC separator
    doc.moveTo(totalsX, totalsY).lineTo(545, totalsY).strokeColor(PRIMARY).lineWidth(0.8).stroke();
    totalsY += 8;

    doc
      .fontSize(11)
      .fillColor(PRIMARY)
      .font('Helvetica-Bold')
      .text('Total TTC', totalsX, totalsY, { width: 110 });
    doc
      .fontSize(13)
      .fillColor(PRIMARY)
      .font('Helvetica-Bold')
      .text(formatAmount(data.total, data.currency), totalsX + 115, totalsY - 1, { width: 75, align: 'right' });

    // ── NOTES & FOOTER ────────────────────────────────────
    if (data.notes) {
      doc
        .fontSize(8)
        .fillColor(GRAY)
        .font('Helvetica')
        .text('Notes :', 50, totalsY + 40)
        .fillColor('#3b3b3b')
        .text(data.notes, 50, totalsY + 52, { width: 250 });
    }

    const footerY = doc.page.height - 60;
    doc
      .moveTo(50, footerY)
      .lineTo(545, footerY)
      .strokeColor('#e5e5e5')
      .lineWidth(0.5)
      .stroke();

    doc
      .fontSize(7.5)
      .fillColor(GRAY)
      .font('Helvetica')
      .text(
        'E-Tafakna SARL — RC Tunis B — MF : 1654321/B/M/000 — contact@etafakna.com',
        50,
        footerY + 8,
        { align: 'center', width: pageWidth },
      )
      .text(
        'Document généré automatiquement — conformément à la réglementation fiscale tunisienne',
        50,
        footerY + 20,
        { align: 'center', width: pageWidth },
      );

    doc.end();
  });
}
