import { FiscalEngine, extractCountryFromAddress } from '../../src/services/fiscalEngine.service';

describe('extractCountryFromAddress', () => {
  it('détecte Tunisie depuis "Tunis"', () => {
    expect(extractCountryFromAddress('12 Rue de la Loi, Tunis')).toBe('TN');
  });

  it('détecte Tunisie depuis "Tunisie"', () => {
    expect(extractCountryFromAddress('Avenue Bourguiba 1001 Tunisie')).toBe('TN');
  });

  it('détecte Maroc depuis "Casablanca"', () => {
    expect(extractCountryFromAddress('45 Bd Hassan II, Casablanca')).toBe('MA');
  });

  it('détecte Émirats depuis "Dubai"', () => {
    expect(extractCountryFromAddress('Business Bay, Dubai')).toBe('AE');
  });

  it('détecte Arabie Saoudite depuis "Riyadh"', () => {
    expect(extractCountryFromAddress('King Fahd Road, Riyadh')).toBe('SA');
  });

  it('détecte Qatar depuis "Qatar"', () => {
    expect(extractCountryFromAddress('West Bay, Doha, Qatar')).toBe('QA');
  });

  it('retourne TN par défaut si adresse vide', () => {
    expect(extractCountryFromAddress('')).toBe('TN');
    expect(extractCountryFromAddress(null)).toBe('TN');
    expect(extractCountryFromAddress(undefined)).toBe('TN');
  });

  it('détecte via code ISO direct', () => {
    expect(extractCountryFromAddress('Some Address TN')).toBe('TN');
    expect(extractCountryFromAddress('Some Address MA')).toBe('MA');
  });
});

describe('FiscalEngine.calculate', () => {
  describe('Tunisie — TVA 19% + timbre + RAS', () => {
    it('calcule TVA 19% standard', () => {
      const result = FiscalEngine.calculate({
        amountHT: 2000, currency: 'TND', country: 'TN', clientType: 'PRO',
      });
      expect(result.tva).toBe(380);
      expect(result.details.tvaRate).toBe(19);
    });

    it('applique timbre fiscal si HT > 1000 TND', () => {
      const result = FiscalEngine.calculate({
        amountHT: 1500, currency: 'TND', country: 'TN', clientType: 'PRO',
      });
      expect(result.timbre).toBe(1);
    });

    it('pas de timbre si HT <= 1000 TND', () => {
      const result = FiscalEngine.calculate({
        amountHT: 800, currency: 'TND', country: 'TN', clientType: 'PRO',
      });
      expect(result.timbre).toBe(0);
    });

    it('RAS HONORAIRES = 15%', () => {
      const result = FiscalEngine.calculate({
        amountHT: 2000, currency: 'TND', country: 'TN',
        clientType: 'PRO', withholdingTaxType: 'HONORAIRES',
      });
      expect(result.ras).toBe(300);
    });

    it('RAS MARCHES = 1.5%', () => {
      const result = FiscalEngine.calculate({
        amountHT: 2000, currency: 'TND', country: 'TN',
        clientType: 'PRO', withholdingTaxType: 'MARCHES',
      });
      expect(result.ras).toBe(30);
    });

    it('RAS LOYERS = 15%', () => {
      const result = FiscalEngine.calculate({
        amountHT: 1000, currency: 'TND', country: 'TN',
        clientType: 'PRO', withholdingTaxType: 'LOYERS',
      });
      expect(result.ras).toBe(150);
    });

    it('pas de RAS si NONE', () => {
      const result = FiscalEngine.calculate({
        amountHT: 2000, currency: 'TND', country: 'TN',
        clientType: 'PRO', withholdingTaxType: 'NONE',
      });
      expect(result.ras).toBe(0);
    });

    it('calcul TTC correct : HT + TVA + timbre - RAS', () => {
      const result = FiscalEngine.calculate({
        amountHT: 2000, currency: 'TND', country: 'TN',
        clientType: 'PRO', withholdingTaxType: 'HONORAIRES',
      });
      // 2000 + 380 + 1 - 300 = 2081
      expect(result.totalTTC).toBe(2081);
    });
  });

  describe('Pays MENA — TVA locale', () => {
    it('Maroc — TVA 20%', () => {
      const result = FiscalEngine.calculate({
        amountHT: 1000, currency: 'MAD', country: 'MA', clientType: 'PRO',
      });
      expect(result.details.tvaRate).toBe(20);
      expect(result.tva).toBe(200);
      expect(result.timbre).toBe(0);
      expect(result.ras).toBe(0);
    });

    it('Arabie Saoudite — TVA 15%', () => {
      const result = FiscalEngine.calculate({
        amountHT: 1000, currency: 'SAR', country: 'SA', clientType: 'PRO',
      });
      expect(result.details.tvaRate).toBe(15);
      expect(result.tva).toBe(150);
    });

    it('Émirats — TVA 5%', () => {
      const result = FiscalEngine.calculate({
        amountHT: 1000, currency: 'AED', country: 'AE', clientType: 'PRO',
      });
      expect(result.details.tvaRate).toBe(5);
      expect(result.tva).toBe(50);
    });

    it('Qatar — TVA 0%', () => {
      const result = FiscalEngine.calculate({
        amountHT: 1000, currency: 'QAR', country: 'QA', clientType: 'PRO',
      });
      expect(result.tva).toBe(0);
      expect(result.timbre).toBe(0);
    });

    it('Koweït — TVA 0%', () => {
      const result = FiscalEngine.calculate({
        amountHT: 5000, currency: 'KWD', country: 'KW', clientType: 'PRO',
      });
      expect(result.tva).toBe(0);
    });

    it('Égypte — TVA 14%', () => {
      const result = FiscalEngine.calculate({
        amountHT: 1000, currency: 'EGP', country: 'EG', clientType: 'PRO',
      });
      expect(result.details.tvaRate).toBe(14);
    });

    it('Pas de RAS hors Tunisie', () => {
      const result = FiscalEngine.calculate({
        amountHT: 2000, currency: 'SAR', country: 'SA',
        clientType: 'PRO', withholdingTaxType: 'HONORAIRES',
      });
      expect(result.ras).toBe(0);
    });
  });

  describe('Override manuel', () => {
    it('override TVA manuel', () => {
      const result = FiscalEngine.calculate({
        amountHT: 2000, currency: 'TND', country: 'TN', clientType: 'PRO',
        taxOverride: { tva: 100 },
      });
      expect(result.tva).toBe(100);
    });

    it('override timbre manuel', () => {
      const result = FiscalEngine.calculate({
        amountHT: 2000, currency: 'TND', country: 'TN', clientType: 'PRO',
        taxOverride: { timbre: 5 },
      });
      expect(result.timbre).toBe(5);
    });

    it('override RAS manuel', () => {
      const result = FiscalEngine.calculate({
        amountHT: 2000, currency: 'TND', country: 'TN', clientType: 'PRO',
        taxOverride: { ras: 50 },
      });
      expect(result.ras).toBe(50);
    });
  });

  describe('calculateForDocument — détection adresse', () => {
    it('détecte Tunisie depuis adresse', () => {
      const result = FiscalEngine.calculateForDocument({
        subtotal: 2000, currency: 'TND',
        withholdingTaxType: 'NONE',
        client: { address: 'Avenue Bourguiba, Tunis', type: 'PRO' },
      });
      expect(result.details.tvaRate).toBe(19);
    });

    it('détecte Maroc depuis adresse', () => {
      const result = FiscalEngine.calculateForDocument({
        subtotal: 1000, currency: 'MAD',
        withholdingTaxType: 'NONE',
        client: { address: 'Boulevard Mohammed V, Casablanca', type: 'PRO' },
      });
      expect(result.details.tvaRate).toBe(20);
    });
  });

  describe('validateDocument', () => {
    it('valide un document correct', () => {
      const result = FiscalEngine.validateDocument({
        subtotal: 2000, totalVat: 380, stampDuty: 1,
        withholdingTax: 0, total: 2381,
        currency: 'TND', withholdingTaxType: 'NONE',
        client: { address: 'Tunis', type: 'PRO' },
      });
      expect(result.isValid).toBe(true);
      expect(result.differences).toEqual({});
    });

    it('détecte une incohérence TVA', () => {
      const result = FiscalEngine.validateDocument({
        subtotal: 2000, totalVat: 200, stampDuty: 1,
        withholdingTax: 0, total: 2201,
        currency: 'TND', withholdingTaxType: 'NONE',
        client: { address: 'Tunis', type: 'PRO' },
      });
      expect(result.isValid).toBe(false);
      expect(result.differences).toHaveProperty('tva');
    });
  });

  describe('validateInvoice (alias API)', () => {
    it('déduit le pays depuis client.address (pas de champ country)', () => {
      const result = FiscalEngine.validateInvoice({
        subtotal: 2000, totalVat: 380, stampDuty: 1,
        withholdingTax: 0, total: 2381,
        currency: 'TND', withholdingTaxType: 'NONE',
        client: { address: 'Avenue Habib Bourguiba, Tunis', type: 'PRO' },
      });
      expect(result.isValid).toBe(true);
    });
  });

  describe('Utilitaires', () => {
    it('retourne la liste des pays supportés', () => {
      const countries = FiscalEngine.getSupportedCountries();
      expect(countries.length).toBeGreaterThan(15);
      expect(countries.find(c => c.code === 'TN')?.tvaRate).toBe(19);
      expect(countries.find(c => c.code === 'SA')?.tvaRate).toBe(15);
    });

    it('retourne le taux de change', () => {
      expect(FiscalEngine.getExchangeRate('EUR')).toBeGreaterThan(3);
      expect(FiscalEngine.getExchangeRate('TND')).toBe(1);
      expect(FiscalEngine.getExchangeRate('UNKNOWN')).toBe(1);
    });
  });
});
