export interface DashboardKpis {
  monthlyRevenue: number;
  paidInvoicesRatio: number;
  pendingAmount: number;
  activeClients: number;
  activeQuotations: number;
  avgPaymentDays: number;
}

export interface DashboardRevenueChartItem {
  month: string;
  revenue: number;
}

export interface DashboardStatusDistributionItem {
  status: string;
  count: number;
}

export interface DashboardTopClient {
  id: string;
  name: string;
  total: number;
  invoiceCount: number;
}

export interface DashboardStatsData {
  kpis: DashboardKpis;
  revenueChart: DashboardRevenueChartItem[];
  statusDistribution: DashboardStatusDistributionItem[];
  topClients: DashboardTopClient[];
  recoveryRate: number;
  conversionRate: number;
  recentInvoices: unknown[];
}
