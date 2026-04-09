import prisma from '../config/prisma';
import { AppError } from '../middlewares/error.middleware';
import { CreateClientInput, UpdateClientInput } from '../utils/validators';

// ─── LIST ──────────────────────────────────
export async function listClients(userId: string, search?: string) {
  return prisma.client.findMany({
    where: {
      userId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { taxId: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { invoices: true } },
    },
  });
}

// ─── GET ONE ───────────────────────────────
export async function getClient(clientId: string, userId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { lines: false },
      },
      _count: { select: { invoices: true } },
    },
  });

  if (!client) throw new AppError(404, 'NOT_FOUND', 'Client introuvable');
  if (client.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Accès refusé');

  return client;
}

// ─── CREATE ────────────────────────────────
export async function createClient(userId: string, input: CreateClientInput) {
  return prisma.client.create({
    data: { userId, ...input },
  });
}

// ─── UPDATE ────────────────────────────────
export async function updateClient(
  clientId: string,
  userId: string,
  input: UpdateClientInput,
) {
  await getClient(clientId, userId); // vérifie ownership

  return prisma.client.update({
    where: { id: clientId },
    data: input,
  });
}

// ─── DELETE ────────────────────────────────
export async function deleteClient(clientId: string, userId: string): Promise<void> {
  const client = await getClient(clientId, userId);

  if (client._count.invoices > 0) {
    throw new AppError(
      409,
      'CLIENT_HAS_INVOICES',
      `Ce client possède ${client._count.invoices} facture(s) — suppression impossible`,
    );
  }

  await prisma.client.delete({ where: { id: clientId } });
}
