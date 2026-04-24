export interface FiscalEngineInput {
  amountHT: number;
  currency: string;
  country: string;          // code ISO 2 lettres ex: 'TN', 'MA', 'SA'
  clientType: 'PRO' | 'INDIVIDUAL';
  withholdingTaxType?: 'NONE' | 'HONORAIRES' | 'LOYERS' | 'MARCHES';
  taxOverride?: {
    tva?: number;
    timbre?: number;
    ras?: number;
  } | null;
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
    country: string;
    currency: string;
  };
}

// ─── Règles fiscales par pays MENA ────────────────────────
const COUNTRY_RULES: Record<string, {
  name: string;
  isLocal: boolean;          // true = règles locales s'appliquent
  tvaRate: number;           // taux TVA standard %
  stampDutyThreshold: number; // seuil timbre (0 = pas de timbre)
  stampDutyAmount: number;   // montant fixe timbre
}> = {
  // ── Maghreb ──────────────────────────────────────────────
  TN: { name: 'Tunisie',     isLocal: true,  tvaRate: 19, stampDutyThreshold: 1000, stampDutyAmount: 1 },
  MA: { name: 'Maroc',       isLocal: false, tvaRate: 20, stampDutyThreshold: 0,    stampDutyAmount: 0 },
  DZ: { name: 'Algérie',     isLocal: false, tvaRate: 19, stampDutyThreshold: 0,    stampDutyAmount: 0 },
  LY: { name: 'Libye',       isLocal: false, tvaRate: 0,  stampDutyThreshold: 0,    stampDutyAmount: 0 },
  MR: { name: 'Mauritanie',  isLocal: false, tvaRate: 16, stampDutyThreshold: 0,    stampDutyAmount: 0 },

  // ── Mashreq ──────────────────────────────────────────────
  EG: { name: 'Égypte',      isLocal: false, tvaRate: 14, stampDutyThreshold: 0,    stampDutyAmount: 0 },
  LB: { name: 'Liban',       isLocal: false, tvaRate: 11, stampDutyThreshold: 0,    stampDutyAmount: 0 },
  JO: { name: 'Jordanie',    isLocal: false, tvaRate: 16, stampDutyThreshold: 0,    stampDutyAmount: 0 },
  SY: { name: 'Syrie',       isLocal: false, tvaRate: 11, stampDutyThreshold: 0,    stampDutyAmount: 0 },
  IQ: { name: 'Irak',        isLocal: false, tvaRate: 0,  stampDutyThreshold: 0,    stampDutyAmount: 0 },
  SD: { name: 'Soudan',      isLocal: false, tvaRate: 17, stampDutyThreshold: 0,    stampDutyAmount: 0 },
  YE: { name: 'Yémen',       isLocal: false, tvaRate: 5,  stampDutyThreshold: 0,    stampDutyAmount: 0 },

  // ── Golfe ────────────────────────────────────────────────
  SA: { name: 'Arabie Saoudite', isLocal: false, tvaRate: 15, stampDutyThreshold: 0, stampDutyAmount: 0 },
  AE: { name: 'Émirats Arabes', isLocal: false, tvaRate: 5,  stampDutyThreshold: 0,  stampDutyAmount: 0 },
  QA: { name: 'Qatar',       isLocal: false, tvaRate: 0,  stampDutyThreshold: 0,    stampDutyAmount: 0 },
  KW: { name: 'Koweït',      isLocal: false, tvaRate: 0,  stampDutyThreshold: 0,    stampDutyAmount: 0 },
  BH: { name: 'Bahreïn',     isLocal: false, tvaRate: 10, stampDutyThreshold: 0,    stampDutyAmount: 0 },
  OM: { name: 'Oman',        isLocal: false, tvaRate: 5,  stampDutyThreshold: 0,    stampDutyAmount: 0 },

  // ── Europe / International ───────────────────────────────
  FR: { name: 'France',      isLocal: false, tvaRate: 0,  stampDutyThreshold: 0,    stampDutyAmount: 0 },
  DE: { name: 'Allemagne',   isLocal: false, tvaRate: 0,  stampDutyThreshold: 0,    stampDutyAmount: 0 },
  GB: { name: 'Royaume-Uni', isLocal: false, tvaRate: 0,  stampDutyThreshold: 0,    stampDutyAmount: 0 },
  US: { name: 'États-Unis',  isLocal: false, tvaRate: 0,  stampDutyThreshold: 0,    stampDutyAmount: 0 },
};

