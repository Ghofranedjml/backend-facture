import { InvoiceStatus, Prisma, QuotationStatus, WithholdingTaxType } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middlewares/error.middleware';
import { PaginationMeta } from '../types';
import { calcLineTotal, calcTaxBreakdown } from '../utils/fiscalCalculator';
import { generateInvoiceNumber } from '../utils/invoiceNumber';
import { generateQuotationNumber } from '../utils/quotationNumber';
import {
  ConvertQuotationInput,
  CreateQuotationInput,
  QuotationQuery,
  UpdateQuotationInput,
} from '../utils/validators';

const quotationInclude = {
  client: true,
  lines: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.QuotationInclude;

export async function listQuotations(
  userId: string,
  query: QuotationQuery,
): Promise<{ quotations: Prisma.QuotationGetPayload<{ include: typeof quotationInclude }>[]; meta: PaginationMeta }> {
  const { status, clientId, search, dateFrom, dateTo, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.QuotationWhereInput = {
    userId,
    ...(status && { status }),
    ...(clientId && { clientId }),
    ...(dateFrom || dateTo
      ? { issueDate: { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) } }
      : {}),
    ...(search && {
      OR: [
        { quotationNumber: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  };

  const [quotations, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      include: quotationInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.quotation.count({ where }),
  ]);

  return {
    quotations,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getQuotation(
  quotationId: string,
  userId: string,
): Promise<Prisma.QuotationGetPayload<{ include: typeof quotationInclude }>> {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: quotationInclude,
  });

  if (!quotation) throw new AppError(404, 'NOT_FOUND', 'Devis introuvable');
  if (quotation.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Acces refuse');

  return quotation;
}

export async function createQuotation(userId: string, input: CreateQuotationInput) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new AppError(404, 'NOT_FOUND', 'Client introuvable');
  if (client.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Client non autorise');

  const quotationNumber = await generateQuotationNumber();

  const linesWithTotals = input.lines.map((line, i) => ({
    ...line,
    position: line.position ?? i,
    lineTotal: calcLineTotal(line.quantity, line.unitPrice),
  }));

  const tax = calcTaxBreakdown(linesWithTotals, WithholdingTaxType.NONE, false);

  return prisma.quotation.create({
    data: {
      quotationNumber,
      userId,
      clientId: input.clientId,
      contractId: input.contractId ?? null,
      currency: input.currency,
      issueDate: input.issueDate,
      validUntil: input.validUntil,
      notes: input.notes ?? null,
      status: QuotationStatus.DRAFT,
      subtotal: tax.subtotal,
      totalVat: tax.totalVat,
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
    include: quotationInclude,
  });
}

export async function updateQuotation(
  quotationId: string,
  userId: string,
  input: UpdateQuotationInput,
) {
  const existing = await getQuotation(quotationId, userId);
  if (existing.status !== QuotationStatus.DRAFT) {
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis en brouillon peuvent etre modifies');
  }

  if (input.clientId !== undefined) {
    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw new AppError(404, 'NOT_FOUND', 'Client introuvable');
    if (client.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Client non autorise');
  }

  if (input.issueDate && input.validUntil && input.validUntil < input.issueDate) {
    throw new AppError(422, 'VALIDATION_ERROR', "La date de validite doit etre apres la date d'emission");
  }

  if (input.issueDate && !input.validUntil && existing.validUntil < input.issueDate) {
    throw new AppError(422, 'VALIDATION_ERROR', "La date de validite doit etre apres la date d'emission");
  }

  if (!input.issueDate && input.validUntil && input.validUntil < existing.issueDate) {
    throw new AppError(422, 'VALIDATION_ERROR', "La date de validite doit etre apres la date d'emission");
  }

  if (input.lines) {
    const linesWithTotals = input.lines.map((line, i) => ({
      ...line,
      position: line.position ?? i,
      lineTotal: calcLineTotal(line.quantity, line.unitPrice),
    }));
    const tax = calcTaxBreakdown(linesWithTotals, WithholdingTaxType.NONE, false);

    return prisma.$transaction(async (tx) => {
      await tx.quotationLine.deleteMany({ where: { quotationId } });

      return tx.quotation.update({
        where: { id: quotationId },
        data: {
          ...(input.clientId && { clientId: input.clientId }),
          ...(input.contractId !== undefined && { contractId: input.contractId }),
          ...(input.currency && { currency: input.currency }),
          ...(input.issueDate && { issueDate: input.issueDate }),
          ...(input.validUntil && { validUntil: input.validUntil }),
          ...(input.notes !== undefined && { notes: input.notes }),
          subtotal: tax.subtotal,
          totalVat: tax.totalVat,
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
        include: quotationInclude,
      });
    });
  }

  return prisma.quotation.update({
    where: { id: quotationId },
    data: {
      ...(input.clientId && { clientId: input.clientId }),
      ...(input.contractId !== undefined && { contractId: input.contractId }),
      ...(input.currency && { currency: input.currency }),
      ...(input.issueDate && { issueDate: input.issueDate }),
      ...(input.validUntil && { validUntil: input.validUntil }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: quotationInclude,
  });
}

export async function deleteQuotation(quotationId: string, userId: string): Promise<void> {
  const existing = await getQuotation(quotationId, userId);
  if (existing.status !== QuotationStatus.DRAFT) {
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis en brouillon peuvent etre supprimes');
  }
  await prisma.quotation.delete({ where: { id: quotationId } });
}

export async function sendQuotation(quotationId: string, userId: string) {
  const quotation = await getQuotation(quotationId, userId);
  if (quotation.status !== QuotationStatus.DRAFT) {
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis en brouillon peuvent etre envoyes');
  }

  return prisma.quotation.update({
    where: { id: quotationId },
    data: { status: QuotationStatus.SENT, emailSentAt: new Date() },
    include: quotationInclude,
  });
}

export async function acceptQuotation(quotationId: string, userId: string) {
  const quotation = await getQuotation(quotationId, userId);
  if (quotation.status !== QuotationStatus.SENT) {
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis envoyes peuvent etre acceptes');
  }

  return prisma.quotation.update({
    where: { id: quotationId },
    data: { status: QuotationStatus.ACCEPTED, acceptedAt: new Date() },
    include: quotationInclude,
  });
}

export async function refuseQuotation(quotationId: string, userId: string) {
  const quotation = await getQuotation(quotationId, userId);
  if (quotation.status !== QuotationStatus.SENT) {
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis envoyes peuvent etre refuses');
  }

  return prisma.quotation.update({
    where: { id: quotationId },
    data: { status: QuotationStatus.REFUSED },
    include: quotationInclude,
  });
}

export async function convertQuotationToInvoice(
  quotationId: string,
  userId: string,
  input: ConvertQuotationInput,
) {
  const quotation = await getQuotation(quotationId, userId);

  if (quotation.status !== QuotationStatus.ACCEPTED && quotation.status !== QuotationStatus.SENT) {
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis acceptés ou envoyés peuvent etre convertis');
  }

  return prisma.$transaction(async (tx) => {
    const invoiceNumber = await generateInvoiceNumber();

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        userId,
        clientId: quotation.clientId,
        contractId: quotation.contractId,
        currency: quotation.currency,
        subtotal: quotation.subtotal,
        totalVat: quotation.totalVat,
        total: quotation.total,
        issueDate: input.invoiceIssueDate,
        dueDate: input.invoiceDueDate,
        notes: input.notes ?? quotation.notes,
        status: InvoiceStatus.DRAFT,
        lines: {
          create: quotation.lines.map((line) => ({
            position: line.position,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            vatRate: line.vatRate,
            lineTotal: line.lineTotal,
          })),
        },
      },
      include: {
        client: true,
        lines: { orderBy: { position: 'asc' } },
      },
    });

    await tx.quotation.update({
      where: { id: quotationId },
      data: {
        status: QuotationStatus.CONVERTED,
        convertedAt: new Date(),
        convertedToInvoiceId: invoice.id,
      },
    });

    return invoice;
  });
}

export async function markExpiredQuotations(): Promise<number> {
  const result = await prisma.quotation.updateMany({
    where: {
      status: QuotationStatus.SENT,
      validUntil: { lt: new Date() },
    },
    data: { status: QuotationStatus.EXPIRED },
  });

  return result.count;
}
