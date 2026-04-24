import 'dotenv/config';
import { PrismaClient, InvoiceStatus, Currency, VatRate, WithholdingTaxType, VatSystem } from '@prisma/client';

const prisma = new PrismaClient();

async function seedMenaData() {
  console.log('🌍 Seeding MENA countries...');

  const menaCountries = [
    // North Africa
    { code: 'TN', name: 'Tunisia', currencyCode: Currency.TND, phoneCode: '+216', vatSystem: VatSystem.STANDARD, hasStampDuty: true, stampDutyAmount: 1, defaultVatRate: 19, keywords: ['tunis', 'tunisie', 'تونس', 'tn'] },
    { code: 'DZ', name: 'Algeria', currencyCode: Currency.DZD, phoneCode: '+213', vatSystem: VatSystem.STANDARD, hasStampDuty: true, stampDutyAmount: 1, defaultVatRate: 19, keywords: ['alger', 'algérie', 'الجزائر', 'dz'] },
    { code: 'MA', name: 'Morocco', currencyCode: Currency.MAD, phoneCode: '+212', vatSystem: VatSystem.STANDARD, hasStampDuty: true, stampDutyAmount: 1, defaultVatRate: 20, keywords: ['maroc', 'morocco', 'المغرب', 'ma'] },
    { code: 'LY', name: 'Libya', currencyCode: Currency.LYD, phoneCode: '+218', vatSystem: VatSystem.NONE, hasStampDuty: false, defaultVatRate: 0, keywords: ['libye', 'libya', 'ليبيا', 'ly'] },
    { code: 'EG', name: 'Egypt', currencyCode: Currency.EGP, phoneCode: '+20', vatSystem: VatSystem.STANDARD, hasStampDuty: true, stampDutyAmount: 1, defaultVatRate: 14, keywords: ['egypte', 'egypt', 'مصر', 'eg'] },
    
    // GCC Countries
    { code: 'SA', name: 'Saudi Arabia', currencyCode: Currency.SAR, phoneCode: '+966', vatSystem: VatSystem.GCC, hasStampDuty: false, defaultVatRate: 15, keywords: ['saudi', 'arabie', 'saoudite', 'sa'] },
    { code: 'AE', name: 'United Arab Emirates', currencyCode: Currency.AED, phoneCode: '+971', vatSystem: VatSystem.GCC, hasStampDuty: false, defaultVatRate: 5, keywords: ['emirates', 'uae', 'emirats', 'ae'] },
    { code: 'QA', name: 'Qatar', currencyCode: Currency.QAR, phoneCode: '+974', vatSystem: VatSystem.GCC, hasStampDuty: false, defaultVatRate: 0, keywords: ['qatar', 'قطر', 'qa'] },
    { code: 'KW', name: 'Kuwait', currencyCode: Currency.KWD, phoneCode: '+965', vatSystem: VatSystem.GCC, hasStampDuty: false, defaultVatRate: 0, keywords: ['kuwait', 'الكويت', 'kw'] },
    { code: 'BH', name: 'Bahrain', currencyCode: Currency.BHD, phoneCode: '+973', vatSystem: VatSystem.GCC, hasStampDuty: false, defaultVatRate: 10, keywords: ['bahrain', 'البحرين', 'bh'] },
    { code: 'OM', name: 'Oman', currencyCode: Currency.OMR, phoneCode: '+968', vatSystem: VatSystem.GCC, hasStampDuty: false, defaultVatRate: 5, keywords: ['oman', 'عمان', 'om'] },
    
    // Other Middle East
    { code: 'JO', name: 'Jordan', currencyCode: Currency.JOD, phoneCode: '+962', vatSystem: VatSystem.STANDARD, hasStampDuty: true, stampDutyAmount: 1, defaultVatRate: 16, keywords: ['jordan', 'jordanie', 'الأردن', 'jo'] },
    { code: 'LB', name: 'Lebanon', currencyCode: Currency.LBP, phoneCode: '+961', vatSystem: VatSystem.STANDARD, hasStampDuty: false, defaultVatRate: 11, keywords: ['lebanon', 'liban', 'لبنان', 'lb'] },
    { code: 'IQ', name: 'Iraq', currencyCode: Currency.IQD, phoneCode: '+964', vatSystem: VatSystem.NONE, hasStampDuty: false, defaultVatRate: 0, keywords: ['iraq', 'irak', 'العراق', 'iq'] },
    { code: 'YE', name: 'Yemen', currencyCode: Currency.YER, phoneCode: '+967', vatSystem: VatSystem.NONE, hasStampDuty: false, defaultVatRate: 0, keywords: ['yemen', 'yémen', 'اليمن', 'ye'] },
    { code: 'SY', name: 'Syria', currencyCode: Currency.SYP, phoneCode: '+963', vatSystem: VatSystem.NONE, hasStampDuty: false, defaultVatRate: 0, keywords: ['syria', 'syrie', 'سوريا', 'sy'] },
  ];

  for (const country of menaCountries) {
    await prisma.country.upsert({
      where: { code: country.code },
      update: country,
      create: country,
    });
  }

  console.log('✅ MENA countries seeded');

  console.log('🏷️ Seeding VAT categories...');

  const vatCategories = [
    { id: 'consulting', name: 'Consulting', rules: { TN: 19, MA: 20, EG: 14, SA: 15, AE: 5, DZ: 19, default: 19 } },
    { id: 'software', name: 'Software', rules: { TN: 19, MA: 20, EG: 14, SA: 15, AE: 5, default: 19 } },
    { id: 'banking', name: 'Banking', rules: { TN: 13, MA: 14, EG: 14, SA: 15, AE: 5, default: 13 } },
    { id: 'food', name: 'Food', rules: { TN: 7, MA: 7, EG: 5, SA: 0, AE: 0, default: 7 } },
    { id: 'medical', name: 'Medical', rules: { TN: 7, MA: 7, EG: 5, SA: 0, AE: 0, default: 7 } },
    { id: 'education', name: 'Education', rules: { TN: 0, MA: 0, EG: 0, SA: 0, AE: 0, default: 0 } },
    { id: 'export', name: 'Export', rules: { TN: 0, MA: 0, EG: 0, SA: 0, AE: 0, default: 0 } },
  ];

  for (const category of vatCategories) {
    await prisma.vatCategory.upsert({
      where: { id: category.id },
      update: category,
      create: category,
    });
  }

  console.log('✅ VAT categories seeded');
}

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  // Nettoyer dans l'ordre des dépendances
  await prisma.auditLog.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.client.deleteMany();
  await prisma.quotationLine.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.country.deleteMany();
  await prisma.vatCategory.deleteMany();

  // Seed MENA data first
  await seedMenaData();

  const userId = 'dev-user-001'; // Simule un user JWT en dev

  // ── Clients ──────────────────────────────
  const clientTT = await prisma.client.create({
    data: {
      userId,
      name: 'Tunisie Telecom SA',
      taxId: '1234567/A/M/000',
      address: 'Avenue Habib Bourguiba, Tunis 1001',
      email: 'facturation@tunisietelecom.tn',
      phone: '+216 71 801 800',
      countryCode: 'TN',
    },
  });

  const clientBNA = await prisma.client.create({
    data: {
      userId,
      name: 'BNA — Banque Nationale Agricole',
      taxId: '9876543/A/M/000',
      address: 'Rue Hédi Nouira, Tunis 1001',
      email: 'finance@bna.tn',
      phone: '+216 71 831 000',
      countryCode: 'TN',
    },
  });

  const clientHaddad = await prisma.client.create({
    data: {
      userId,
      name: 'Cabinet Haddad & Associés',
      taxId: '4321098/B/M/000',
      address: 'Rue de la Loi, Cité des Avocats, Tunis',
      email: 'cabinet.haddad@gmail.com',
      phone: '+216 71 282 040',
      countryCode: 'TN',
    },
  });

  console.log('✅ 3 clients créés');

  // ── Factures ──────────────────────────────

  // FAC-2026-001 — Payée
  const inv1 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'FAC-2026-001',
      userId,
      clientId: clientTT.id,
      status: InvoiceStatus.PAID,
      currency: Currency.TND,
      subtotal: 2700,
      totalVat: 513,
      stampDuty: 1,
      withholdingTax: 0,
      total: 3214,
      withholdingTaxType: WithholdingTaxType.NONE,
      issueDate: new Date('2026-01-15'),
      dueDate: new Date('2026-02-14'),
      paidDate: new Date('2026-02-10'),
      notes: 'Paiement reçu par virement',
      countryCode: 'TN',
      lines: {
        create: [
          {
            position: 0,
            description: 'Abonnement plateforme SaaS — Janvier 2026',
            quantity: 1,
            unitPrice: 2000,
            vatRate: VatRate.NINETEEN,
            lineTotal: 2000,
          },
          {
            position: 1,
            description: 'Formation utilisation (2h)',
            quantity: 2,
            unitPrice: 350,
            vatRate: VatRate.NINETEEN,
            lineTotal: 700,
          },
        ],
      },
    },
  });

  // FAC-2026-002 — Émise
  const inv2 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'FAC-2026-002',
      userId,
      clientId: clientBNA.id,
      status: InvoiceStatus.ISSUED,
      currency: Currency.TND,
      subtotal: 5000,
      totalVat: 650,
      stampDuty: 0,
      withholdingTax: 0,
      total: 5650,
      withholdingTaxType: WithholdingTaxType.NONE,
      issueDate: new Date('2026-03-01'),
      dueDate: new Date('2026-03-31'),
      countryCode: 'TN',
      lines: {
        create: [
          {
            position: 0,
            description: 'Intégration API signature électronique — BNA',
            quantity: 1,
            unitPrice: 5000,
            vatRate: VatRate.THIRTEEN,
            lineTotal: 5000,
          },
        ],
      },
    },
  });

  // FAC-2026-003 — En retard
  await prisma.invoice.create({
    data: {
      invoiceNumber: 'FAC-2026-003',
      userId,
      clientId: clientHaddad.id,
      status: InvoiceStatus.OVERDUE,
      currency: Currency.TND,
      subtotal: 3000,
      totalVat: 570,
      stampDuty: 1,
      withholdingTax: 450,
      total: 3121,
      withholdingTaxType: WithholdingTaxType.HONORAIRES,
      issueDate: new Date('2026-02-01'),
      dueDate: new Date('2026-03-01'),
      countryCode: 'TN',
      lines: {
        create: [
          {
            position: 0,
            description: 'Conseil juridique et configuration contrats',
            quantity: 10,
            unitPrice: 300,
            vatRate: VatRate.NINETEEN,
            lineTotal: 3000,
          },
        ],
      },
    },
  });

  // FAC-2026-004 — Brouillon
  await prisma.invoice.create({
    data: {
      invoiceNumber: 'FAC-2026-004',
      userId,
      clientId: clientTT.id,
      status: InvoiceStatus.DRAFT,
      currency: Currency.TND,
      subtotal: 1500,
      totalVat: 285,
      stampDuty: 1,
      withholdingTax: 0,
      total: 1786,
      withholdingTaxType: WithholdingTaxType.NONE,
      issueDate: new Date('2026-03-20'),
      dueDate: new Date('2026-04-19'),
      countryCode: 'TN',
      lines: {
        create: [
          {
            position: 0,
            description: 'Maintenance mensuelle — Avril 2026',
            quantity: 1,
            unitPrice: 1500,
            vatRate: VatRate.NINETEEN,
            lineTotal: 1500,
          },
        ],
      },
    },
  });

  // Audit logs
  await prisma.auditLog.createMany({
    data: [
      { invoiceId: inv1.id, userId, action: 'CREATED', toStatus: InvoiceStatus.DRAFT },
      { invoiceId: inv1.id, userId, action: 'VALIDATED', fromStatus: InvoiceStatus.DRAFT, toStatus: InvoiceStatus.ISSUED },
      { invoiceId: inv1.id, userId, action: 'EMAIL_SENT', metadata: { to: 'facturation@tunisietelecom.tn' } },
      { invoiceId: inv1.id, userId, action: 'PAID', fromStatus: InvoiceStatus.ISSUED, toStatus: InvoiceStatus.PAID },
      { invoiceId: inv2.id, userId, action: 'CREATED', toStatus: InvoiceStatus.DRAFT },
      { invoiceId: inv2.id, userId, action: 'VALIDATED', fromStatus: InvoiceStatus.DRAFT, toStatus: InvoiceStatus.ISSUED },
    ],
  });

  console.log('✅ 4 factures et audit logs créés');
  console.log('\n🎉 Seed terminé avec succès !');
}

main()
  .catch((e) => {
    console.error('❌ Erreur seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });