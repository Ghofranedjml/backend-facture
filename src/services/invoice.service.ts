import { InvoiceStatus, Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middlewares/error.middleware';
import { calcTaxBreakdown, calcLineTotal } from '../utils/fiscalCalculator';
import { generateInvoiceNumber, defaultDueDate } from '../utils/invoiceNumber';
import {
  CreateInvoiceInput,
  UpdateInvoiceInput,
  MarkPaidInput,
  InvoiceQuery,
} from '../utils/validators';
import { PaginationMeta } from '../types';

// ─── Include helper — évite la répétition ──
const invoiceInclude = {
  client: true,
  lines: { orderBy: { position: 'asc' as const } },
  auditLogs: { orderBy: { createdAt: 'desc' as const }, take: 20 },
} satisfies Prisma.InvoiceInclude;

// ─── LIST ──────────────────────────────────
export async function listInvoices(
  userId: string,
  query: InvoiceQuery,
): Promise<{ invoices: Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>[]; meta: PaginationMeta }> {
  const { page, limit, status, currency, clientId, search, dateFrom, dateTo } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.InvoiceWhereInput = {
    userId,
    ...(status && { status }),
    ...(currency && { currency }),
    ...(clientId && { clientId }),
    ...(dateFrom || dateTo
      ? { issueDate: { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) } }
      : {}),
    ...(search && {
      OR: [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    invoices,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

// ─── GET ONE ───────────────────────────────
export async function getInvoice(
  invoiceId: string,
  userId: string,
): Promise<Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: invoiceInclude,
  });

  if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Facture introuvable');
  if (invoice.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Accès refusé');

  return invoice;
}

// ─── CREATE ────────────────────────────────
export async function createInvoice(
  userId: string,
  input: CreateInvoiceInput,
) {
  // Vérifier que le client appartient à l'utilisateur
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new AppError(404, 'NOT_FOUND', 'Client introuvable');
  if (client.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Client non autorisé');

  const invoiceNumber = await generateInvoiceNumber();
  const dueDate = input.dueDate ?? defaultDueDate(input.issueDate);

  // Préparer les lignes avec calcul des totaux
  const linesWithTotals = input.lines.map((line, i) => ({
    ...line,
    position: line.position ?? i,
    lineTotal: calcLineTotal(line.quantity, line.unitPrice),
  }));

  // Calcul fiscal complet
  const tax = calcTaxBreakdown(linesWithTotals, input.withholdingTaxType);

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        userId,
        clientId: input.clientId,
        contractId: input.contractId ?? null,
        currency: input.currency,
        issueDate: input.issueDate,
        dueDate,
        withholdingTaxType: input.withholdingTaxType,
        notes: input.notes ?? null,
        subtotal: tax.subtotal,
        totalVat: tax.totalVat,
        stampDuty: tax.stampDuty,
        withholdingTax: tax.withholdingTax,
        total: tax.total,
        lines: {
          create: linesWithTotals.map((l) => ({
            position: l.position,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            vatRate: l.vatRate,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: invoiceInclude,
    });

    await tx.auditLog.create({
      data: {
        invoiceId: created.id,
        userId,
        action: 'CREATED',
        toStatus: InvoiceStatus.DRAFT,
      },
    });

    return created;
  });

  return invoice;
}

// ─── UPDATE (brouillon uniquement) ────────
export async function updateInvoice(
  invoiceId: string,
  userId: string,
  input: UpdateInvoiceInput,
) {
  const existing = await getInvoice(invoiceId, userId);

  if (existing.status !== InvoiceStatus.DRAFT) {
    throw new AppError(422, 'INVALID_STATUS', 'Seules les factures en brouillon peuvent être modifiées');
  }

  // Recalculer les totaux si les lignes changent
  let taxData: ReturnType<typeof calcTaxBreakdown> | undefined;
  if (input.lines) {
    const linesWithTotals = input.lines.map((l, i) => ({
      ...l,
      position: l.position ?? i,
      lineTotal: calcLineTotal(l.quantity, l.unitPrice),
    }));
    taxData = calcTaxBreakdown(
      linesWithTotals,
      input.withholdingTaxType ?? existing.withholdingTaxType,
    );

    return prisma.$transaction(async (tx) => {
      // Supprimer les anciennes lignes et recréer
      await tx.invoiceLine.deleteMany({ where: { invoiceId } });

      return tx.invoice.update({
        where: { id: invoiceId },
        data: {
          ...(input.clientId && { clientId: input.clientId }),
          ...(input.contractId !== undefined && { contractId: input.contractId }),
          ...(input.currency && { currency: input.currency }),
          ...(input.issueDate && { issueDate: input.issueDate }),
          ...(input.dueDate && { dueDate: input.dueDate }),
          ...(input.withholdingTaxType && { withholdingTaxType: input.withholdingTaxType }),
          ...(input.notes !== undefined && { notes: input.notes }),
          subtotal: taxData!.subtotal,
          totalVat: taxData!.totalVat,
          stampDuty: taxData!.stampDuty,
          withholdingTax: taxData!.withholdingTax,
          total: taxData!.total,
          lines: {
            create: input.lines!.map((l, i) => ({
              position: l.position ?? i,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              vatRate: l.vatRate,
              lineTotal: calcLineTotal(l.quantity, l.unitPrice),
            })),
          },
        },
        include: invoiceInclude,
      });
    });
  }

  // Mise à jour sans changement de lignes
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      ...(input.clientId && { clientId: input.clientId }),
      ...(input.contractId !== undefined && { contractId: input.contractId }),
      ...(input.currency && { currency: input.currency }),
      ...(input.issueDate && { issueDate: input.issueDate }),
      ...(input.dueDate && { dueDate: input.dueDate }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: invoiceInclude,
  });
}

// ─── DELETE (brouillon uniquement) ────────
export async function deleteInvoice(invoiceId: string, userId: string): Promise<void> {
  const invoice = await getInvoice(invoiceId, userId);

  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new AppError(422, 'INVALID_STATUS', 'Seules les factures en brouillon peuvent être supprimées');
  }

  await prisma.invoice.delete({ where: { id: invoiceId } });
}

// ─── VALIDATE : DRAFT → ISSUED ────────────
export async function validateInvoice(invoiceId: string, userId: string) {
  const invoice = await getInvoice(invoiceId, userId);

  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new AppError(422, 'INVALID_STATUS', 'Seules les factures en brouillon peuvent être émises');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.ISSUED },
      include: invoiceInclude,
    });

    await tx.auditLog.create({
      data: {
        invoiceId,
        userId,
        action: 'VALIDATED',
        fromStatus: InvoiceStatus.DRAFT,
        toStatus: InvoiceStatus.ISSUED,
      },
    });

    return updated;
  });
}

