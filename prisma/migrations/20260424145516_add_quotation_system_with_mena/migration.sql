-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REFUSED', 'EXPIRED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "VatSystem" AS ENUM ('STANDARD', 'GCC', 'CEMAC', 'NONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Currency" ADD VALUE 'DZD';
ALTER TYPE "Currency" ADD VALUE 'MAD';
ALTER TYPE "Currency" ADD VALUE 'LYD';
ALTER TYPE "Currency" ADD VALUE 'EGP';
ALTER TYPE "Currency" ADD VALUE 'SAR';
ALTER TYPE "Currency" ADD VALUE 'AED';
ALTER TYPE "Currency" ADD VALUE 'QAR';
ALTER TYPE "Currency" ADD VALUE 'OMR';
ALTER TYPE "Currency" ADD VALUE 'KWD';
ALTER TYPE "Currency" ADD VALUE 'BHD';
ALTER TYPE "Currency" ADD VALUE 'JOD';
ALTER TYPE "Currency" ADD VALUE 'LBP';
ALTER TYPE "Currency" ADD VALUE 'SYP';
ALTER TYPE "Currency" ADD VALUE 'IQD';
ALTER TYPE "Currency" ADD VALUE 'IRR';
ALTER TYPE "Currency" ADD VALUE 'YER';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "country_code" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "auto_detected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "country_code" TEXT,
ADD COLUMN     "quotation_id" TEXT;

-- CreateTable
CREATE TABLE "countries" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency_code" "Currency" NOT NULL,
    "phone_code" TEXT NOT NULL,
    "vatSystem" "VatSystem" NOT NULL DEFAULT 'STANDARD',
    "hasVat" BOOLEAN NOT NULL DEFAULT true,
    "has_stamp_duty" BOOLEAN NOT NULL DEFAULT true,
    "stamp_duty_amount" DECIMAL(15,3) DEFAULT 1,
    "default_vat_rate" DOUBLE PRECISION NOT NULL DEFAULT 19,
    "keywords" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "vat_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rules" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "quotation_number" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" "Currency" NOT NULL DEFAULT 'TND',
    "subtotal" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "totalVat" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "stampDuty" DECIMAL(15,3) NOT NULL DEFAULT 1,
    "withholdingTax" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "withholding_tax_type" "WithholdingTaxType" NOT NULL DEFAULT 'NONE',
    "manual_vat_rate" DOUBLE PRECISION,
    "vat_category_id" TEXT,
    "detected_vat_rate" DOUBLE PRECISION,
    "use_intelligent_vat" BOOLEAN NOT NULL DEFAULT false,
    "country_code" TEXT,
    "auto_detected" BOOLEAN NOT NULL DEFAULT false,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "email_sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "converted_to_invoice_id" TEXT,
    "notes" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_lines" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit_price" DECIMAL(15,3) NOT NULL,
    "vat_rate" DOUBLE PRECISION NOT NULL,
    "line_total" DECIMAL(15,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "from_currency" "Currency" NOT NULL,
    "to_currency" "Currency" NOT NULL,
    "rate" DECIMAL(15,6) NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotation_number_key" ON "quotations"("quotation_number");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_converted_to_invoice_id_key" ON "quotations"("converted_to_invoice_id");

-- CreateIndex
CREATE INDEX "quotations_user_id_idx" ON "quotations"("user_id");

-- CreateIndex
CREATE INDEX "quotations_client_id_idx" ON "quotations"("client_id");

-- CreateIndex
CREATE INDEX "quotations_status_idx" ON "quotations"("status");

-- CreateIndex
CREATE INDEX "quotations_issue_date_idx" ON "quotations"("issue_date");

-- CreateIndex
CREATE INDEX "quotations_quotation_number_idx" ON "quotations"("quotation_number");

-- CreateIndex
CREATE INDEX "quotations_country_code_idx" ON "quotations"("country_code");

-- CreateIndex
CREATE INDEX "quotation_lines_quotation_id_idx" ON "quotation_lines"("quotation_id");

-- CreateIndex
CREATE INDEX "exchange_rates_from_currency_to_currency_isActive_idx" ON "exchange_rates"("from_currency", "to_currency", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_from_currency_to_currency_effective_date_key" ON "exchange_rates"("from_currency", "to_currency", "effective_date");

-- CreateIndex
CREATE INDEX "invoices_quotation_id_idx" ON "invoices"("quotation_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_vat_category_id_fkey" FOREIGN KEY ("vat_category_id") REFERENCES "vat_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_converted_to_invoice_id_fkey" FOREIGN KEY ("converted_to_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
