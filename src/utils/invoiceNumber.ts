import prisma from '../config/prisma';

/**
 * Génère un numéro de facture séquentiel unique
 * Format : FAC-YYYY-NNN (ex: FAC-2026-001)
 *
 * L'unicité est garantie par la contrainte UNIQUE sur invoice_number en BDD.
 * En cas de collision (race condition), Prisma lèvera une erreur P2002.
 */
export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `FAC-${year}-`;

  // Compter les factures de l'année en cours pour déterminer le prochain numéro
  const lastInvoice = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let nextNumber = 1;

  if (lastInvoice) {
    const parts = lastInvoice.invoiceNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextNumber = lastNum + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}

/**
 * Calcule la date d'échéance par défaut (30 jours après émission)
 */
export function defaultDueDate(issueDate: Date = new Date(), days = 30): Date {
  const due = new Date(issueDate);
  due.setDate(due.getDate() + days);
  return due;
}