// ─── Mapping mot → code ISO ───────────────────────────────
// Permet de lire le pays depuis le dernier mot de l'adresse
const CITY_TO_COUNTRY: Record<string, string> = {
  // Tunisie
  'tunis': 'TN', 'sfax': 'TN', 'sousse': 'TN', 'bizerte': 'TN',
  'kairouan': 'TN', 'monastir': 'TN', 'nabeul': 'TN', 'gafsa': 'TN',
  'tunisie': 'TN', 'tunisia': 'TN',
  // Maroc
  'casablanca': 'MA', 'rabat': 'MA', 'marrakech': 'MA', 'fès': 'MA',
  'fez': 'MA', 'tanger': 'MA', 'agadir': 'MA', 'maroc': 'MA', 'morocco': 'MA',
  // Algérie
  'alger': 'DZ', 'oran': 'DZ', 'constantine': 'DZ', 'algérie': 'DZ', 'algeria': 'DZ',
  // Égypte
  'cairo': 'EG', 'caire': 'EG', 'alexandrie': 'EG', 'égypte': 'EG', 'egypt': 'EG',
  // Arabie Saoudite
  'riyadh': 'SA', 'jeddah': 'SA', 'djeddah': 'SA', 'mecque': 'SA', 'saudi': 'SA',
  // Émirats
  'dubai': 'AE', 'dubaï': 'AE', 'abudhabi': 'AE', 'sharjah': 'AE', 'emirates': 'AE',
  // Qatar
  'doha': 'QA', 'qatar': 'QA',
  // Koweït
  'kuwait': 'KW', 'koweït': 'KW',
  // Jordanie
  'amman': 'JO', 'jordanie': 'JO', 'jordan': 'JO',
  // Liban
  'beyrouth': 'LB', 'beirut': 'LB', 'liban': 'LB', 'lebanon': 'LB',
  // Libye
  'tripoli': 'LY', 'benghazi': 'LY', 'libye': 'LY', 'libya': 'LY',
  // France / Europe
  'paris': 'FR', 'lyon': 'FR', 'marseille': 'FR', 'france': 'FR',
  'berlin': 'DE', 'munich': 'DE', 'allemagne': 'DE', 'germany': 'DE',
  'london': 'GB', 'londres': 'GB', 'uk': 'GB',
};

// ─── RAS tunisienne — 3 types ─────────────────────────────
const RAS_RATES: Record<string, number> = {
  NONE:        0,
  HONORAIRES:  15,   // professions libérales, consultants
  LOYERS:      15,   // locations immobilières
  MARCHES:     1.5,  // marchés publics
};

// ─── Taux de change vers TND ──────────────────────────────
const EXCHANGE_RATES: Record<string, number> = {
  TND: 1,
  EUR: 3.35,
  USD: 3.08,
  MAD: 0.31,   // Dirham marocain
  DZD: 0.023,  // Dinar algérien
  EGP: 0.065,  // Livre égyptienne
  SAR: 0.82,   // Riyal saoudien
  AED: 0.84,   // Dirham émirati
  QAR: 0.85,   // Riyal qatari
  KWD: 10.1,   // Dinar koweïtien
  JOD: 4.35,   // Dinar jordanien
  LBP: 0.00034,// Livre libanaise
  LYD: 0.64,   // Dinar libyen
  BHD: 8.2,    // Dinar bahreïni
  OMR: 8.0,    // Rial omanais
  GBP: 3.95,   // Livre sterling
};

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

