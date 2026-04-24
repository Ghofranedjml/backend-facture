import request from 'supertest';
import app from '../../src/app';
import prisma from '../../src/config/prisma';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config/env';

// ─── Test helpers ──────────────────────────

const TEST_USER_ID = 'test-user-integration';

function makeToken(userId = TEST_USER_ID): string {
  return jwt.sign({ userId, email: 'test@etafakna.com' }, config.JWT_SECRET, { expiresIn: '1h' });
}

const authHeader = () => ({ Authorization: `Bearer ${makeToken()}` });

// ─── Setup / Teardown ──────────────────────

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  // Nettoyer uniquement les données de test (isolation par userId)
  await prisma.auditLog.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.invoiceLine.deleteMany({
    where: { invoice: { userId: TEST_USER_ID } },
  });
  await prisma.invoice.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.client.deleteMany({ where: { userId: TEST_USER_ID } });
});

// ─── Health check ──────────────────────────

describe('GET /health', () => {
  it('retourne status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ─── Clients ───────────────────────────────

describe('Clients API', () => {
  it('POST /api/clients — crée un client', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set(authHeader())
      .send({
        name: 'Société Test SA',
        taxId: '1234567/A/M/000',
        email: 'test@societe.tn',
        phone: '+216 71 123 456',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Société Test SA');
    expect(res.body.data.userId).toBe(TEST_USER_ID);
  });

  it('POST /api/clients — rejette un email invalide', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set(authHeader())
      .send({ name: 'Test', email: 'pas-un-email' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/clients — liste uniquement les clients de l\'utilisateur', async () => {
    // Créer un client avec un autre userId (isolation multi-tenant)
    await prisma.client.create({
      data: { userId: 'autre-user', name: 'Client Autre Utilisateur' },
    });

    // Créer un client pour notre utilisateur test
    await prisma.client.create({
      data: { userId: TEST_USER_ID, name: 'Mon Client' },
    });

    const res = await request(app)
      .get('/api/clients')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Mon Client');

    // Cleanup autre user
    await prisma.client.deleteMany({ where: { userId: 'autre-user' } });
  });

  it('DELETE /api/clients/:id — interdit si le client a des factures', async () => {
    const client = await prisma.client.create({
      data: { userId: TEST_USER_ID, name: 'Client Avec Facture' },
    });

    await prisma.invoice.create({
      data: {
        invoiceNumber: 'FAC-TEST-001',
        userId: TEST_USER_ID,
        clientId: client.id,
        status: 'DRAFT',
        currency: 'TND',
        subtotal: 100,
        totalVat: 19,
        stampDuty: 0,
        withholdingTax: 0,
        total: 119,
        issueDate: new Date(),
        dueDate: new Date(),
      },
    });

    const res = await request(app)
      .delete(`/api/clients/${client.id}`)
      .set(authHeader());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CLIENT_HAS_INVOICES');
  });
});

// ─── Invoices ──────────────────────────────

describe('Invoices API', () => {
  let clientId: string;

  beforeEach(async () => {
    const client = await prisma.client.create({
      data: { userId: TEST_USER_ID, name: 'Client Invoice Test' },
    });
    clientId = client.id;
  });

  const validInvoicePayload = () => ({
    clientId,
    currency: 'TND',
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 30 * 86400_000).toISOString(),
    withholdingTaxType: 'NONE',
    lines: [
      { description: 'Service SaaS', quantity: 1, unitPrice: 2000, vatRate: 'NINETEEN' },
    ],
  });

  it('POST /api/invoices — crée une facture en DRAFT avec calculs fiscaux corrects', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set(authHeader())
      .send(validInvoicePayload());

    expect(res.status).toBe(201);
    const inv = res.body.data;
    expect(inv.status).toBe('DRAFT');
    expect(Number(inv.subtotal)).toBe(2000);
    expect(Number(inv.totalVat)).toBe(380);   // 19% × 2000
    expect(Number(inv.stampDuty)).toBe(1);    // HT > 1000
    expect(Number(inv.total)).toBe(2381);     // 2000 + 380 + 1
    expect(inv.invoiceNumber).toMatch(/^FAC-\d{4}-\d{3}$/);
  });

  it('POST /api/invoices — rejette si pas de lignes', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set(authHeader())
      .send({ ...validInvoicePayload(), lines: [] });

    expect(res.status).toBe(422);
  });

  it('POST /api/invoices/:id/validate — DRAFT → ISSUED', async () => {
    const createRes = await request(app)
      .post('/api/invoices')
      .set(authHeader())
      .send(validInvoicePayload());

    const invoiceId = createRes.body.data.id;

    const validateRes = await request(app)
      .post(`/api/invoices/${invoiceId}/validate`)
      .set(authHeader());

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.data.status).toBe('ISSUED');
  });

  it('POST /api/invoices/:id/validate — interdit de valider deux fois', async () => {
    const createRes = await request(app)
      .post('/api/invoices')
      .set(authHeader())
      .send(validInvoicePayload());

    const invoiceId = createRes.body.data.id;

    await request(app).post(`/api/invoices/${invoiceId}/validate`).set(authHeader());

    const res = await request(app)
      .post(`/api/invoices/${invoiceId}/validate`)
      .set(authHeader());

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_STATUS');
  });

  it('POST /api/invoices/:id/pay — ISSUED → PAID', async () => {
    const createRes = await request(app)
      .post('/api/invoices')
      .set(authHeader())
      .send(validInvoicePayload());
    const invoiceId = createRes.body.data.id;

    await request(app).post(`/api/invoices/${invoiceId}/validate`).set(authHeader());

    const payRes = await request(app)
      .post(`/api/invoices/${invoiceId}/pay`)
      .set(authHeader())
      .send({ paidDate: new Date().toISOString() });

    expect(payRes.status).toBe(200);
    expect(payRes.body.data.status).toBe('PAID');
    expect(payRes.body.data.paidDate).not.toBeNull();
  });

  it('GET /api/invoices — filtre par statut', async () => {
    const createRes = await request(app)
      .post('/api/invoices')
      .set(authHeader())
      .send(validInvoicePayload());
    const invoiceId = createRes.body.data.id;

    await request(app).post(`/api/invoices/${invoiceId}/validate`).set(authHeader());

    const res = await request(app)
      .get('/api/invoices?status=ISSUED')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.every((i: { status: string }) => i.status === 'ISSUED')).toBe(true);
  });

  it('GET /api/invoices/:id — 403 si la facture appartient à un autre user', async () => {
    const otherClient = await prisma.client.create({
      data: { userId: 'other-user', name: 'Autre' },
    });
    const otherInvoice = await prisma.invoice.create({
      data: {
        invoiceNumber: 'FAC-OTHER-001',
        userId: 'other-user',
        clientId: otherClient.id,
        status: 'DRAFT',
        currency: 'TND',
        subtotal: 100,
        totalVat: 19,
        stampDuty: 0,
        withholdingTax: 0,
        total: 119,
        issueDate: new Date(),
        dueDate: new Date(),
      },
    });

    const res = await request(app)
      .get(`/api/invoices/${otherInvoice.id}`)
      .set(authHeader());

    expect(res.status).toBe(403);

    // Cleanup
    await prisma.invoice.delete({ where: { id: otherInvoice.id } });
    await prisma.client.delete({ where: { id: otherClient.id } });
  });

  it('DELETE /api/invoices/:id — supprime un brouillon', async () => {
    const createRes = await request(app)
      .post('/api/invoices')
      .set(authHeader())
      .send(validInvoicePayload());

    const invoiceId = createRes.body.data.id;

    const deleteRes = await request(app)
      .delete(`/api/invoices/${invoiceId}`)
      .set(authHeader());

    expect(deleteRes.status).toBe(204);
  });

  it('DELETE /api/invoices/:id — interdit de supprimer une facture émise', async () => {
    const createRes = await request(app)
      .post('/api/invoices')
      .set(authHeader())
      .send(validInvoicePayload());
    const invoiceId = createRes.body.data.id;

    await request(app).post(`/api/invoices/${invoiceId}/validate`).set(authHeader());

    const deleteRes = await request(app)
      .delete(`/api/invoices/${invoiceId}`)
      .set(authHeader());

    expect(deleteRes.status).toBe(422);
  });

  it('GET /api/invoices/stats — retourne les KPIs dashboard', async () => {
    const res = await request(app)
      .get('/api/invoices/stats')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('currentMonth');
    expect(res.body.data).toHaveProperty('overdue');
    expect(res.body.data).toHaveProperty('paymentRate');
    expect(res.body.data).toHaveProperty('topClients');
  });

  it('401 sans token', async () => {
    const res = await request(app).get('/api/invoices');
    expect(res.status).toBe(401);
  });
});
