import { InvoiceStatus, QuotationStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { DashboardStatsData } from '../types/dashboard.types';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatMonth(date: Date): string {
  const shortMonths = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${shortMonths[date.getMonth()]} ${date.getFullYear()}`;
}

function getLast6Months(now: Date): Date[] {
  const months: Date[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return months;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

export async function getDashboardStats(userId: string): Promise<DashboardStatsData> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const sixMonths = getLast6Months(now);
  const sixMonthsStart = startOfMonth(sixMonths[0]);

  const [
    monthlyRevenueAgg,
    totalInvoicesCount,
    paidInvoicesCount,
    pendingAmountAgg,
    invoiceClientIds,
    activeQuotationsCount,
    paidForAvgDelay,
    paidForChart,
    statusIssuedCount,
    statusOverdueCount,
    statusPaidCount,
    statusDraftCount,
    topClientGroups,
    recoveredOverdueCount,
    overdueBaseCount,
    quotationTotalCount,
    quotationConvertedCount,
    recentInvoices,
  ] = await prisma.$transaction([
    prisma.invoice.aggregate({
      where: { userId, status: InvoiceStatus.PAID, paidDate: { gte: monthStart, lte: monthEnd } },
      _sum: { total: true },
    }),
    prisma.invoice.count({ where: { userId } }),
    prisma.invoice.count({ where: { userId, status: InvoiceStatus.PAID } }),
    prisma.invoice.aggregate({
      where: { userId, status: InvoiceStatus.ISSUED },
      _sum: { total: true },
    }),
    prisma.invoice.findMany({
      where: { userId },
      select: { clientId: true },
      distinct: ['clientId'],
    }),
    prisma.quotation.count({
      where: { userId, status: { in: [QuotationStatus.SENT, QuotationStatus.DRAFT] } },
    }),
    prisma.invoice.findMany({
      where: { userId, status: InvoiceStatus.PAID, paidDate: { not: null } },
      select: { issueDate: true, paidDate: true },
    }),
    prisma.invoice.findMany({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { gte: sixMonthsStart, lte: monthEnd },
      },
      select: { total: true, paidDate: true },
    }),
    prisma.invoice.count({ where: { userId, status: InvoiceStatus.ISSUED } }),
    prisma.invoice.count({ where: { userId, status: InvoiceStatus.OVERDUE } }),
    prisma.invoice.count({ where: { userId, status: InvoiceStatus.PAID } }),
    prisma.invoice.count({ where: { userId, status: InvoiceStatus.DRAFT } }),
    prisma.invoice.groupBy({
      by: ['clientId'],
      where: { userId, status: InvoiceStatus.PAID },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    }),
    prisma.invoice.count({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { not: null },
        dueDate: { lt: new Date() },
      },
    }),
    prisma.invoice.count({
      where: {
        userId,
        OR: [
          { status: InvoiceStatus.OVERDUE },
          { status: InvoiceStatus.PAID, paidDate: { not: null }, dueDate: { lt: new Date() } },
        ],
      },
    }),
    prisma.quotation.count({ where: { userId } }),
    prisma.quotation.count({ where: { userId, status: QuotationStatus.CONVERTED } }),
    prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const topClientIds = topClientGroups.map((client) => client.clientId);
  const topClientsDetails = topClientIds.length
    ? await prisma.client.findMany({
        where: { userId, id: { in: topClientIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(topClientsDetails.map((item) => [item.id, item.name]));

  const byMonth = new Map<string, number>();
  for (const row of paidForChart) {
    if (!row.paidDate) continue;
    const key = monthKey(row.paidDate);
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(row.total));
  }

  const revenueChart = sixMonths.map((monthDate) => ({
    month: formatMonth(monthDate),
    revenue: round2(byMonth.get(monthKey(monthDate)) ?? 0),
  }));

  const avgPaymentDays =
    paidForAvgDelay.length === 0
      ? 0
      : paidForAvgDelay.reduce((sum, row) => {
          const paidAt = row.paidDate?.getTime() ?? row.issueDate.getTime();
          return sum + (paidAt - row.issueDate.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / paidForAvgDelay.length;

  const statusDistribution = [
    { status: InvoiceStatus.PAID, count: statusPaidCount },
    { status: 'PENDING', count: statusIssuedCount + statusOverdueCount },
    { status: InvoiceStatus.DRAFT, count: statusDraftCount },
  ];

  const topClients = await Promise.all(
    topClientGroups.map(async (group) => ({
      id: group.clientId,
      name: nameById.get(group.clientId) ?? 'Client inconnu',
      total: round2(Number(group._sum?.total ?? 0)),
      invoiceCount: await prisma.invoice.count({
        where: { userId, status: InvoiceStatus.PAID, clientId: group.clientId },
      }),
    })),
  );

  const recoveryRate = overdueBaseCount > 0 ? (recoveredOverdueCount / overdueBaseCount) * 100 : 0;
  const conversionRate = quotationTotalCount > 0 ? (quotationConvertedCount / quotationTotalCount) * 100 : 0;

  return {
    kpis: {
      monthlyRevenue: round2(Number(monthlyRevenueAgg._sum.total ?? 0)),
      paidInvoicesRatio: totalInvoicesCount > 0 ? round2((paidInvoicesCount / totalInvoicesCount) * 100) : 0,
      pendingAmount: round2(Number(pendingAmountAgg._sum.total ?? 0)),
      activeClients: invoiceClientIds.length,
      activeQuotations: activeQuotationsCount,
      avgPaymentDays: round2(avgPaymentDays),
    },
    revenueChart,
    statusDistribution,
    topClients,
    recoveryRate: round2(recoveryRate),
    conversionRate: round2(conversionRate),
    recentInvoices,
  };
}

export async function getStats(userId: number | string): Promise<DashboardStatsData> {
  return getDashboardStats(String(userId));
}
