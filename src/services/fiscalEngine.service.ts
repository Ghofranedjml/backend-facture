export interface FiscalEngineInput {
  amountHT: number;
  currency: string;
  country: string;
  clientType: 'PRO' | 'INDIVIDUAL';
  taxOverride?:
    | {
        tva?: number;
        timbre?: number;
        ras?: number;
      }
    | null;
}

export interface FiscalEngineOutput {
  tva: number;
  timbre: number;
  ras: number;
  totalTTC: number;
  details: {
    tvaRate: number;
    rasRate: number;
    appliedRules: string[];
  };
}

const COUNTRY_RULES: Record<
  string,
  {
    isLocal: boolean;
    tvaRate: number;
    stampDutyThreshold: number;
    stampDutyAmount: number;
  }
> = {
  TN: {
    isLocal: true,
    tvaRate: 19,
    stampDutyThreshold: 1000,
    stampDutyAmount: 1,
  },
  FR: {
    isLocal: false,
    tvaRate: 20,
    stampDutyThreshold: 0,
    stampDutyAmount: 0,
  },
  DZ: {
    isLocal: false,
    tvaRate: 19,
    stampDutyThreshold: 0,
    stampDutyAmount: 0,
  },
  MA: {
    isLocal: false,
    tvaRate: 20,
    stampDutyThreshold: 0,
    stampDutyAmount: 0,
  },
};

const RAS_RATES: Record<'PRO' | 'INDIVIDUAL', number> = {
  PRO: 15,
  INDIVIDUAL: 0,
};

const EXCHANGE_RATES: Record<string, number> = {
  TND: 1,
  EUR: 3.3,
  USD: 3.05,
};

const round = (n: number): number => Math.round(n * 1000) / 1000;

export class FiscalEngine {
  static calculate(input: FiscalEngineInput): FiscalEngineOutput {
    const appliedRules: string[] = [];

    const exchangeRate = EXCHANGE_RATES[input.currency] ?? 1;
    const amountInTND = input.amountHT * exchangeRate;
    const countryRule = COUNTRY_RULES[input.country] ?? COUNTRY_RULES.TN;

    let tvaRate = 0;
    let tva = 0;

    if (input.taxOverride?.tva !== undefined) {
      tva = input.taxOverride.tva;
      tvaRate = input.amountHT > 0 ? (tva / input.amountHT) * 100 : 0;
      appliedRules.push(`Override TVA: ${tva} (taux ${tvaRate.toFixed(2)}%)`);
    } else if (!countryRule.isLocal) {
      tvaRate = 0;
      tva = 0;
      appliedRules.push(`Export vers ${input.country}: TVA 0%`);
    } else {
      tvaRate = countryRule.tvaRate;
      tva = input.amountHT * (tvaRate / 100);
      appliedRules.push(`TVA ${tvaRate}% appliquee (pays: ${input.country})`);
    }

    let timbre = 0;
    const subtotalTND = amountInTND + tva * exchangeRate;

    if (input.taxOverride?.timbre !== undefined) {
      timbre = input.taxOverride.timbre;
      appliedRules.push(`Override timbre fiscal: ${timbre} TND`);
    } else if (countryRule.stampDutyThreshold > 0 && subtotalTND >= countryRule.stampDutyThreshold) {
      timbre = countryRule.stampDutyAmount;
      appliedRules.push(`Timbre fiscal applique (seuil ${countryRule.stampDutyThreshold} TND depasse)`);
    } else {
      appliedRules.push(
        `Pas de timbre fiscal (montant ${subtotalTND.toFixed(3)} TND < seuil ${countryRule.stampDutyThreshold} TND)`,
      );
    }

    let rasRate = 0;
    let ras = 0;

    if (input.taxOverride?.ras !== undefined) {
      ras = input.taxOverride.ras;
      rasRate = input.amountHT > 0 ? (ras / input.amountHT) * 100 : 0;
      appliedRules.push(`Override RAS: ${ras} (taux ${rasRate.toFixed(2)}%)`);
    } else if (input.clientType === 'PRO') {
      rasRate = RAS_RATES.PRO;
      ras = input.amountHT * (rasRate / 100);
      appliedRules.push(`RAS ${rasRate}% appliquee (client professionnel)`);
    } else {
      appliedRules.push('Pas de RAS (client particulier)');
    }

    const totalTTC = input.amountHT + tva + timbre - ras;

    return {
      tva: round(tva),
      timbre: round(timbre),
      ras: round(ras),
      totalTTC: round(totalTTC),
      details: {
        tvaRate: round(tvaRate),
        rasRate: round(rasRate),
        appliedRules,
      },
    };
  }

  static calculateForInvoice(invoice: {
    subtotal: number;
    currency: string;
    client: { country?: string; type?: 'PRO' | 'INDIVIDUAL' };
    withholdingTaxType?: string;
  }): FiscalEngineOutput {
    return this.calculate({
      amountHT: invoice.subtotal,
      currency: invoice.currency,
      country: invoice.client.country ?? 'TN',
      clientType: invoice.client.type ?? 'PRO',
      taxOverride: null,
    });
  }

  static validateInvoice(invoice: {
    subtotal: number;
    totalVat: number;
    stampDuty: number;
    withholdingTax: number;
    total: number;
    currency: string;
    client: { country?: string; type?: 'PRO' | 'INDIVIDUAL' };
  }): { isValid: boolean; differences: Record<string, number>; expected: FiscalEngineOutput } {
    const expected = this.calculate({
      amountHT: invoice.subtotal,
      currency: invoice.currency,
      country: invoice.client.country ?? 'TN',
      clientType: invoice.client.type ?? 'PRO',
    });

    const differences: Record<string, number> = {};

    if (Math.abs(invoice.totalVat - expected.tva) > 0.01) {
      differences.tva = round(invoice.totalVat - expected.tva);
    }
    if (Math.abs(invoice.stampDuty - expected.timbre) > 0.01) {
      differences.timbre = round(invoice.stampDuty - expected.timbre);
    }
    if (Math.abs(invoice.withholdingTax - expected.ras) > 0.01) {
      differences.ras = round(invoice.withholdingTax - expected.ras);
    }
    if (Math.abs(invoice.total - expected.totalTTC) > 0.01) {
      differences.totalTTC = round(invoice.total - expected.totalTTC);
    }

    return {
      isValid: Object.keys(differences).length === 0,
      differences,
      expected,
    };
  }
}
