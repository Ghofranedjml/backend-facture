import { InvoiceStatus, QuotationStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { DashboardStatsData } from '../types/dashboard.types';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentChange(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

function toSignedTrend(value: number): string {
  const rounded = round1(value);
  const sign = rounded >= 0 ? '+' : '';
  return `${sign}${rounded}`;
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

function formatMonthYearFr(date: Date): string {
  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function formatMonthEn(date: Date): string {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return monthNames[date.getMonth()];
}

function normalizeInvoiceStatus(status: InvoiceStatus): 'PAID' | 'PENDING' | 'DRAFT' | 'CANCELLED' {
  if (status === InvoiceStatus.PAID) return 'PAID';
  if (status === InvoiceStatus.DRAFT) return 'DRAFT';
  if (status === InvoiceStatus.CANCELLED) return 'CANCELLED';
  return 'PENDING';
}

export async function getDashboardStats(userId: string): Promise<DashboardStatsData> {
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const previousMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const previousMonthEnd = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const months = getLast12CalendarMonths(now);
  const twelveMonthsStart = startOfMonth(months[0]);
  const [
    paidThisMonthAgg,
    paidPreviousMonthAgg,
    pendingIssuedAgg,
    activeClientsRaw,
    quotationTotalCount,
    quotationAcceptedCount,
    quotationConvertedCount,
    quotationSentCount,
    invoiceTotalCount,
    activeQuotationClientsRaw,
    paidInvoicesForDelay,
    paidInvoicesCurrentMonthForDelay,
    paidInvoices12Months,
    paidInvoicesPreviousMonthForDelay,
    topClientsCurrent,
    topClientsPrevious,
    paidTotalsAgg,
    emittedTotalsAgg,
    draftInvoicesCount,
    recentConversionsRaw,
    latestInvoicesRaw,
    paidInvoicesAllTimeCount,
    issuedCount,
    overdueCount,
    draftCount,
  ] =
    await prisma.$transaction([
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
      prisma.invoice.aggregate({
      where: { userId, status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] } },
      _sum: { total: true },
      _count: true,
    }),
      prisma.invoice.findMany({
      where: { userId },
      select: { clientId: true },
      distinct: ['clientId'],
    }),
      prisma.quotation.count({ where: { userId } }),
      prisma.quotation.count({ where: { userId, status: QuotationStatus.ACCEPTED } }),
      prisma.quotation.count({ where: { userId, status: QuotationStatus.CONVERTED } }),
      prisma.quotation.count({ where: { userId, status: QuotationStatus.SENT } }),
      prisma.invoice.count({ where: { userId } }),
      prisma.quotation.findMany({
        where: { userId },
        select: { clientId: true },
        distinct: ['clientId'],
      }),
      prisma.invoice.findMany({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { not: null },
      },
      select: {
        createdAt: true,
        paidDate: true,
      },
    }),
      prisma.invoice.findMany({
        where: {
          userId,
          status: InvoiceStatus.PAID,
          paidDate: { gte: thisMonthStart, lte: thisMonthEnd },
        },
        select: {
          createdAt: true,
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
      prisma.invoice.findMany({
        where: {
          userId,
          status: InvoiceStatus.PAID,
          paidDate: { gte: previousMonthStart, lte: previousMonthEnd },
        },
        select: {
          createdAt: true,
          paidDate: true,
        },
      }),
      prisma.invoice.groupBy({
        by: ['clientId'],
        where: {
          userId,
          status: InvoiceStatus.PAID,
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
          paidDate: { gte: previousMonthStart, lte: previousMonthEnd },
        },
        orderBy: { clientId: 'asc' },
        _sum: { total: true },
      }),
      prisma.invoice.aggregate({
        where: {
          userId,
          status: InvoiceStatus.PAID,
        },
        _sum: { total: true },
      }),
      prisma.invoice.aggregate({
      where: {
        userId,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID, InvoiceStatus.OVERDUE] },
      },
      _sum: { total: true },
      _count: true,
    }),
      prisma.invoice.count({
        where: { userId, status: InvoiceStatus.DRAFT },
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
        client: { select: { name: true, taxId: true } },
      },
    }),
      prisma.invoice.count({ where: { userId, status: InvoiceStatus.PAID } }),
      prisma.invoice.count({ where: { userId, status: InvoiceStatus.ISSUED } }),
      prisma.invoice.count({ where: { userId, status: InvoiceStatus.OVERDUE } }),
      prisma.invoice.count({ where: { userId, status: InvoiceStatus.DRAFT } }),
    ]);

  const caMensuelPaye = Number(paidThisMonthAgg._sum.total ?? 0);
  const caMensuelPayePrev = Number(paidPreviousMonthAgg._sum.total ?? 0);
  const caMensuelVariation = percentChange(caMensuelPaye, caMensuelPayePrev);
  const pendingAmount = Number(pendingIssuedAgg._sum.total ?? 0);
  const activeClients = new Set([
    ...activeClientsRaw.map((row) => row.clientId),
    ...activeQuotationClientsRaw.map((row) => row.clientId),
  ]).size;

  const avgDelayDays =
    paidInvoicesForDelay.length === 0
      ? 0
      : paidInvoicesForDelay.reduce((sum, row) => {
          const paidAt = row.paidDate?.getTime() ?? row.createdAt.getTime();
          return sum + (paidAt - row.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / paidInvoicesForDelay.length;

  const avgCurrentDelayDays =
    paidInvoicesCurrentMonthForDelay.length === 0
      ? 0
      : paidInvoicesCurrentMonthForDelay.reduce((sum, row) => {
          const paidAt = row.paidDate?.getTime() ?? row.createdAt.getTime();
          return sum + (paidAt - row.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / paidInvoicesCurrentMonthForDelay.length;

  const avgPrevDelayDays =
    paidInvoicesPreviousMonthForDelay.length === 0
      ? 0
      : paidInvoicesPreviousMonthForDelay.reduce((sum, row) => {
          const paidAt = row.paidDate?.getTime() ?? row.createdAt.getTime();
          return sum + (paidAt - row.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / paidInvoicesPreviousMonthForDelay.length;

  const caByMonth = new Map<string, number>();
  for (const invoice of paidInvoices12Months) {
    if (!invoice.paidDate) continue;
    const key = getMonthKey(invoice.paidDate);
    const current = caByMonth.get(key) ?? 0;
    caByMonth.set(key, current + Number(invoice.total));
  }

  const revenueChartData = months.map((monthDate) => {
    const key = getMonthKey(monthDate);
    const ca = caByMonth.get(key) ?? 0;
    return {
      month: formatMonthYearFr(monthDate),
      amount: round2(ca),
    };
  });
  const totalRevenue12Months = revenueChartData.reduce((sum, row) => sum + row.amount, 0);
  const peakMonthData = revenueChartData.reduce(
    (max, row, index) => (row.amount > max.amount ? { index, amount: row.amount } : max),
    { index: -1, amount: -1 },
  );
  const peakMonth = peakMonthData.index >= 0 ? formatMonthEn(months[peakMonthData.index]) : '';

  const previousByClient = new Map<string, number>();
  for (const row of topClientsPrevious) {
    previousByClient.set(row.clientId, Number(row._sum?.total ?? 0));
  }

  const topClientIds = topClientsCurrent.map((row) => row.clientId);
  const topClientsDetails = topClientIds.length
    ? await prisma.client.findMany({
        where: { userId, id: { in: topClientIds } },
        select: { id: true, name: true },
      })
    : [];
  const clientNameById = new Map(topClientsDetails.map((c) => [c.id, c.name]));

  const totalPaidAllTime = Number(paidTotalsAgg._sum.total ?? 0);
  const topClients = topClientsCurrent.slice(0, 3).map((row) => {
    const current = Number(row._sum?.total ?? 0);
    const previous = previousByClient.get(row.clientId) ?? 0;
    const share = totalPaidAllTime > 0 ? (current / totalPaidAllTime) * 100 : 0;
    return {
      name: clientNameById.get(row.clientId) ?? 'Client inconnu',
      percentage: round2(share),
      trend: toSignedTrend(percentChange(current, previous)),
      share: round2(share),
    };
  });

  const totalIssuedAmount = Number(emittedTotalsAgg._sum.total ?? 0);
  const pendingCount = issuedCount + overdueCount;
  const ratioTotal = invoiceTotalCount;
  const paidRatioPercentage = ratioTotal > 0 ? (paidInvoicesAllTimeCount / ratioTotal) * 100 : 0;
  const recoveryRate = totalIssuedAmount > 0 ? (totalPaidAllTime / totalIssuedAmount) * 100 : 0;

  const totalQuotations = quotationTotalCount;
  const acceptedQuotations = quotationAcceptedCount;
  const convertedQuotations = quotationConvertedCount;
  const sentQuotations = quotationSentCount;
  const conversionRate = totalQuotations > 0 ? ((acceptedQuotations + convertedQuotations) / totalQuotations) * 100 : 0;

  const conversionHistory = recentConversionsRaw
    .filter((row) => row.convertedInvoice !== null)
    .map((row) => ({
      quotationNumber: row.quotationNumber,
      invoiceNumber: row.convertedInvoice!.invoiceNumber,
      clientName: row.client.name,
    }));

  const recentInvoices = latestInvoicesRaw.map((invoice) => ({
    number: invoice.invoiceNumber,
    clientName: invoice.client.name,
    clientType: invoice.client.taxId ? 'Entreprise' : 'Particulier',
    amount: round2(Number(invoice.total)),
    currency: invoice.currency,
    date: invoice.issueDate.toISOString().split('T')[0],
    status: normalizeInvoiceStatus(invoice.status),
  }));

  const paidPct = ratioTotal > 0 ? (paidInvoicesAllTimeCount / ratioTotal) * 100 : 0;
  const pendingPct = ratioTotal > 0 ? (pendingCount / ratioTotal) * 100 : 0;
  const draftPct = ratioTotal > 0 ? (draftCount / ratioTotal) * 100 : 0;

  return {
    kpis: {
      monthlyRevenue: {
        amount: round2(caMensuelPaye),
        currency: 'TND',
        trend: toSignedTrend(caMensuelVariation),
      },
      paidInvoicesRatio: {
        paid: paidInvoicesAllTimeCount,
        total: ratioTotal,
        percentage: round2(paidRatioPercentage),
      },
      pendingAmount: round2(pendingAmount),
      activeClients: activeClients,
      activeQuotations: sentQuotations,
      avgPaymentDays: round2(avgDelayDays),
      avgPaymentTrend: toSignedTrend(avgCurrentDelayDays - avgPrevDelayDays),
    },
    revenueChart: {
      total: round2(totalRevenue12Months),
      peakMonth,
      data: revenueChartData,
    },
    statusDistribution: {
      paid: round2(paidPct),
      pending: round2(pendingPct),
      draft: round2(draftPct),
    },
    topClients,
    recoveryRate: round2(recoveryRate),
    conversionRate: round2(conversionRate),
    draftCount: draftInvoicesCount,
    conversionHistory,
    recentInvoices,
  };
}

export async function getStats(userId: number): Promise<DashboardStatsData> {
  return getDashboardStats(String(userId));
}
