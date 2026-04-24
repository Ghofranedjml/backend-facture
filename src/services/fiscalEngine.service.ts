export interface FiscalEngineInput {
  amountHT: number;
  serviceDescription: string;  // Key new field!
  clientAddress: string | null | undefined;
  clientType: 'PRO' | 'INDIVIDUAL';
  withholdingTaxType?: 'NONE' | 'HONORAIRES' | 'LOYERS' | 'MARCHES';
  manualOverride?: {
    tva?: number;
    timbre?: number;
    ras?: number;
  } | null;
}

export interface FiscalEngineOutput {
  detectedCountry: string;
  detectedCurrency: string;
  tvaRate: number;
  tvaAmount: number;
  timbreAmount: number;
  rasAmount: number;
  totalTTC: number;
  appliedRules: string[];
}

// ─── Country → Currency + Address keywords ─────────────────
const COUNTRY_DATA: Record<string, {
  name: string;
  currency: string;
  keywords: string[];
  defaultVatRate: number;
  hasStampDuty: boolean;
  stampDutyAmount: number;
  stampDutyThreshold: number;
}> = {
  // North Africa
  TN: { name: 'Tunisia', currency: 'TND', keywords: ['tunis', 'tunisie', 'تونس', 'tn'], defaultVatRate: 19, hasStampDuty: true, stampDutyAmount: 1, stampDutyThreshold: 1000 },
  DZ: { name: 'Algeria', currency: 'DZD', keywords: ['alger', 'algérie', 'الجزائر', 'dz'], defaultVatRate: 19, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
  MA: { name: 'Morocco', currency: 'MAD', keywords: ['maroc', 'morocco', 'المغرب', 'ma'], defaultVatRate: 20, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
  LY: { name: 'Libya', currency: 'LYD', keywords: ['libye', 'libya', 'ليبيا', 'ly'], defaultVatRate: 0, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
  EG: { name: 'Egypt', currency: 'EGP', keywords: ['egypte', 'egypt', 'مصر', 'eg'], defaultVatRate: 14, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
  
  // GCC
  SA: { name: 'Saudi Arabia', currency: 'SAR', keywords: ['saudi', 'arabie', 'saoudite', 'sa'], defaultVatRate: 15, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
  AE: { name: 'UAE', currency: 'AED', keywords: ['emirates', 'uae', 'emirats', 'ae', 'dubai', 'dubaï', 'abudhabi'], defaultVatRate: 5, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
  QA: { name: 'Qatar', currency: 'QAR', keywords: ['qatar', 'قطر', 'qa'], defaultVatRate: 0, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
  KW: { name: 'Kuwait', currency: 'KWD', keywords: ['kuwait', 'koweït', 'الكويت', 'kw'], defaultVatRate: 0, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
  BH: { name: 'Bahrain', currency: 'BHD', keywords: ['bahrain', 'البحرين', 'bh'], defaultVatRate: 10, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
  OM: { name: 'Oman', currency: 'OMR', keywords: ['oman', 'عمان', 'om'], defaultVatRate: 5, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
  
  // Other
  JO: { name: 'Jordan', currency: 'JOD', keywords: ['jordan', 'jordanie', 'الأردن', 'jo'], defaultVatRate: 16, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
  LB: { name: 'Lebanon', currency: 'LBP', keywords: ['lebanon', 'liban', 'لبنان', 'lb'], defaultVatRate: 11, hasStampDuty: false, stampDutyAmount: 0, stampDutyThreshold: 0 },
};

// ─── INTELLIGENT VAT RULES: Category + Country → Rate ─────
// This is the CORE intelligence - system reads description and applies correct rate
const VAT_RULES: Array<{
  category: string;
  keywords: string[];
  rates: Record<string, number>;  // countryCode -> vatRate
}> = [
  {
    category: 'Standard Consulting',
    keywords: ['consulting', 'conseil', 'consultant', 'strategy', 'stratégie', 'management', 'it service', 'software', 'logiciel', 'development', 'développement', 'saas', 'platform', 'plateforme'],
    rates: { TN: 19, MA: 20, EG: 14, SA: 15, AE: 5, DZ: 19, JO: 16, LB: 11, default: 19 }
  },
  {
    category: 'Banking & Financial',
    keywords: ['bank', 'banque', 'financial', 'financier', 'loan', 'prêt', 'credit', 'insurance', 'assurance', 'investment', 'investissement'],
    rates: { TN: 13, MA: 14, EG: 14, SA: 15, AE: 5, DZ: 19, default: 13 }
  },
  {
    category: 'Food & Agriculture',
    keywords: ['food', 'nourriture', 'aliment', 'agriculture', 'agri', 'fruit', 'légume', 'viande', 'meat', 'bread', 'pain'],
    rates: { TN: 7, MA: 7, EG: 5, SA: 0, AE: 0, DZ: 9, default: 7 }
  },
  {
    category: 'Medical & Healthcare',
    keywords: ['medical', 'médical', 'health', 'santé', 'medicine', 'médicament', 'clinic', 'clinique', 'hospital', 'hôpital', 'doctor', 'médecin'],
    rates: { TN: 7, MA: 7, EG: 5, SA: 0, AE: 0, DZ: 9, default: 7 }
  },
  {
    category: 'Education & Training',
    keywords: ['education', 'formation', 'school', 'école', 'training', 'cours', 'course', 'university', 'université', 'teaching', 'enseignement'],
    rates: { TN: 0, MA: 0, EG: 0, SA: 0, AE: 0, DZ: 0, default: 0 }
  },
  {
    category: 'Export & International',
    keywords: ['export', 'exportation', 'international', 'outside', 'hors tunisie', 'foreign', 'étranger', 'cross border'],
    rates: { TN: 0, MA: 0, EG: 0, SA: 0, AE: 0, DZ: 0, default: 0 }
  },
  {
    category: 'Real Estate & Construction',
    keywords: ['real estate', 'immobilier', 'construction', 'building', 'bâtiment', 'property', 'propriété', 'rent', 'location'],
    rates: { TN: 19, MA: 20, EG: 14, SA: 15, AE: 5, default: 19 }
  },
  {
    category: 'Transport & Logistics',
    keywords: ['transport', 'logistics', 'logistique', 'shipping', 'livraison', 'delivery', 'freight', 'fret'],
    rates: { TN: 19, MA: 20, EG: 14, SA: 15, AE: 5, default: 19 }
  }
];

// ─── Withholding Tax (RAS) Rules ──────────────────────────
const RAS_RULES: Record<string, {
  description: string;
  rate: number;
  keywords: string[];
}> = {
  HONORAIRES: { description: 'Honoraires / Professions libérales', rate: 15, keywords: ['consulting', 'conseil', 'honoraires', 'profession libérale', 'freelance'] },
  LOYERS: { description: 'Locations immobilières', rate: 15, keywords: ['location', 'loyer', 'rent', 'leasing'] },
  MARCHES: { description: 'Marchés publics / Sous-traitance', rate: 1.5, keywords: ['marché public', 'sous-traitance', 'public tender'] },
};

// ─── Exchange Rates (to TND for reference) ─────────────────
const EXCHANGE_RATES: Record<string, number> = {
  TND: 1, EUR: 3.35, USD: 3.08, MAD: 0.31, DZD: 0.023, EGP: 0.065,
  SAR: 0.82, AED: 0.84, QAR: 0.85, KWD: 10.1, JOD: 4.35, LBP: 0.00034,
  LYD: 0.64, BHD: 8.2, OMR: 8.0, GBP: 3.95,
};

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

// ─── Extract country from address (last word) ─────────────
export function detectCountryFromAddress(address: string | null | undefined): string {
  if (!address || address.trim() === '') return 'TN';
  
  const words = address.trim().split(/[\s,]+/).filter(Boolean);
  if (words.length === 0) return 'TN';
  
  const lastWord = words[words.length - 1].toLowerCase().trim();
  const upperWord = lastWord.toUpperCase();
  
  // Direct match by code
  if (COUNTRY_DATA[upperWord]) return upperWord;
  
  // Match by keyword
  for (const [code, data] of Object.entries(COUNTRY_DATA)) {
    if (data.keywords.some(k => lastWord.includes(k) || k.includes(lastWord))) {
      return code;
    }
  }
  
  // Check second-to-last word
  if (words.length >= 2) {
    const secondLast = words[words.length - 2].toLowerCase().trim();
    for (const [code, data] of Object.entries(COUNTRY_DATA)) {
      if (data.keywords.some(k => secondLast.includes(k) || k.includes(secondLast))) {
        return code;
      }
    }
  }
  
  return 'TN'; // Default Tunisia
}

// ─── Detect VAT rate intelligently from description ──────
function detectVatRate(serviceDescription: string, countryCode: string): { rate: number; category: string } {
  const lowerDesc = serviceDescription.toLowerCase();
  
  // Find matching category
  for (const rule of VAT_RULES) {
    if (rule.keywords.some(keyword => lowerDesc.includes(keyword))) {
      const rate = rule.rates[countryCode] ?? rule.rates.default ?? COUNTRY_DATA[countryCode]?.defaultVatRate ?? 19;
      return { rate, category: rule.category };
    }
  }
  
  // Default to standard rate for the country
  const defaultRate = COUNTRY_DATA[countryCode]?.defaultVatRate ?? 19;
  return { rate: defaultRate, category: 'Standard (no category match)' };
}

// ─── Detect Withholding Tax Type from description ────────
function detectWithholdingTaxType(serviceDescription: string, countryCode: string): 'NONE' | 'HONORAIRES' | 'LOYERS' | 'MARCHES' {
  if (countryCode !== 'TN') return 'NONE'; // Only Tunisia has RAS
  
  const lowerDesc = serviceDescription.toLowerCase();
  
  for (const [type, rule] of Object.entries(RAS_RULES)) {
    if (rule.keywords.some(keyword => lowerDesc.includes(keyword))) {
      return type as any;
    }
  }
  
  return 'NONE';
}

// ─── MAIN INTELLIGENT FISCAL ENGINE ──────────────────────
export class FiscalEngine {
  
  static calculate(input: FiscalEngineInput): FiscalEngineOutput {
    const appliedRules: string[] = [];
    
    // 1. Detect country from address
    const detectedCountry = detectCountryFromAddress(input.clientAddress);
    const countryData = COUNTRY_DATA[detectedCountry] ?? COUNTRY_DATA['TN'];
    appliedRules.push(`🌍 Pays détecté: ${countryData.name} (${detectedCountry})`);
    
    // 2. Detect currency from country
    const detectedCurrency = countryData.currency;
    appliedRules.push(`💰 Devise détectée: ${detectedCurrency}`);
    
    // 3. Detect VAT rate intelligently from description + country
    let tvaRate: number;
    let vatCategory: string;
    
    if (input.manualOverride?.tva !== undefined) {
      // Manual override
      tvaRate = (input.manualOverride.tva / input.amountHT) * 100;
      vatCategory = 'Manuel (override)';
      appliedRules.push(`🎛️ TVA manuelle: ${input.manualOverride.tva} (taux ${tvaRate.toFixed(2)}%)`);
    } else {
      const detection = detectVatRate(input.serviceDescription, detectedCountry);
      tvaRate = detection.rate;
      vatCategory = detection.category;
      appliedRules.push(`🧠 TVA intelligente: ${tvaRate}% (Catégorie: ${vatCategory})`);
    }
    
    const tvaAmount = input.amountHT * (tvaRate / 100);
    
    // 4. Calculate stamp duty (timbre fiscal)
    let timbreAmount = 0;
    if (input.manualOverride?.timbre !== undefined) {
      timbreAmount = input.manualOverride.timbre;
      appliedRules.push(`🎛️ Timbre manuel: ${timbreAmount} TND`);
    } else if (countryData.hasStampDuty && input.amountHT > countryData.stampDutyThreshold) {
      timbreAmount = countryData.stampDutyAmount;
      appliedRules.push(`📮 Timbre fiscal: ${timbreAmount} TND (seuil ${countryData.stampDutyThreshold} TND dépassé)`);
    } else {
      appliedRules.push(`📮 Pas de timbre fiscal`);
    }
    
    // 5. Detect Withholding Tax (RAS) for Tunisia
    let rasType = input.withholdingTaxType || 'NONE';
    let rasAmount = 0;
    
    if (input.manualOverride?.ras !== undefined) {
      rasAmount = input.manualOverride.ras;
      appliedRules.push(`🎛️ RAS manuel: ${rasAmount}`);
    } else if (detectedCountry === 'TN') {
      // Auto-detect RAS type from description if not specified
      if (rasType === 'NONE') {
        rasType = detectWithholdingTaxType(input.serviceDescription, detectedCountry);
      }
      
      if (rasType !== 'NONE') {
        const rasRate = RAS_RULES[rasType]?.rate || 0;
        rasAmount = input.amountHT * (rasRate / 100);
        appliedRules.push(`🏛️ RAS ${rasRate}% appliquée (${RAS_RULES[rasType]?.description || rasType})`);
      } else {
        appliedRules.push(`🏛️ Pas de RAS (non applicable)`);
      }
    } else {
      appliedRules.push(`🏛️ Pas de RAS (pays étranger: ${countryData.name})`);
    }
    
    // 6. Calculate total
    const totalTTC = input.amountHT + tvaAmount + timbreAmount - rasAmount;
    
    return {
      detectedCountry,
      detectedCurrency,
      tvaRate: round3(tvaRate),
      tvaAmount: round3(tvaAmount),
      timbreAmount: round3(timbreAmount),
      rasAmount: round3(rasAmount),
      totalTTC: round3(totalTTC),
      appliedRules,
    };
  }
  
  // Convenience method for Quotation/Invoice
  static calculateForDocument(doc: {
    subtotal: number;
    serviceDescription: string;
    clientAddress?: string | null;
    clientType: 'PRO' | 'INDIVIDUAL';
    withholdingTaxType?: 'NONE' | 'HONORAIRES' | 'LOYERS' | 'MARCHES';
    manualOverride?: { tva?: number; timbre?: number; ras?: number } | null;
  }): FiscalEngineOutput {
    return this.calculate({
      amountHT: doc.subtotal,
      serviceDescription: doc.serviceDescription,
      clientAddress: doc.clientAddress,
      clientType: doc.clientType,
      withholdingTaxType: doc.withholdingTaxType || 'NONE',
      manualOverride: doc.manualOverride,
    });
  }
  
  static getExchangeRate(currency: string): number {
    return EXCHANGE_RATES[currency] ?? 1;
  }
  
  static getSupportedCountries(): { code: string; name: string; currency: string; vatRate: number }[] {
    return Object.entries(COUNTRY_DATA).map(([code, data]) => ({
      code,
      name: data.name,
      currency: data.currency,
      vatRate: data.defaultVatRate,
    }));
  }
}