import 'dotenv/config';
import { PrismaClient, InvoiceStatus, Currency, VatRate, WithholdingTaxType } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  // Nettoyer dans l'ordre des dépendances
  await prisma.auditLog.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.client.deleteMany();

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
      totalVat: 650, // 13% (banque)
      stampDuty: 0,  // Exonéré (secteur bancaire)
      withholdingTax: 0,
      total: 5650,
      withholdingTaxType: WithholdingTaxType.NONE,
      issueDate: new Date('2026-03-01'),
      dueDate: new Date('2026-03-31'),
      lines: {
        create: [
          {
            position: 0,
            description: 'Intégration API signature électronique — BNA',
            quantity: 1,
            unitPrice: 5000,
            vatRate: VatRate.THIRTEEN, // 13% services bancaires
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
      withholdingTax: 450, // 15% RAS honoraires
      total: 3121,
      withholdingTaxType: WithholdingTaxType.HONORAIRES,
      issueDate: new Date('2026-02-01'),
      dueDate: new Date('2026-03-01'),
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
