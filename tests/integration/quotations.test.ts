import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import prisma from '../../src/config/prisma';
import { config } from '../../src/config/env';

const TEST_USER_ID = 'test-user-quotations-integration';

function makeToken(userId = TEST_USER_ID): string {
  return jwt.sign({ userId, email: 'test@etafakna.com' }, config.JWT_SECRET, { expiresIn: '1h' });
}

const authHeader = () => ({ Authorization: `Bearer ${makeToken()}` });

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: { userId: TEST_USER_ID } } });
  await prisma.invoice.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.quotationLine.deleteMany({ where: { quotation: { userId: TEST_USER_ID } } });
  await prisma.quotation.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.client.deleteMany({ where: { userId: TEST_USER_ID } });
});

describe('Quotations API', () => {
  let clientId: string;

  beforeEach(async () => {
    const client = await prisma.client.create({
      data: { userId: TEST_USER_ID, name: 'Client Quotation Test' },
    });
    clientId = client.id;
  });

  const validQuotationPayload = () => ({
    clientId,
    currency: 'TND',
    issueDate: new Date().toISOString(),
    validUntil: new Date(Date.now() + 15 * 86400_000).toISOString(),
    notes: 'Devis de test',
    lines: [
      { description: 'Service SaaS', quantity: 1, unitPrice: 1000, vatRate: 'NINETEEN' },
    ],
  });

  it('POST /api/quotations — cree un devis DRAFT', async () => {
    const res = await request(app)
      .post('/api/quotations')
      .set(authHeader())
      .send(validQuotationPayload());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.quotationNumber).toMatch(/^DEV-\d{4}-\d{3}$/);
    expect(Number(res.body.data.subtotal)).toBe(1000);
    expect(Number(res.body.data.totalVat)).toBe(190);
    expect(Number(res.body.data.total)).toBe(1190);
  });

  it('POST /api/quotations/:id/send — DRAFT vers SENT', async () => {
    const createRes = await request(app)
      .post('/api/quotations')
      .set(authHeader())
      .send(validQuotationPayload());

    const res = await request(app)
      .post(`/api/quotations/${createRes.body.data.id}/send`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SENT');
    expect(res.body.data.emailSentAt).not.toBeNull();
  });

  it('POST /api/quotations/:id/accept — SENT vers ACCEPTED', async () => {
    const createRes = await request(app)
      .post('/api/quotations')
      .set(authHeader())
      .send(validQuotationPayload());
    const quotationId = createRes.body.data.id;

    await request(app)
      .post(`/api/quotations/${quotationId}/send`)
      .set(authHeader());

    const res = await request(app)
      .post(`/api/quotations/${quotationId}/accept`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACCEPTED');
    expect(res.body.data.acceptedAt).not.toBeNull();
  });

  it('POST /api/quotations/:id/convert — cree une facture et passe le devis en CONVERTED', async () => {
    const createRes = await request(app)
      .post('/api/quotations')
      .set(authHeader())
      .send(validQuotationPayload());
    const quotationId = createRes.body.data.id;

    await request(app)
      .post(`/api/quotations/${quotationId}/send`)
      .set(authHeader());

    const dueDate = new Date(Date.now() + 30 * 86400_000).toISOString();
    const convertRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set(authHeader())
      .send({ invoiceDueDate: dueDate });

    expect(convertRes.status).toBe(200);
    expect(convertRes.body.data.invoiceNumber).toMatch(/^FAC-\d{4}-\d{3}$/);

    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId } });
    expect(quotation?.status).toBe('CONVERTED');
    expect(quotation?.convertedToInvoiceId).not.toBeNull();
  });
});