// ─── Extraction pays depuis adresse ───────────────────────
export function extractCountryFromAddress(address: string | null | undefined): string {
  if (!address || address.trim() === '') return 'TN'; // défaut Tunisie

  // Prendre le dernier mot non vide de l'adresse
  const words = address.trim().split(/[\s,]+/).filter(Boolean);
  if (words.length === 0) return 'TN';

  const lastWord = words[words.length - 1].toLowerCase().trim();

  // 1. Vérifier si c'est directement un code ISO (ex: "TN", "MA")
  const upperWord = lastWord.toUpperCase();
  if (COUNTRY_RULES[upperWord]) return upperWord;

  // 2. Chercher dans le mapping ville/pays
  if (CITY_TO_COUNTRY[lastWord]) return CITY_TO_COUNTRY[lastWord];

  // 3. Essayer aussi l'avant-dernier mot (cas: "1000 Tunis, Tunisie")
  if (words.length >= 2) {
    const secondLast = words[words.length - 2].toLowerCase().trim();
    if (CITY_TO_COUNTRY[secondLast]) return CITY_TO_COUNTRY[secondLast];
  }

  // 4. Défaut : Tunisie
  return 'TN';
}

// ─── Moteur fiscal principal ──────────────────────────────
export class FiscalEngine {
  static calculate(input: FiscalEngineInput): FiscalEngineOutput {
    const appliedRules: string[] = [];
    const countryRule = COUNTRY_RULES[input.country] ?? COUNTRY_RULES['TN'];
    const exchangeRate = EXCHANGE_RATES[input.currency] ?? 1;
    const amountInTND = input.amountHT * exchangeRate;

    // ── TVA ──────────────────────────────────────────────
    let tvaRate = 0;
    let tva = 0;

    if (input.taxOverride?.tva !== undefined) {
      tva = input.taxOverride.tva;
      tvaRate = input.amountHT > 0 ? (tva / input.amountHT) * 100 : 0;
      appliedRules.push(`Override TVA manuel : ${tva.toFixed(3)} (taux ${tvaRate.toFixed(2)}%)`);
    } else if (!countryRule.isLocal || input.country !== 'TN') {
      // Export ou pays étranger : TVA selon règles du pays destinataire
      tvaRate = countryRule.tvaRate;
      tva = input.amountHT * (tvaRate / 100);
      if (tvaRate === 0) {
        appliedRules.push(`Export vers ${countryRule.name} : TVA 0% (exonéré)`);
      } else {
        appliedRules.push(`TVA ${tvaRate}% appliquée (${countryRule.name})`);
      }
    } else {
      // Tunisie locale — taux standard 19%
      tvaRate = countryRule.tvaRate;
      tva = input.amountHT * (tvaRate / 100);
      appliedRules.push(`TVA ${tvaRate}% appliquée (Tunisie - taux standard)`);
    }

    // ── Timbre fiscal ────────────────────────────────────
    let timbre = 0;
    const subtotalTND = amountInTND + tva * exchangeRate;

    if (input.taxOverride?.timbre !== undefined) {
      timbre = input.taxOverride.timbre;
      appliedRules.push(`Override timbre fiscal manuel : ${timbre} TND`);
    } else if (
      countryRule.stampDutyThreshold > 0 &&
      subtotalTND > countryRule.stampDutyThreshold
    ) {
      timbre = countryRule.stampDutyAmount;
      appliedRules.push(
        `Timbre fiscal ${timbre} TND appliqué (HT ${subtotalTND.toFixed(3)} TND > seuil ${countryRule.stampDutyThreshold} TND)`,
      );
    } else {
      appliedRules.push(`Pas de timbre fiscal applicable`);
    }

    // ── Retenue à la source ──────────────────────────────
    let rasRate = 0;
    let ras = 0;
    const rasType = input.withholdingTaxType ?? 'NONE';

    if (input.taxOverride?.ras !== undefined) {
      ras = input.taxOverride.ras;
      rasRate = input.amountHT > 0 ? (ras / input.amountHT) * 100 : 0;
      appliedRules.push(`Override RAS manuel : ${ras.toFixed(3)} (taux ${rasRate.toFixed(2)}%)`);
    } else if (input.country === 'TN' && rasType !== 'NONE') {
      // RAS tunisienne — 3 types
      rasRate = RAS_RATES[rasType] ?? 0;
      ras = input.amountHT * (rasRate / 100);
      const rasLabel: Record<string, string> = {
        HONORAIRES: 'honoraires / professions libérales',
        LOYERS: 'locations immobilières',
        MARCHES: 'marchés publics',
      };
      appliedRules.push(
        `RAS ${rasRate}% appliquée (${rasLabel[rasType] ?? rasType})`,
      );
    } else {
      appliedRules.push(
        input.country !== 'TN'
          ? `Pas de RAS (pays non-tunisien : ${countryRule.name})`
          : 'Pas de RAS (type : NONE)',
      );
    }

    const totalTTC = input.amountHT + tva + timbre - ras;

    return {
      tva: round3(tva),
      timbre: round3(timbre),
      ras: round3(ras),
      totalTTC: round3(totalTTC),
      details: {
        tvaRate: round3(tvaRate),
        rasRate: round3(rasRate),
        appliedRules,
        country: `${input.country} — ${countryRule.name}`,
        currency: input.currency,
      },
    };
  }

