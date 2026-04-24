import { InvoiceStatus, Currency, VatRate, WithholdingTaxType } from '@prisma/client';

// ─── Re-exports Prisma enums ───────────────
export { InvoiceStatus, Currency, VatRate, WithholdingTaxType };

// ─── JWT Payload ───────────────────────────
export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// ─── Express augmentation ──────────────────
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ─── API Response wrappers ─────────────────
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Fiscal calculation types ──────────────

// Taux de TVA numériques correspondants aux enum Prisma
export const VAT_RATES: Record<VatRate, number> = {
  ZERO: 0,
  SEVEN: 7,
  THIRTEEN: 13,
  NINETEEN: 19,
};

// Taux de retenue à la source
export const WITHHOLDING_RATES: Record<WithholdingTaxType, number> = {
  NONE: 0,
  HONORAIRES: 15,
  LOYERS: 15,
  MARCHES: 1.5,
};

// Seuil timbre fiscal (en TND)
export const STAMP_DUTY_THRESHOLD = 1000;
export const STAMP_DUTY_AMOUNT = 1;

export interface LineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: VatRate;
  position?: number;
}

export interface TaxBreakdown {
  subtotal: number;       // Total HT
  vatByRate: {            // TVA ventilée par taux
    rate: number;
    base: number;
    amount: number;
  }[];
  totalVat: number;       // Total TVA
  stampDuty: number;      // Timbre fiscal (0 ou 1 TND)
  withholdingTax: number; // Retenue à la source
  total: number;          // Total TTC
}


// ─── Invoice query filters ─────────────────
export interface InvoiceFilters {
  status?: InvoiceStatus;
  currency?: Currency;
  clientId?: string;
  search?: string;       // recherche sur numéro ou nom client
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

// ─── Dashboard types ───────────────────────
export * from './dashboard.types';
