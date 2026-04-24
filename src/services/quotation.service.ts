import { InvoiceStatus, Prisma, QuotationStatus, VatRate, WithholdingTaxType } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middlewares/error.middleware';
import { PaginationMeta } from '../types';
import { generateInvoiceNumber } from '../utils/invoiceNumber';
import { generateQuotationNumber } from '../utils/quotationNumber';
import { FiscalEngine } from './fiscalEngine.service';
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

// Helper to calculate line totals
function calculateLineTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 1000) / 1000;
}

// Helper to convert number to VatRate enum
function numberToVatRate(rate: number): VatRate {
  const roundedRate = Math.round(rate);
  switch (roundedRate) {
    case 0: return VatRate.ZERO;
    case 7: return VatRate.SEVEN;
    case 13: return VatRate.THIRTEEN;
    case 19: return VatRate.NINETEEN;
    default: return VatRate.NINETEEN;
  }
}
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
        { description: { contains: search, mode: 'insensitive' } },
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
  if (quotation.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Accès refusé');

  return quotation;
}

export async function createQuotation(userId: string, input: CreateQuotationInput) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new AppError(404, 'NOT_FOUND', 'Client introuvable');
  if (client.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Client non autorisé');

  const quotationNumber = await generateQuotationNumber();

  // Calculate line totals
  const linesWithTotals = input.lines.map((line, i) => ({
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    vatRate: line.vatRate ?? 19,
    position: line.position ?? i,
    lineTotal: calculateLineTotal(line.quantity, line.unitPrice),
  }));

  const subtotal = linesWithTotals.reduce((sum, line) => sum + line.lineTotal, 0);
  
  // Combine all line descriptions for intelligent detection
  const combinedDescription = linesWithTotals.map(l => l.description).join(' ');
  
  // Use intelligent fiscal engine
  const fiscalResult = FiscalEngine.calculate({
    amountHT: subtotal,
    serviceDescription: combinedDescription,
    clientAddress: client.address,
    clientType: 'PRO',
    withholdingTaxType: WithholdingTaxType.NONE, // Quotations don't have RAS by default
  });

  // Calculate total with taxes
  const total = subtotal + fiscalResult.tvaAmount + fiscalResult.timbreAmount - fiscalResult.rasAmount;

  return prisma.quotation.create({
    data: {
      quotationNumber,
      userId,
      clientId: input.clientId,
      contractId: input.contractId ?? null,
      currency: fiscalResult.detectedCurrency as any,
      description: input.description ?? combinedDescription.substring(0, 500),
      notes: input.notes ?? null,
      issueDate: input.issueDate,
      validUntil: input.validUntil,
      status: QuotationStatus.DRAFT,
      
      // Financial fields
      subtotal,
      totalVat: fiscalResult.tvaAmount,
      stampDuty: fiscalResult.timbreAmount,
      withholdingTax: fiscalResult.rasAmount,
      total,
      withholdingTaxType: WithholdingTaxType.NONE,
      
      // Intelligent detection fields
      countryCode: fiscalResult.detectedCountry,
      autoDetected: true,
      manualVatRate: null,
      detectedVatRate: fiscalResult.tvaRate,
      useIntelligentVat: true,
      
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
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis en brouillon peuvent être modifiés');
  }

  if (input.clientId !== undefined) {
    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw new AppError(404, 'NOT_FOUND', 'Client introuvable');
    if (client.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Client non autorisé');
  }

  // Validate dates
  const issueDate = input.issueDate || existing.issueDate;
  const validUntil = input.validUntil || existing.validUntil;
  
  if (validUntil < issueDate) {
    throw new AppError(422, 'VALIDATION_ERROR', "La date de validité doit être après la date d'émission");
  }

  // If lines are updated, recalculate everything
  if (input.lines) {
    const linesWithTotals = input.lines.map((line, i) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate ?? 19,
      position: line.position ?? i,
      lineTotal: calculateLineTotal(line.quantity, line.unitPrice),
    }));

    const subtotal = linesWithTotals.reduce((sum, line) => sum + line.lineTotal, 0);
    const combinedDescription = linesWithTotals.map(l => l.description).join(' ');
    
    // Get client for address detection
    const client = input.clientId 
      ? await prisma.client.findUnique({ where: { id: input.clientId } })
      : existing.client;
    
    const fiscalResult = FiscalEngine.calculate({
      amountHT: subtotal,
      serviceDescription: combinedDescription,
      clientAddress: client?.address,
      clientType: 'PRO',
      withholdingTaxType: 'NONE',
    });

    const total = subtotal + fiscalResult.tvaAmount + fiscalResult.timbreAmount - fiscalResult.rasAmount;

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
          ...(input.description !== undefined && { description: input.description }),
          ...(input.notes !== undefined && { notes: input.notes }),
          
          // Recalculated financials
          subtotal,
          totalVat: fiscalResult.tvaAmount,
          stampDuty: fiscalResult.timbreAmount,
          withholdingTax: fiscalResult.rasAmount,
          total,
          
          // Update detection
          countryCode: fiscalResult.detectedCountry,
          detectedVatRate: fiscalResult.tvaRate,
          
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

  // No line changes, just update basic fields
  return prisma.quotation.update({
    where: { id: quotationId },
    data: {
      ...(input.clientId && { clientId: input.clientId }),
      ...(input.contractId !== undefined && { contractId: input.contractId }),
      ...(input.currency && { currency: input.currency }),
      ...(input.issueDate && { issueDate: input.issueDate }),
      ...(input.validUntil && { validUntil: input.validUntil }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: quotationInclude,
  });
}

export async function deleteQuotation(quotationId: string, userId: string): Promise<void> {
  const existing = await getQuotation(quotationId, userId);
  if (existing.status !== QuotationStatus.DRAFT) {
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis en brouillon peuvent être supprimés');
  }
  await prisma.quotation.delete({ where: { id: quotationId } });
}

export async function sendQuotation(quotationId: string, userId: string) {
  const quotation = await getQuotation(quotationId, userId);
  if (quotation.status !== QuotationStatus.DRAFT) {
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis en brouillon peuvent être envoyés');
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
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis envoyés peuvent être acceptés');
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
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis envoyés peuvent être refusés');
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

  if (quotation.status !== QuotationStatus.ACCEPTED) {
    throw new AppError(422, 'INVALID_STATUS', 'Seuls les devis acceptés peuvent être convertis en facture');
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
        stampDuty: quotation.stampDuty,
        withholdingTax: quotation.withholdingTax,
        total: quotation.total,
        withholdingTaxType: WithholdingTaxType.NONE,
        issueDate: input.invoiceIssueDate,
        dueDate: input.invoiceDueDate,
        notes: input.notes ?? quotation.notes,
        status: InvoiceStatus.DRAFT,
        countryCode: quotation.countryCode,
        autoDetected: quotation.autoDetected,
        lines: {
          create: quotation.lines.map((line, idx) => ({
            position: idx,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            vatRate: numberToVatRate(line.vatRate), // Map to VatRate enum
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
