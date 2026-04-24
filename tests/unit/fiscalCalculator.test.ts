import { calcLineTotal, calcTaxBreakdown, isStampDutyApplicable, formatAmount } from '../../src/utils/fiscalCalculator';
import { VatRate, WithholdingTaxType } from '@prisma/client';

describe('fiscalCalculator', () => {

  describe('calcLineTotal', () => {
    it('calcule qté × prix unitaire', () => {
      expect(calcLineTotal(2, 350)).toBe(700);
    });

    it('arrondit à 3 décimales', () => {
      expect(calcLineTotal(3, 333.3335)).toBe(1000);
    });

    it('gère les quantités décimales', () => {
      expect(calcLineTotal(1.5, 200)).toBe(300);
    });
  });

  describe('calcTaxBreakdown — TVA 19% standard', () => {
    const lines = [
      { description: 'Service SaaS', quantity: 1, unitPrice: 2000, vatRate: 'NINETEEN' as VatRate },
    ];

    it('calcule le sous-total HT', () => {
      const result = calcTaxBreakdown(lines);
      expect(result.subtotal).toBe(2000);
    });

    it('calcule la TVA 19%', () => {
      const result = calcTaxBreakdown(lines);
      expect(result.totalVat).toBe(380);
    });

    it('applique le timbre fiscal si HT > 1 000 TND', () => {
      const result = calcTaxBreakdown(lines);
      expect(result.stampDuty).toBe(1);
    });

    it('calcule le total TTC correct', () => {
      const result = calcTaxBreakdown(lines);
      // 2000 + 380 + 1 = 2381
      expect(result.total).toBe(2381);
    });

    it('retourne la ventilation TVA par taux', () => {
      const result = calcTaxBreakdown(lines);
      expect(result.vatByRate).toHaveLength(1);
      expect(result.vatByRate[0]).toEqual({ rate: 19, base: 2000, amount: 380 });
    });
  });

  describe('calcTaxBreakdown — multi-taux TVA', () => {
    const lines = [
      { description: 'Service conseil', quantity: 1, unitPrice: 1000, vatRate: 'NINETEEN' as VatRate },
      { description: 'Médicament', quantity: 10, unitPrice: 50, vatRate: 'SEVEN' as VatRate },
      { description: 'Export', quantity: 1, unitPrice: 500, vatRate: 'ZERO' as VatRate },
    ];

    it('ventile correctement les TVA par taux', () => {
      const result = calcTaxBreakdown(lines);
      expect(result.vatByRate).toHaveLength(3); // 0%, 7%, 19% — triés

      const vat19 = result.vatByRate.find((v) => v.rate === 19);
      expect(vat19?.amount).toBe(190);

      const vat7 = result.vatByRate.find((v) => v.rate === 7);
      expect(vat7?.amount).toBe(35);

      const vat0 = result.vatByRate.find((v) => v.rate === 0);
      expect(vat0?.amount).toBe(0);
    });

    it('calcule le total HT correct', () => {
      const result = calcTaxBreakdown(lines);
      expect(result.subtotal).toBe(2000); // 1000 + 500 + 500
    });
  });

  describe('calcTaxBreakdown — timbre fiscal', () => {
    it('pas de timbre si HT <= 1 000 TND', () => {
      const lines = [{ description: 'Service', quantity: 1, unitPrice: 999, vatRate: 'NINETEEN' as VatRate }];
      const result = calcTaxBreakdown(lines);
      expect(result.stampDuty).toBe(0);
    });

    it('pas de timbre si exempt (exportation)', () => {
      const lines = [{ description: 'Export', quantity: 1, unitPrice: 5000, vatRate: 'ZERO' as VatRate }];
      const result = calcTaxBreakdown(lines, 'NONE', false);
      expect(result.stampDuty).toBe(0);
    });

    it('timbre exact à 1 000 TND — seuil non atteint', () => {
      const lines = [{ description: 'Service', quantity: 1, unitPrice: 1000, vatRate: 'NINETEEN' as VatRate }];
      const result = calcTaxBreakdown(lines);
      expect(result.stampDuty).toBe(0); // 1000 n'est PAS > 1000
    });

    it('timbre appliqué à 1 001 TND', () => {
      const lines = [{ description: 'Service', quantity: 1, unitPrice: 1001, vatRate: 'NINETEEN' as VatRate }];
      const result = calcTaxBreakdown(lines);
      expect(result.stampDuty).toBe(1);
    });
  });

  describe('calcTaxBreakdown — retenue à la source', () => {
    const lines = [{ description: 'Honoraires consultant', quantity: 1, unitPrice: 2000, vatRate: 'NINETEEN' as VatRate }];

    it('retenue HONORAIRES = 15% du HT', () => {
      const result = calcTaxBreakdown(lines, 'HONORAIRES' as WithholdingTaxType);
      expect(result.withholdingTax).toBe(300); // 15% × 2000
    });

    it('retenue MARCHES = 1.5% du HT', () => {
      const result = calcTaxBreakdown(lines, 'MARCHES' as WithholdingTaxType);
      expect(result.withholdingTax).toBe(30); // 1.5% × 2000
    });

    it('retenue déduite du total TTC', () => {
      const result = calcTaxBreakdown(lines, 'HONORAIRES' as WithholdingTaxType);
      // 2000 + 380 + 1 - 300 = 2081
      expect(result.total).toBe(2081);
    });

    it('pas de retenue par défaut', () => {
      const result = calcTaxBreakdown(lines);
      expect(result.withholdingTax).toBe(0);
    });
  });

  describe('isStampDutyApplicable', () => {
    it('retourne false si exempt', () => {
      expect(isStampDutyApplicable(5000, true)).toBe(false);
    });

    it('retourne false si sous le seuil', () => {
      expect(isStampDutyApplicable(500, false)).toBe(false);
    });

    it('retourne true si applicable', () => {
      expect(isStampDutyApplicable(1500, false)).toBe(true);
    });
  });

  describe('formatAmount', () => {
    it('formate en TND avec 3 décimales', () => {
      expect(formatAmount(1234.5, 'TND')).toBe('1234.500 TND');
    });

    it('formate en EUR avec 2 décimales', () => {
      expect(formatAmount(100, 'EUR')).toBe('100.00 EUR');
    });
  });
});
