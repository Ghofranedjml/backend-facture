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

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

function getLast12Months(now: Date): Date[] {
  const months: Date[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return months;
}

export async function getDashboardStats(userId: string): Promise<DashboardStatsData> {
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  
  // Mois précédent pour les tendances
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthStart = startOfMonth(previousMonthDate);
  const previousMonthEnd = endOfMonth(previousMonthDate);
  
  // 12 derniers mois pour le graphique
  const last12Months = getLast12Months(now);
  const twelveMonthsStart = startOfMonth(last12Months[0]);
  
  const [
    // KPIs - mois courant
    currentMonthRevenueAgg,
    totalInvoicesCount,
    paidInvoicesCount,
    issuedInvoicesCount,
    overdueInvoicesCount,
    draftInvoicesCount,
    pendingAmountAgg,
    activeClientsCount,
    activeQuotationsCount,
    paidForAvgDelay,
    
    // KPIs - mois précédent (pour tendances)
    previousMonthRevenueAgg,
    previousMonthPaidInvoicesCount,
    
    // Graphique 12 mois
    paidForChart,
    
    // Top clients (montants bruts)
    topClientGroups,
    
    // Taux recouvrement (counts bruts)
    totalIssuedOrPaidCount,
    paidInvoicesWithDueDateCount,
    
    // Conversion
    quotationTotalCount,
    quotationConvertedCount,
    
    // Dernières factures
    recentInvoices,
    
    // Historique conversions
    conversionHistoryRows,
    
    // Délai moyen paiement mois précédent (pour tendance)
    previousMonthPaidForAvgDelay,
    
    // CA total 12 mois (pour parts top clients)
    totalRevenue12MonthsAgg,
    
  ] = await prisma.$transaction([
    // CA mois courant
    prisma.invoice.aggregate({
      where: { userId, status: InvoiceStatus.PAID, paidDate: { gte: currentMonthStart, lte: currentMonthEnd } },
      _sum: { total: true },
    }),
    // Total factures
    prisma.invoice.count({ where: { userId } }),
    // Factures payées
    prisma.invoice.count({ where: { userId, status: InvoiceStatus.PAID } }),
    // Factures ISSUED
    prisma.invoice.count({ where: { userId, status: InvoiceStatus.ISSUED } }),
    // Factures OVERDUE
    prisma.invoice.count({ where: { userId, status: InvoiceStatus.OVERDUE } }),
    // Factures DRAFT
    prisma.invoice.count({ where: { userId, status: InvoiceStatus.DRAFT } }),
    // Montant en attente (ISSUED + OVERDUE)
    prisma.invoice.aggregate({
      where: { userId, status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] } },
      _sum: { total: true },
    }),
    // Clients actifs (avec au moins 1 facture ou 1 devis)
    prisma.client.count({
      where: {
        userId,
        OR: [
          { invoices: { some: {} } },
          { quotations: { some: {} } }
        ]
      },
    }),
    // Devis actifs (SENT uniquement)
    prisma.quotation.count({
      where: { userId, status: QuotationStatus.SENT },
    }),
    // Délai moyen paiement (factures PAYÉES)
    prisma.invoice.findMany({
      where: { userId, status: InvoiceStatus.PAID, paidDate: { not: null } },
      select: { issueDate: true, paidDate: true },
    }),
    
    // CA mois précédent
    prisma.invoice.aggregate({
      where: { userId, status: InvoiceStatus.PAID, paidDate: { gte: previousMonthStart, lte: previousMonthEnd } },
      _sum: { total: true },
    }),
    // Factures payées mois précédent
    prisma.invoice.count({
      where: { userId, status: InvoiceStatus.PAID, paidDate: { gte: previousMonthStart, lte: previousMonthEnd } },
    }),
    
    // Données graphique 12 mois
    prisma.invoice.findMany({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { gte: twelveMonthsStart, lte: currentMonthEnd },
      },
      select: { total: true, paidDate: true },
    }),
    
    // Top clients (top 5 par CA)
    prisma.invoice.groupBy({
      by: ['clientId'],
      where: { userId, status: InvoiceStatus.PAID },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    }),
    
    // Taux recouvrement
    prisma.invoice.count({
      where: {
        userId,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] }
      },
    }),
    prisma.invoice.count({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { not: null }
      },
    }),
    
    // Total devis
    prisma.quotation.count({ where: { userId } }),
    // Devis convertis
    prisma.quotation.count({ where: { userId, status: QuotationStatus.CONVERTED } }),
    
    // 5 dernières factures
    prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        client: { select: { name: true } }
      }
    }),
    
    // Historique conversions (5 derniers devis convertis)
    prisma.quotation.findMany({
      where: {
        userId,
        status: QuotationStatus.CONVERTED,
        convertedToInvoiceId: { not: null }
      },
      orderBy: { convertedAt: 'desc' },
      take: 5,
      select: {
        quotationNumber: true,
        convertedToInvoiceId: true,
        client: { select: { name: true } }
      }
    }),
    
    // Délai paiement mois précédent
    prisma.invoice.findMany({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { gte: previousMonthStart, lte: previousMonthEnd, not: null }
      },
      select: { issueDate: true, paidDate: true },
    }),
    
    // CA total 12 mois (pour parts des top clients)
    prisma.invoice.aggregate({
      where: {
        userId,
        status: InvoiceStatus.PAID,
        paidDate: { gte: twelveMonthsStart, lte: currentMonthEnd }
      },
      _sum: { total: true },
    }),
  ]);
  
  // Calcul des moyennes de délai
  const avgPaymentDays = paidForAvgDelay.length === 0
    ? 0
    : round2(paidForAvgDelay.reduce((sum, row) => {
        const paidAt = row.paidDate!.getTime();
        return sum + (paidAt - row.issueDate.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / paidForAvgDelay.length);
  
  const previousAvgPaymentDays = previousMonthPaidForAvgDelay.length === 0
    ? 0
    : round2(previousMonthPaidForAvgDelay.reduce((sum, row) => {
        const paidAt = row.paidDate!.getTime();
        return sum + (paidAt - row.issueDate.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / previousMonthPaidForAvgDelay.length);
  
  // Agrégation des données graphique 12 mois
  const revenueByMonth = new Map<string, number>();
  for (const row of paidForChart) {
    if (!row.paidDate) continue;
    const key = formatMonthKey(row.paidDate);
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + Number(row.total));
  }
  
  const revenueChartData = last12Months.map((monthDate) => {
    const key = formatMonthKey(monthDate);
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    return {
      month: `${monthNames[monthDate.getMonth()]} ${monthDate.getFullYear()}`,
      amount: round2(revenueByMonth.get(key) ?? 0),
    };
  });
  
  // Calcul du CA total sur 12 mois et du pic
  const totalRevenue12Months = round2(Number(totalRevenue12MonthsAgg._sum.total ?? 0));
  const peakMonth = revenueChartData.reduce(
    (max, curr) => curr.amount > max.amount ? curr : max,
    { month: '', amount: 0 }
  );
  
  // Récupération des noms des top clients
  const topClientIds = topClientGroups.map((c) => c.clientId);
  const topClientsDetails = topClientIds.length
    ? await prisma.client.findMany({
        where: { userId, id: { in: topClientIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(topClientsDetails.map((c) => [c.id, c.name]));
  
  // Top clients avec montants bruts uniquement (le frontend fera les %)
  const topClients = topClientGroups.map((group) => ({
    id: group.clientId,
    name: nameById.get(group.clientId) ?? 'Client inconnu',
    amount: round2(Number(group._sum?.total ?? 0)),
  }));
  
  // Historique conversions formaté
  const conversionHistory = await Promise.all(
    conversionHistoryRows.map(async (row) => {
      let invoiceNumber = null;
      if (row.convertedToInvoiceId) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: row.convertedToInvoiceId },
          select: { invoiceNumber: true },
        });
        invoiceNumber = invoice?.invoiceNumber ?? null;
      }
      return {
        quotationNumber: row.quotationNumber,
        invoiceNumber: invoiceNumber,
        clientName: row.client.name,
      };
    })
  );
  
  // Dernières factures formatées
  const formattedRecentInvoices = recentInvoices.map((inv) => ({
    number: inv.invoiceNumber,
    clientName: inv.client.name,
    amount: round2(Number(inv.total)),
    date: inv.issueDate.toISOString().split('T')[0],
    status: inv.status,
  }));
  
  // Montants bruts pour KPIs
  const currentMonthRevenue = round2(Number(currentMonthRevenueAgg._sum.total ?? 0));
  const previousMonthRevenue = round2(Number(previousMonthRevenueAgg._sum.total ?? 0));
  const pendingAmount = round2(Number(pendingAmountAgg._sum.total ?? 0));
  
  // Counts bruts pour répartition (frontend fera les %)
  const pendingInvoicesCount = issuedInvoicesCount + overdueInvoicesCount;
  const statusCounts = {
    PAID: paidInvoicesCount,
    PENDING: pendingInvoicesCount,
    DRAFT: draftInvoicesCount,
  };
  
  // Taux de conversion (brut)
  const conversionRate = quotationTotalCount > 0
    ? (quotationConvertedCount / quotationTotalCount) * 100
    : 0;
  
  // Taux de recouvrement
  const recoveryRate = totalIssuedOrPaidCount > 0
    ? (paidInvoicesWithDueDateCount / totalIssuedOrPaidCount) * 100
    : 0;
  
  return {
    // KPIs avec données brutes + période précédente (frontend calculera tendances)
    kpis: {
      monthlyRevenue: {
        current: currentMonthRevenue,
        previous: previousMonthRevenue,
      },
      paidInvoicesCount: {
        current: paidInvoicesCount,
        previous: previousMonthPaidInvoicesCount,
      },
      totalInvoicesCount: totalInvoicesCount,
      pendingAmount: pendingAmount,
      activeClients: activeClientsCount,
      activeQuotations: activeQuotationsCount,
      avgPaymentDays: {
        current: avgPaymentDays,
        previous: previousAvgPaymentDays,
      },
      draftCount: draftInvoicesCount,
      currency: 'TND',
    },
    // Graphique (12 mois)
    revenueChart: {
      total: totalRevenue12Months,
      peakMonth: peakMonth.month,
      data: revenueChartData,
    },
    // Counts bruts pour répartition statuts
    statusCounts: statusCounts,
    // Top clients (montants bruts)
    topClients: topClients,
    // Taux (valeurs brutes 0-100)
    recoveryRate: round2(recoveryRate),
    conversionRate: round2(conversionRate),
    // Historique
    conversionHistory: conversionHistory.filter(h => h.invoiceNumber !== null),
    // Dernières factures
    recentInvoices: formattedRecentInvoices,
  };
}

export async function getStats(userId: number | string): Promise<DashboardStatsData> {
  return getDashboardStats(String(userId));
}