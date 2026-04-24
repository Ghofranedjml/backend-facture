import { VatRate, WithholdingTaxType } from '@prisma/client';
import {
  VAT_RATES,
  WITHHOLDING_RATES,
  STAMP_DUTY_THRESHOLD,
  STAMP_DUTY_AMOUNT,
  LineInput,
  TaxBreakdown,
} from '../types';

/**
 * Arrondit à 3 décimales (précision TND standard)
 */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Calcule le montant HT d'une ligne
 */
export function calcLineTotal(qty: number, unitPrice: number): number {
  return round3(qty * unitPrice);
}

/**
 * Calcule la décomposition fiscale complète d'une facture
 * selon la réglementation tunisienne en vigueur.
 *
 * TVA : 4 taux (0%, 7%, 13%, 19%) — ventilée par taux
 * Timbre fiscal : 1 TND si total HT > 1 000 TND (sauf exportations)
 * Retenue à la source : HONORAIRES 15%, LOYERS 15%, MARCHÉS 1.5%
 */
export function calcTaxBreakdown(
  lines: LineInput[],
  withholdingTaxType: WithholdingTaxType = 'NONE',
  applyStampDuty = true,
): TaxBreakdown {
  // 1. Calculer HT total et TVA par taux
  const vatAccumulator: Partial<Record<VatRate, { base: number; amount: number }>> = {};

  let subtotal = 0;

  for (const line of lines) {
    const lineTotal = calcLineTotal(line.quantity, line.unitPrice);
    subtotal += lineTotal;

    const vatRate = line.vatRate;
    const vatAmount = round3(lineTotal * VAT_RATES[vatRate] / 100);

    if (!vatAccumulator[vatRate]) {
      vatAccumulator[vatRate] = { base: 0, amount: 0 };
    }
    vatAccumulator[vatRate]!.base += lineTotal;
    vatAccumulator[vatRate]!.amount += vatAmount;
  }

  subtotal = round3(subtotal);

  // 2. Construire le tableau TVA par taux
  const vatByRate = (Object.entries(vatAccumulator) as [VatRate, { base: number; amount: number }][])
    .filter(([, v]) => v.base > 0)
    .map(([rateKey, v]) => ({
      rate: VAT_RATES[rateKey],
      base: round3(v.base),
      amount: round3(v.amount),
    }))
    .sort((a, b) => a.rate - b.rate);

  const totalVat = round3(vatByRate.reduce((sum, v) => sum + v.amount, 0));

  // 3. Timbre fiscal
  // Applicable si : montant HT > 1 000 TND ET applyStampDuty = true
  // Exonérations : exportations (TVA 0% uniquement), secteur bancaire (géré via applyStampDuty)
  const stampDuty = applyStampDuty && subtotal > STAMP_DUTY_THRESHOLD
    ? STAMP_DUTY_AMOUNT
    : 0;

  // 4. Retenue à la source (calculée sur le montant HT)
  const withholdingRate = WITHHOLDING_RATES[withholdingTaxType];
  const withholdingTax = round3(subtotal * withholdingRate / 100);

  // 5. Total TTC = HT + TVA + Timbre - Retenue (déduite à la source)
  const total = round3(subtotal + totalVat + stampDuty - withholdingTax);

  return {
    subtotal,
    vatByRate,
    totalVat,
    stampDuty,
    withholdingTax,
    total,
  };
}

/**
 * Vérifie si le timbre fiscal est applicable
 * Exonérations légales : exportations, secteur bancaire
 */
export function isStampDutyApplicable(
  subtotal: number,
  hasExemption: boolean,
): boolean {
  if (hasExemption) return false;
  return subtotal > STAMP_DUTY_THRESHOLD;
}

/**
 * Formate un montant en TND avec 3 décimales (norme tunisienne)
 */
export function formatAmount(amount: number, currency = 'TND'): string {
  const decimals = currency === 'TND' ? 3 : 2;
  return `${amount.toFixed(decimals)} ${currency}`;
}