// ─── MARK PAID : ISSUED/OVERDUE → PAID ────
export async function markInvoicePaid(
  invoiceId: string,
  userId: string,
  input: MarkPaidInput,
) {
  const invoice = await getInvoice(invoiceId, userId);

  if (![InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE].includes(invoice.status)) {
    throw new AppError(422, 'INVALID_STATUS', 'Seules les factures émises ou en retard peuvent être marquées payées');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.PAID,
        paidDate: input.paidDate,
        ...(input.notes && { notes: input.notes }),
      },
      include: invoiceInclude,
    });

    await tx.auditLog.create({
      data: {
        invoiceId,
        userId,
        action: 'PAID',
        fromStatus: invoice.status,
        toStatus: InvoiceStatus.PAID,
        metadata: { paidDate: input.paidDate },
      },
    });

    return updated;
  });
}

// ─── CANCEL ────────────────────────────────
export async function cancelInvoice(invoiceId: string, userId: string) {
  const invoice = await getInvoice(invoiceId, userId);

  if (invoice.status === InvoiceStatus.PAID) {
    throw new AppError(422, 'INVALID_STATUS', 'Une facture payée ne peut pas être annulée');
  }

  if (invoice.status === InvoiceStatus.CANCELLED) {
    throw new AppError(422, 'INVALID_STATUS', 'La facture est déjà annulée');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.CANCELLED },
      include: invoiceInclude,
    });

    await tx.auditLog.create({
      data: {
        invoiceId,
        userId,
        action: 'CANCELLED',
        fromStatus: invoice.status,
        toStatus: InvoiceStatus.CANCELLED,
      },
    });

    return updated;
  });
}