  // ─── Calcul depuis une facture/devis ─────────────────
  static calculateForDocument(doc: {
    subtotal: number;
    currency: string;
    withholdingTaxType?: string;
    client: {
      /** Pas de champ pays en BDD : le pays est déduit du dernier mot de l’adresse. */
      address?: string | null;
      type?: 'PRO' | 'INDIVIDUAL';
    };
    taxOverride?: { tva?: number; timbre?: number; ras?: number } | null;
  }): FiscalEngineOutput {
    const country = extractCountryFromAddress(doc.client.address);

    return this.calculate({
      amountHT: doc.subtotal,
      currency: doc.currency,
      country,
      clientType: doc.client.type ?? 'PRO',
      withholdingTaxType: (doc.withholdingTaxType as 'NONE' | 'HONORAIRES' | 'LOYERS' | 'MARCHES') ?? 'NONE',
      taxOverride: doc.taxOverride ?? null,
    });
  }

  // ─── Validation cohérence facture ────────────────────
  static validateDocument(doc: {
    subtotal: number;
    totalVat: number;
    stampDuty: number;
    withholdingTax: number;
    total: number;
    currency: string;
    withholdingTaxType?: string;
    client: {
      address?: string | null;
      type?: 'PRO' | 'INDIVIDUAL';
    };
  }): {
    isValid: boolean;
    differences: Record<string, number>;
    expected: FiscalEngineOutput;
  } {
    const expected = this.calculateForDocument(doc);
    const differences: Record<string, number> = {};

    if (Math.abs(doc.totalVat - expected.tva) > 0.01)
      differences.tva = round3(doc.totalVat - expected.tva);
    if (Math.abs(doc.stampDuty - expected.timbre) > 0.01)
      differences.timbre = round3(doc.stampDuty - expected.timbre);
    if (Math.abs(doc.withholdingTax - expected.ras) > 0.01)
      differences.ras = round3(doc.withholdingTax - expected.ras);
    if (Math.abs(doc.total - expected.totalTTC) > 0.01)
      differences.totalTTC = round3(doc.total - expected.totalTTC);

    return {
      isValid: Object.keys(differences).length === 0,
      differences,
      expected,
    };
  }

  /** Alias sémantique « facture » — le pays vient uniquement de `client.address`. */
  static validateInvoice(invoice: {
    subtotal: number;
    totalVat: number;
    stampDuty: number;
    withholdingTax: number;
    total: number;
    currency: string;
    withholdingTaxType?: string;
    client: { address?: string | null; type?: 'PRO' | 'INDIVIDUAL' };
  }): {
    isValid: boolean;
    differences: Record<string, number>;
    expected: FiscalEngineOutput;
  } {
    return this.validateDocument(invoice);
  }

  // ─── Utilitaire : liste des pays MENA supportés ──────
  static getSupportedCountries(): { code: string; name: string; tvaRate: number }[] {
    return Object.entries(COUNTRY_RULES).map(([code, rule]) => ({
      code,
      name: rule.name,
      tvaRate: rule.tvaRate,
    }));
  }

  // ─── Utilitaire : taux de change ─────────────────────
  static getExchangeRate(currency: string): number {
    return EXCHANGE_RATES[currency] ?? 1;
  }
}

