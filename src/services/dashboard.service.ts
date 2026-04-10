import { InvoiceStatus, QuotationStatus } from '@prisma/client';
import prisma from '../config/prisma';

interface DashboardStats {
  kpis: {
    caMensuelPaye: number;
    caMensuelVariation: number;
    facturesPaYees: number;
    facturesTotalCeMois: number;
    montantEnAttente: number;
    nombreEnAttente: number;
    clientsActifs: number;
    nombreDevis: number;
    delaiMoyenPaiement: number;
  };
  evolutionCA: Array<{
    mois: string;
    annee: number;
    ca: number;
  }>;
  statsCA: {
    minimum: number;
    moyenne: number;
    maximum: number;
    moisMaximum: string;
    croissance: number;
  };
  repartitionParClient: Array<{
    clientId: string;
    clientName: string;
    ca: number;
    pourcentage: number;
    variation: number;
  }>;
  alertesImpayes: {
    montantTotal: number;
    nombreFactures: number;
    tauxPaiement: number;
    seuilDepasse: boolean;
  };
  indicateursDevis: {
    tauxRecouvrement: number;
    tauxConversionDevis: number;
    brouillonsAEmettre: number;
    devisExpires: number;
  };
  conversionsDevis: Array<{
    devisId: string;
    devisNumber: string;
    invoiceId: string;
    invoiceNumber: string;
    clientName: string;
    montant: number;
    date: Date;
  }>;
  dernieresFactures: Array<{
    id: string;
    numero: string;
    clientName: string;
    clientCompany: string;
    montantTTC: number;
    date: Date;
    statut: string;
  }>;
  repartitionStatuts: Array<{
    statut: string;
    nombre: number;
    pourcentage: number;
  }>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentChange(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getLast12CalendarMonths(now: Date): Date[] {
  const months: Date[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return months;
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const previousMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const previousMonthEnd = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const months = getLast12CalendarMonths(now);
  const twelveMonthsStart = startOfMonth(months[0]);
  const previousPeriodStart = startOfMonth(new Date(months[0].getFullYear(), months[0].getMonth() - 12, 1));
  const previousPeriodEnd = endOfMonth(new Date(months[months.length - 1].getFullYear(), months[months.length - 1].getMonth() - 12, 1));

  const [
    paidThisMonthAgg,
    paidPreviousMonthAgg,
    invoicesTotalThisMonth,
    pendingIssuedAgg,
    activeClientsRaw,
    sentQuotationsCount,
    avgPaymentDelayRaw,
    paid12Months,
    paidPrevious12MonthsAgg,
    topClientsCurrent,
    topClientsPrevious,
    overdueAgg,
    invoiceStatusEmissionCounts,
    draftInvoicesCount,
    quotationCounts,
    recentConversionsRaw,
    latestInvoicesRaw,
    statusBreakdownRaw,
  ] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { gte: thisMonthStart, lte: thisMonthEnd },
      },
      _sum: { total: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { gte: previousMonthStart, lte: previousMonthEnd },
      },
      _sum: { total: true },
    }),
    prisma.invoice.count({
      where: {
        userId,
        issueDate: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
    prisma.invoice.aggregate({
      where: { userId, status: InvoiceStatus.ISSUED },
      _sum: { total: true },
      _count: true,
    }),
    prisma.invoice.findMany({
      where: { userId },
      select: { clientId: true },
      distinct: ['clientId'],
    }),
    prisma.quotation.count({
      where: { userId, status: QuotationStatus.SENT },
    }),
    prisma.invoice.findMany({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { not: null },
      },
      select: {
        issueDate: true,
        paidDate: true,
      },
    }),
    prisma.invoice.findMany({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { gte: twelveMonthsStart, lte: thisMonthEnd },
      },
      select: {
        total: true,
        paidDate: true,
      },
    }),
    prisma.invoice.aggregate({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { gte: previousPeriodStart, lte: previousPeriodEnd },
      },
      _sum: { total: true },
    }),
    prisma.invoice.groupBy({
      by: ['clientId'],
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { gte: twelveMonthsStart, lte: thisMonthEnd },
      },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    }),
    prisma.invoice.groupBy({
      by: ['clientId'],
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { gte: previousPeriodStart, lte: previousPeriodEnd },
      },
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { userId, status: InvoiceStatus.OVERDUE },
      _sum: { total: true },
      _count: true,
    }),
    prisma.invoice.groupBy({
      by: ['status'],
      where: {
        userId,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID, InvoiceStatus.OVERDUE] },
      },
      _count: true,
    }),
    prisma.invoice.count({
      where: { userId, status: InvoiceStatus.DRAFT },
    }),
    prisma.quotation.groupBy({
      by: ['status'],
      where: { userId },
      _count: true,
    }),
    prisma.quotation.findMany({
      where: {
        userId,
        status: QuotationStatus.CONVERTED,
        convertedToInvoiceId: { not: null },
      },
      orderBy: { convertedAt: 'desc' },
      take: 5,
      include: {
        client: { select: { name: true } },
        convertedInvoice: { select: { id: true, invoiceNumber: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        client: { select: { name: true } },
      },
    }),
    prisma.invoice.groupBy({
      by: ['status'],
      where: { userId },
      _count: true,
    }),
  ]);

  const caMensuelPaye = Number(paidThisMonthAgg._sum.total ?? 0);
  const caMensuelPayePrev = Number(paidPreviousMonthAgg._sum.total ?? 0);
  const caMensuelVariation = percentChange(caMensuelPaye, caMensuelPayePrev);

  const pendingAmount = Number(pendingIssuedAgg._sum.total ?? 0);
  const activeClients = activeClientsRaw.length;

  const avgDelayDays =
    avgPaymentDelayRaw.length === 0
      ? 0
      : avgPaymentDelayRaw.reduce((sum, row) => {
          const paidAt = row.paidDate?.getTime() ?? row.issueDate.getTime();
          const diff = (paidAt - row.issueDate.getTime()) / (1000 * 60 * 60 * 24);
          return sum + diff;
        }, 0) / avgPaymentDelayRaw.length;

  const caByMonth = new Map<string, number>();
  for (const invoice of paid12Months) {
    if (!invoice.paidDate) continue;
    const key = getMonthKey(invoice.paidDate);
    const current = caByMonth.get(key) ?? 0;
    caByMonth.set(key, current + Number(invoice.total));
  }

  const evolutionCA = months.map((monthDate) => {
    const key = getMonthKey(monthDate);
    const ca = caByMonth.get(key) ?? 0;
    const mois = monthDate.toLocaleString('fr-FR', { month: 'short' });
    return {
      mois: mois.charAt(0).toUpperCase() + mois.slice(1).replace('.', ''),
      annee: monthDate.getFullYear(),
      ca: round2(ca),
    };
  });

  const caValues = evolutionCA.map((row) => row.ca);
  const minimum = caValues.length > 0 ? Math.min(...caValues) : 0;
  const maximum = caValues.length > 0 ? Math.max(...caValues) : 0;
  const moyenne =
    caValues.length > 0
      ? caValues.reduce((sum, value) => sum + value, 0) / caValues.length
      : 0;
  const maxIndex = caValues.findIndex((value) => value === maximum);
  const moisMaximum = maxIndex >= 0 ? evolutionCA[maxIndex].mois : '';

  const current12Total = caValues.reduce((sum, value) => sum + value, 0);
  const previous12Total = Number(paidPrevious12MonthsAgg._sum.total ?? 0);
  const croissance = percentChange(current12Total, previous12Total);

  const previousByClient = new Map<string, number>();
  for (const row of topClientsPrevious) {
    previousByClient.set(row.clientId, Number(row._sum.total ?? 0));
  }

  const topClientIds = topClientsCurrent.map((row) => row.clientId);
  const topClientsDetails = topClientIds.length
    ? await prisma.client.findMany({
        where: { userId, id: { in: topClientIds } },
        select: { id: true, name: true },
      })
    : [];
  const clientNameById = new Map(topClientsDetails.map((c) => [c.id, c.name]));

  const totalTopClientsCA = topClientsCurrent.reduce((sum, row) => sum + Number(row._sum.total ?? 0), 0);
  const repartitionParClient = topClientsCurrent.map((row) => {
    const current = Number(row._sum.total ?? 0);
    const previous = previousByClient.get(row.clientId) ?? 0;
    return {
      clientId: row.clientId,
      clientName: clientNameById.get(row.clientId) ?? 'Client inconnu',
      ca: round2(current),
      pourcentage: round2(totalTopClientsCA > 0 ? (current / totalTopClientsCA) * 100 : 0),
      variation: round2(percentChange(current, previous)),
    };
  });

  const overdueAmount = Number(overdueAgg._sum.total ?? 0);
  const emittedInvoiceCount = invoiceStatusEmissionCounts.reduce((sum, row) => sum + row._count, 0);
  const paidEmittedCount =
    invoiceStatusEmissionCounts.find((row) => row.status === InvoiceStatus.PAID)?._count ?? 0;
  const tauxPaiement = emittedInvoiceCount > 0 ? (paidEmittedCount / emittedInvoiceCount) * 100 : 0;

  const totalQuotations = quotationCounts.reduce((sum, row) => sum + row._count, 0);
  const convertedQuotations =
    quotationCounts.find((row) => row.status === QuotationStatus.CONVERTED)?._count ?? 0;
  const expiredQuotations =
    quotationCounts.find((row) => row.status === QuotationStatus.EXPIRED)?._count ?? 0;

  const conversionRows = recentConversionsRaw
    .filter((row) => row.convertedInvoice !== null)
    .map((row) => ({
      devisId: row.id,
      devisNumber: row.quotationNumber,
      invoiceId: row.convertedInvoice!.id,
      invoiceNumber: row.convertedInvoice!.invoiceNumber,
      clientName: row.client.name,
      montant: round2(Number(row.total)),
      date: row.convertedAt ?? row.updatedAt,
    }));

  const dernieresFactures = latestInvoicesRaw.map((invoice) => ({
    id: invoice.id,
    numero: invoice.invoiceNumber,
    clientName: invoice.client.name,
    clientCompany: invoice.client.name,
    montantTTC: round2(Number(invoice.total)),
    date: invoice.issueDate,
    statut: invoice.status,
  }));

  const totalInvoicesForBreakdown = statusBreakdownRaw.reduce((sum, row) => sum + row._count, 0);
  const repartitionStatuts = statusBreakdownRaw.map((row) => ({
    statut: row.status,
    nombre: row._count,
    pourcentage: round2(totalInvoicesForBreakdown > 0 ? (row._count / totalInvoicesForBreakdown) * 100 : 0),
  }));

  return {
    kpis: {
      caMensuelPaye: round2(caMensuelPaye),
      caMensuelVariation: round2(caMensuelVariation),
      facturesPaYees: paidThisMonthAgg._count,
      facturesTotalCeMois: invoicesTotalThisMonth,
      montantEnAttente: round2(pendingAmount),
      nombreEnAttente: pendingIssuedAgg._count,
      clientsActifs: activeClients,
      nombreDevis: sentQuotationsCount,
      delaiMoyenPaiement: round2(avgDelayDays),
    },
    evolutionCA,
    statsCA: {
      minimum: round2(minimum),
      moyenne: round2(moyenne),
      maximum: round2(maximum),
      moisMaximum,
      croissance: round2(croissance),
    },
    repartitionParClient,
    alertesImpayes: {
      montantTotal: round2(overdueAmount),
      nombreFactures: overdueAgg._count,
      tauxPaiement: round2(tauxPaiement),
      seuilDepasse: overdueAmount > 5000,
    },
    indicateursDevis: {
      tauxRecouvrement: round2(tauxPaiement),
      tauxConversionDevis: round2(totalQuotations > 0 ? (convertedQuotations / totalQuotations) * 100 : 0),
      brouillonsAEmettre: draftInvoicesCount,
      devisExpires: expiredQuotations,
    },
    conversionsDevis: conversionRows,
    dernieresFactures,
    repartitionStatuts,
  };
}
