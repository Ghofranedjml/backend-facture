import prisma from '../../src/config/prisma';
import { markExpiredQuotations } from '../../src/services/quotation.service';

describe('quotation.service - markExpiredQuotations', () => {
  const TEST_USER_ID = 'test-user-quotation-service';

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.quotationLine.deleteMany({ where: { quotation: { userId: TEST_USER_ID } } });
    await prisma.quotation.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.client.deleteMany({ where: { userId: TEST_USER_ID } });
  });

  it('expire uniquement les devis SENT avec validUntil depassee', async () => {
    const stamp = Date.now().toString().slice(-6);
    const client = await prisma.client.create({
      data: { userId: TEST_USER_ID, name: 'Client Service Quotations' },
    });

    await prisma.quotation.create({
      data: {
        quotationNumber: `DEV-SVC-${stamp}1`,
        userId: TEST_USER_ID,
        clientId: client.id,
        status: 'SENT',
        currency: 'TND',
        subtotal: 100,
        totalVat: 19,
        total: 119,
        issueDate: new Date(Date.now() - 5 * 86400_000),
        validUntil: new Date(Date.now() - 1 * 86400_000),
      },
    });

    const notExpired = await prisma.quotation.create({
      data: {
        quotationNumber: `DEV-SVC-${stamp}2`,
        userId: TEST_USER_ID,
        clientId: client.id,
        status: 'SENT',
        currency: 'TND',
        subtotal: 100,
        totalVat: 19,
        total: 119,
        issueDate: new Date(),
        validUntil: new Date(Date.now() + 10 * 86400_000),
      },
    });

    const alreadyAccepted = await prisma.quotation.create({
      data: {
        quotationNumber: `DEV-SVC-${stamp}3`,
        userId: TEST_USER_ID,
        clientId: client.id,
        status: 'ACCEPTED',
        currency: 'TND',
        subtotal: 100,
        totalVat: 19,
        total: 119,
        issueDate: new Date(Date.now() - 5 * 86400_000),
        validUntil: new Date(Date.now() - 1 * 86400_000),
      },
    });

    const count = await markExpiredQuotations();
    expect(count).toBe(1);

    const refreshedNotExpired = await prisma.quotation.findUnique({ where: { id: notExpired.id } });
    const refreshedAccepted = await prisma.quotation.findUnique({ where: { id: alreadyAccepted.id } });

    expect(refreshedNotExpired?.status).toBe('SENT');
    expect(refreshedAccepted?.status).toBe('ACCEPTED');
  });
});