// ─── DASHBOARD STATS ───────────────────────
export async function getInvoiceStats(userId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    currentMonth,
    lastMonth,
    overdueInvoices,
    statusBreakdown,
    topClients,
    avgPaymentDelay,
  ] = await Promise.all([
    // CA et nombre de factures ce mois
    prisma.invoice.aggregate({
      where: { userId, issueDate: { gte: startOfMonth }, status: { not: InvoiceStatus.CANCELLED } },
      _sum: { total: true },
      _count: true,
    }),

    // CA mois dernier (pour variation %)
    prisma.invoice.aggregate({
      where: {
        userId,
        issueDate: { gte: startOfLastMonth, lte: endOfLastMonth },
        status: { not: InvoiceStatus.CANCELLED },
      },
      _sum: { total: true },
    }),

    // Impayés en retard
    prisma.invoice.aggregate({
      where: { userId, status: InvoiceStatus.OVERDUE },
      _sum: { total: true },
      _count: true,
    }),

    // Répartition par statut ce mois
    prisma.invoice.groupBy({
      by: ['status'],
      where: { userId, issueDate: { gte: startOfMonth } },
      _count: true,
    }),

    // Top 5 clients par CA (tous temps)
    prisma.invoice.groupBy({
      by: ['clientId'],
      where: { userId, status: { not: InvoiceStatus.CANCELLED } },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    }),

    // Délai moyen de paiement (jours)
    prisma.$queryRaw<{ avg_days: number }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (paid_date - issue_date)) / 86400)::int AS avg_days
      FROM invoices
      WHERE user_id = ${userId}
        AND status = 'PAID'
        AND paid_date IS NOT NULL
    `,
  ]);

  // Enrichir les top clients avec leur nom
  const topClientsWithNames = await Promise.all(
    topClients.map(async (tc) => {
      const client = await prisma.client.findUnique({
        where: { id: tc.clientId },
        select: { name: true },
      });
      return {
        clientId: tc.clientId,
        clientName: client?.name ?? 'Inconnu',
        total: tc._sum.total,
      };
    }),
  );

  const caThisMonth = Number(currentMonth._sum.total ?? 0);
  const caLastMonth = Number(lastMonth._sum.total ?? 0);
  const caVariation = caLastMonth > 0
    ? ((caThisMonth - caLastMonth) / caLastMonth) * 100
    : 0;

  const totalIssued = statusBreakdown.find((s) => s.status === 'ISSUED')?._count ?? 0;
  const totalPaid = statusBreakdown.find((s) => s.status === 'PAID')?._count ?? 0;
  const totalInMonth = statusBreakdown.reduce((sum, s) => sum + s._count, 0);
  const paymentRate = totalInMonth > 0 ? Math.round((totalPaid / totalInMonth) * 100) : 0;

  return {
    currentMonth: {
      ca: caThisMonth,
      caVariation: Math.round(caVariation * 10) / 10,
      invoiceCount: currentMonth._count,
    },
    overdue: {
      total: Number(overdueInvoices._sum.total ?? 0),
      count: overdueInvoices._count,
    },
    paymentRate,
    avgPaymentDays: avgPaymentDelay[0]?.avg_days ?? 0,
    statusBreakdown: statusBreakdown.map((s) => ({
      status: s.status,
      count: s._count,
    })),
    topClients: topClientsWithNames,
  };
}

// ─── MARK OVERDUE (appelé par le scheduler) ─
export async function markOverdueInvoices(): Promise<number> {
  const result = await prisma.invoice.updateMany({
    where: {
      status: InvoiceStatus.ISSUED,
      dueDate: { lt: new Date() },
    },
    data: { status: InvoiceStatus.OVERDUE },
  });

  return result.count;
}
