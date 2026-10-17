import type { Sale, Expense } from '@/types/database';

export interface KPIData {
  revenue: number;
  totalHpp: number;
  grossProfit: number;
  operatingExpense: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
  transactionCount: number;
  aov: number;
}

export function calculateKPIs(sales: Sale[], expenses: Expense[]): KPIData {
  const completedSales = sales.filter((s) => s.status === 'COMPLETED');

  const revenue = completedSales.reduce((sum, s) => sum + Number(s.grand_total), 0);
  const totalHpp = completedSales.reduce((sum, s) => sum + Number(s.total_hpp), 0);
  const grossProfit = revenue - totalHpp;
  const operatingExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netProfit = grossProfit - operatingExpense;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const transactionCount = completedSales.length;
  const aov = transactionCount > 0 ? revenue / transactionCount : 0;

  return {
    revenue,
    totalHpp,
    grossProfit,
    operatingExpense,
    netProfit,
    grossMargin,
    netMargin,
    transactionCount,
    aov,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export interface InsightRule {
  type: 'positive' | 'warning' | 'negative' | 'info';
  title: string;
  description: string;
}

export function generateInsights(kpis: KPIData, sales: Sale[]): InsightRule[] {
  const insights: InsightRule[] = [];

  if (kpis.netProfit > 0) {
    insights.push({
      type: 'positive',
      title: 'Bisnis Untung',
      description: `Net Profit Anda positif sebesar ${formatCurrency(kpis.netProfit)} dengan net margin ${formatPercent(kpis.netMargin)}. Pertahankan kinerja ini!`,
    });
  } else if (kpis.netProfit < 0) {
    insights.push({
      type: 'negative',
      title: 'Bisjian Rugi',
      description: `Net Profit Anda negatif sebesar ${formatCurrency(kpis.netProfit)}. Evaluasi pengeluaran operasional dan strategi pricing Anda.`,
    });
  } else {
    insights.push({
      type: 'info',
      title: 'Break Even',
      description: 'Bisnis Anda berada di titik impas. Pertimbangkan strategi untuk meningkatkan margin.',
    });
  }

  if (kpis.grossMargin < 20 && kpis.revenue > 0) {
    insights.push({
      type: 'warning',
      title: 'Gross Margin Rendah',
      description: `Gross margin Anda hanya ${formatPercent(kpis.grossMargin)}. Idealnya gross margin di atas 30%. Tinjau harga jual dan HPP Anda.`,
    });
  } else if (kpis.grossMargin >= 40) {
    insights.push({
      type: 'positive',
      title: 'Gross Margin Sehat',
      description: `Gross margin Anda ${formatPercent(kpis.grossMargin)}, sangat sehat! Produk Anda memiliki markup yang baik.`,
    });
  }

  if (kpis.operatingExpense > kpis.grossProfit && kpis.grossProfit > 0) {
    insights.push({
      type: 'negative',
      title: 'Biaya Operasional Terlalu Tinggi',
      description: `Pengeluaran operasional (${formatCurrency(kpis.operatingExpense)}) melebihi gross profit (${formatCurrency(kpis.grossProfit)}). Segera efisiensikan biaya.`,
    });
  }

  if (kpis.transactionCount > 0) {
    const avgItemsPerSale = sales.reduce((sum, s) => sum + (s.sale_items?.length ?? 0), 0) / kpis.transactionCount;
    if (avgItemsPerSale < 2) {
      insights.push({
        type: 'info',
        title: 'Peluang Upselling',
        description: `Rata-rata hanya ${avgItemsPerSale.toFixed(1)} item per transaksi. Pertimbangkan program bundling atau upselling.`,
      });
    }
  }

  return insights;
}

export function getPeriodRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date();
  const end = new Date();

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'yesterday':
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'this_week':
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      break;
    case 'this_month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last_month':
      start.setMonth(now.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'this_year':
      start.setMonth(0);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}
