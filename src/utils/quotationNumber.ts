import prisma from '../config/prisma';

/**
 * Genere un numero de devis sequentiel unique
 * Format : DEV-YYYY-NNN (ex: DEV-2026-001)
 */
export async function generateQuotationNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DEV-${year}-`;

  const lastQuotation = await prisma.quotation.findFirst({
    where: { quotationNumber: { startsWith: prefix } },
    orderBy: { quotationNumber: 'desc' },
    select: { quotationNumber: true },
  });

  let nextNumber = 1;
  if (lastQuotation) {
    const parts = lastQuotation.quotationNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextNumber = lastNum + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}
