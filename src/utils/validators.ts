import { z } from 'zod';
import { InvoiceStatus, Currency, VatRate, WithholdingTaxType, QuotationStatus } from '@prisma/client';

// ─── Shared ────────────────────────────────

const decimalPositive = z
  .number()
  .positive('Doit être supérieur à 0')
  .multipleOf(0.001, 'Maximum 3 décimales');

// ─── Invoice Line ──────────────────────────

export const invoiceLineSchema = z.object({
  description: z.string().min(1, 'Description requise').max(500),
  quantity: decimalPositive,
  unitPrice: z
    .number()
    .min(0, 'Prix unitaire ne peut pas être négatif')
    .multipleOf(0.001),
  vatRate: z.nativeEnum(VatRate),
  position: z.number().int().min(0).optional(),
});

export type InvoiceLineInput = z.infer<typeof invoiceLineSchema>;

// ─── Create Invoice (base object without refine) ───
const createInvoiceBaseSchema = z.object({
  clientId: z.string().cuid('clientId invalide'),
  contractId: z.string().optional().nullable(),
  currency: z.nativeEnum(Currency).default('TND'),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  withholdingTaxType: z.nativeEnum(WithholdingTaxType).default('NONE'),
  notes: z.string().max(1000).optional().nullable(),
  lines: z
    .array(invoiceLineSchema)
    .min(1, 'Au moins une ligne de facturation requise')
    .max(50, 'Maximum 50 lignes'),
});

// Schéma final avec validation croisée
export const createInvoiceSchema = createInvoiceBaseSchema.refine(
  (data) => data.dueDate >= data.issueDate,
  {
    message: "La date d'échéance doit être après la date d'émission",
    path: ['dueDate'],
  },
);

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// ─── Update Invoice (brouillon uniquement) ─
export const updateInvoiceSchema = createInvoiceBaseSchema
  .partial()
  .omit({ lines: true })
  .extend({
    lines: z.array(invoiceLineSchema).min(1).max(50).optional(),
  });

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

// ─── Mark as paid ──────────────────────────

export const markPaidSchema = z.object({
  paidDate: z.coerce.date().optional().default(() => new Date()),
  notes: z.string().max(500).optional(),
});

export type MarkPaidInput = z.infer<typeof markPaidSchema>;

// ─── List invoices (query params) ─────────

export const invoiceQuerySchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  currency: z.nativeEnum(Currency).optional(),
  clientId: z.string().optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;

// Quotation Line Validator
export const quotationLineSchema = z.object({
  description: z.string().min(1, 'Description requise').max(500),
  quantity: decimalPositive,
  unitPrice: z.number().min(0, 'Prix unitaire ne peut pas être négatif').multipleOf(0.001),
  vatRate: z.number().min(0).max(100).optional(),  // Flexible, not tied to VatRate enum
  position: z.number().int().min(0).optional(),
});

export type QuotationLineInput = z.infer<typeof quotationLineSchema>;

// Create Quotation Input
export const createQuotationSchema = z.object({
  clientId: z.string().cuid('clientId invalide'),
  contractId: z.string().optional().nullable(),
  currency: z.nativeEnum(Currency).default('TND'),
  issueDate: z.coerce.date(),
  validUntil: z.coerce.date(),
  description: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  lines: z.array(quotationLineSchema).min(1, 'Au moins une ligne requise').max(50, 'Maximum 50 lignes'),
}).refine((data) => data.validUntil >= data.issueDate, {
  message: "La date de validité doit être après la date d'émission",
  path: ['validUntil'],
});

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

// Update Quotation Input
export const updateQuotationSchema = createQuotationSchema.partial().extend({
  status: z.nativeEnum(QuotationStatus).optional(),
});

export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;

// Convert Quotation to Invoice
export const convertQuotationSchema = z.object({
  quotationId: z.string().cuid(),
  invoiceIssueDate: z.coerce.date(),
  invoiceDueDate: z.coerce.date(),
  notes: z.string().max(500).optional().nullable(),
}).refine((data) => data.invoiceDueDate >= data.invoiceIssueDate, {
  message: "La date d'échéance doit être après la date d'émission",
  path: ['invoiceDueDate'],
});

export type ConvertQuotationInput = z.infer<typeof convertQuotationSchema>;

// Quotation Query Filters
export const quotationQuerySchema = z.object({
  status: z.nativeEnum(QuotationStatus).optional(),
  clientId: z.string().optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type QuotationQuery = z.infer<typeof quotationQuerySchema>;

// ─── Client ────────────────────────────────

export const createClientSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(200),
  taxId: z
    .string()
    .regex(/^\d{7}\/[A-Z]\/[A-Z]\/\d{3}$/, 'Format matricule fiscal invalide (ex: 1234567/A/M/000)')
    .optional()
    .nullable(),
  address: z.string().max(500).optional().nullable(),
  email: z.string().email('Email invalide').optional().nullable(),
  phone: z
    .string()
    .regex(/^(\+216)?\s?\d{2}\s?\d{3}\s?\d{3}$/, 'Numéro tunisien invalide')
    .optional()
    .nullable(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.partial();
export type UpdateClientInput = z.infer<typeof updateClientSchema>;