export interface DashboardMonthlyRevenue {
  amount: number;
  currency: string;
  trend: string;
}

export interface DashboardPaidInvoicesRatio {
  paid: number;
  total: number;
  percentage: number;
}

export interface DashboardKpis {
  monthlyRevenue: DashboardMonthlyRevenue;
  paidInvoicesRatio: DashboardPaidInvoicesRatio;
  pendingAmount: number;
  activeClients: number;
  activeQuotations: number;
  avgPaymentDays: number;
  avgPaymentTrend: string;
}

export interface DashboardRevenueChartItem {
  month: string;
  amount: number;
}

export interface DashboardRevenueChart {
  total: number;
  peakMonth: string;
  data: DashboardRevenueChartItem[];
}

export interface DashboardStatusDistribution {
  paid: number;
  pending: number;
  draft: number;
}

export interface DashboardTopClient {
  name: string;
  percentage: number;
  trend: string;
  share: number;
}

export interface DashboardConversionHistoryItem {
  quotationNumber: string;
  invoiceNumber: string;
  clientName: string;
}

export interface DashboardRecentInvoiceItem {
  number: string;
  clientName: string;
  clientType: string;
  amount: number;
  currency: string;
  date: string;
  status: 'PAID' | 'PENDING' | 'DRAFT' | 'CANCELLED';
}

export interface DashboardStatsData {
  kpis: DashboardKpis;
  revenueChart: DashboardRevenueChart;
  statusDistribution: DashboardStatusDistribution;
  topClients: DashboardTopClient[];
  recoveryRate: number;
  conversionRate: number;
  draftCount: number;
  conversionHistory: DashboardConversionHistoryItem[];
  recentInvoices: DashboardRecentInvoiceItem[];
}
