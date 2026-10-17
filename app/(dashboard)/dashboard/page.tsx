'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';
import { formatCurrency, formatNumber, formatPercent, getPeriodRange, calculateKPIs, generateInsights, type InsightRule } from '@/lib/calculations';
import type { Sale, Expense } from '@/types/database';
import { OwnerPasswordDialog } from '@/components/shared/owner-password-dialog';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, Receipt, Wallet,
  AlertTriangle, CheckCircle2, Info, XCircle, ArrowUpRight, ArrowDownRight,
  Calendar, Lock, Unlock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';

const periodOptions = [
  { value: 'today', label: 'Hari Ini' },
  { value: 'yesterday', label: 'Kemarin' },
  { value: 'this_week', label: 'Minggu Ini' },
  { value: 'this_month', label: 'Bulan Ini' },
  { value: 'last_month', label: 'Bulan Lalu' },
  { value: 'this_year', label: 'Tahun Ini' },
];

export default function DashboardPage() {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'OWNER';
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [profitUnlocked, setProfitUnlocked] = useState(false);
  const [period, setPeriod] = useState('this_month');
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; revenue: number }[]>([]);

  const loadData = useCallback(async () => {
    if (!profile?.store_id) return;
    setLoading(true);

    const { start, end } = getPeriodRange(period);

    const [salesRes, expensesRes] = await Promise.all([
      supabase
        .from('sales')
        .select('*, sale_items(*), refunds(*)')
        .eq('store_id', profile.store_id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('expenses')
        .select('*, expense_category:expense_categories(*)')
        .eq('store_id', profile.store_id)
        .gte('expense_date', start.toISOString().split('T')[0])
        .lte('expense_date', end.toISOString().split('T')[0])
        .order('created_at', { ascending: false }),
    ]);

    if (salesRes.data) setSales(salesRes.data as Sale[]);
    if (expensesRes.data) setExpenses(expensesRes.data as Expense[]);

    // Calculate top products
    if (salesRes.data) {
      const productMap = new Map<string, { qty: number; revenue: number }>();
      salesRes.data.forEach((sale: any) => {
        sale.sale_items?.forEach((item: any) => {
          const existing = productMap.get(item.product_name) || { qty: 0, revenue: 0 };
          productMap.set(item.product_name, {
            qty: existing.qty + item.quantity,
            revenue: existing.revenue + Number(item.subtotal),
          });
        });
      });
      const top = Array.from(productMap.entries())
        .map(([name, data]) => ({ name, qty: data.qty, revenue: data.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
      setTopProducts(top);
    }

    setLoading(false);
  }, [profile?.store_id, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (sessionStorage.getItem('kasirflow_financials_unlocked') === 'true') {
        setProfitUnlocked(true);
      }
    }
  }, []);

  const lockFinancials = () => {
    setProfitUnlocked(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('kasirflow_financials_unlocked');
    }
    toast.info('Grafik tren keuangan, profit, dan Business Insight dikunci kembali.');
  };

  const kpis = calculateKPIs(sales, expenses);
  const insights = generateInsights(kpis, sales);

  // Daily revenue chart data
  const dailyData = (() => {
    const map = new Map<string, { date: string; revenue: number; expense: number; profit: number }>();
    sales.filter(s => s.status === 'COMPLETED').forEach(s => {
      const date = s.created_at.slice(0, 10);
      const existing = map.get(date) || { date, revenue: 0, expense: 0, profit: 0 };
      existing.revenue += Number(s.grand_total);
      existing.profit += Number(s.grand_total) - Number(s.total_hpp);
      map.set(date, existing);
    });
    expenses.forEach(e => {
      const date = e.expense_date;
      const existing = map.get(date) || { date, revenue: 0, expense: 0, profit: 0 };
      existing.expense += Number(e.amount);
      existing.profit -= Number(e.amount);
      map.set(date, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)).map((entry) => ({
      ...entry,
      date: new Date(`${entry.date}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
    }));
  })();

  // Payment method distribution
  const paymentData = (() => {
    const map = new Map<string, number>();
    sales.filter(s => s.status === 'COMPLETED').forEach(s => {
      map.set(s.payment_method, (map.get(s.payment_method) || 0) + Number(s.grand_total));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  })();

  const chartConfig: ChartConfig = {
    revenue: { label: 'Revenue', color: 'hsl(160 84% 39%)' },
    expense: { label: 'Pengeluaran', color: 'hsl(348 83% 47%)' },
    profit: { label: 'Profit', color: 'hsl(222 47% 40%)' },
  };

  const PIE_COLORS = ['hsl(160 84% 39%)', 'hsl(348 83% 47%)', 'hsl(32 95% 44%)', 'hsl(222 47% 40%)', 'hsl(280 65% 60%)'];

  const insightIcons = {
    positive: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
    warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
    negative: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
    info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard BI</h1>
          <p className="text-muted-foreground text-sm mt-1">Analisis bisnis real-time untuk toko Anda</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {profitUnlocked ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 border border-emerald-500/20">
                <Unlock className="h-3.5 w-3.5" />
                Finansial Terbuka
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={lockFinancials}
                className="h-9 text-xs"
              >
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Kunci Kembali
              </Button>
            </div>
          ) : (
            isOwner && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPasswordDialogOpen(true)}
                className="h-9 text-xs border-primary/40 text-primary hover:bg-primary/10"
              >
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Buka Data Finansial
              </Button>
            )
          )}
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)
        ) : (
          <>
            <KPICard
              title="Revenue"
              value={formatCurrency(kpis.revenue)}
              icon={DollarSign}
              subtitle={`${kpis.transactionCount} transaksi`}
              color="text-blue-600"
              bg="bg-blue-50"
            />
            {isOwner && profitUnlocked ? (
              <>
                <KPICard
                  title="Gross Profit"
                  value={formatCurrency(kpis.grossProfit)}
                  icon={TrendingUp}
                  subtitle={`Margin ${formatPercent(kpis.grossMargin)}`}
                  color="text-success"
                  bg="bg-success/10"
                />
                <KPICard
                  title="Net Profit"
                  value={formatCurrency(kpis.netProfit)}
                  icon={kpis.netProfit >= 0 ? TrendingUp : TrendingDown}
                  subtitle={`Margin ${formatPercent(kpis.netMargin)}`}
                  color={kpis.netProfit >= 0 ? 'text-success' : 'text-destructive'}
                  bg={kpis.netProfit >= 0 ? 'bg-success/10' : 'bg-destructive/10'}
                />
                <KPICard
                  title="Pengeluaran"
                  value={formatCurrency(kpis.operatingExpense)}
                  icon={Wallet}
                  subtitle="Biaya operasional"
                  color="text-destructive"
                  bg="bg-destructive/10"
                />
              </>
            ) : (
              <>
                <Card className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Gross Profit</p>
                    <p className="font-medium text-sm mt-0.5">{isOwner ? 'Terkunci' : 'Khusus owner'}</p>
                  </div>
                  {isOwner && (
                    <Button size="sm" variant="outline" onClick={() => setPasswordDialogOpen(true)}>
                      <Lock className="mr-1.5 h-3.5 w-3.5" />
                      Buka
                    </Button>
                  )}
                </Card>
                <Card className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Net Profit</p>
                    <p className="font-medium text-sm mt-0.5">{isOwner ? 'Terkunci' : 'Khusus owner'}</p>
                  </div>
                  {isOwner && (
                    <Button size="sm" variant="outline" onClick={() => setPasswordDialogOpen(true)}>
                      <Lock className="mr-1.5 h-3.5 w-3.5" />
                      Buka
                    </Button>
                  )}
                </Card>
                <Card className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Pengeluaran</p>
                    <p className="font-medium text-sm mt-0.5">{isOwner ? 'Terkunci' : 'Khusus owner'}</p>
                  </div>
                  {isOwner && (
                    <Button size="sm" variant="outline" onClick={() => setPasswordDialogOpen(true)}>
                      <Lock className="mr-1.5 h-3.5 w-3.5" />
                      Buka
                    </Button>
                  )}
                </Card>
              </>
            )}
          </>
        )}
      </div>
      <OwnerPasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        onVerified={() => {
          setProfitUnlocked(true);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('kasirflow_financials_unlocked', 'true');
          }
          toast.success('Data finansial, tren, dan Business Insight terbuka');
        }}
        title="Buka Data Finansial & Insight"
        description="Masukkan PIN otorisasi toko atau sandi login Owner untuk membuka grafik tren, insight bisnis, dan detail profit."
      />

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : (
          <>
            <MiniStat label="HPP Total" value={isOwner && profitUnlocked ? formatCurrency(kpis.totalHpp) : 'Terkunci'} icon={ShoppingBag} />
            <MiniStat label="AOV" value={formatCurrency(kpis.aov)} icon={Receipt} />
            <MiniStat label="Gross Margin" value={isOwner && profitUnlocked ? formatPercent(kpis.grossMargin) : 'Terkunci'} icon={TrendingUp} />
            <MiniStat label="Net Margin" value={isOwner && profitUnlocked ? formatPercent(kpis.netMargin) : 'Terkunci'} icon={TrendingUp} />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Revenue/Expense/Profit Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <span>Tren Revenue & Pengeluaran & Profit</span>
                {(!isOwner || !profitUnlocked) && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground border">
                    <Lock className="h-3 w-3" />
                    Terkunci
                  </span>
                )}
              </CardTitle>
              <CardDescription>Perbandingan harian dalam periode terpilih</CardDescription>
            </div>
            {isOwner && !profitUnlocked && (
              <Button size="sm" variant="outline" onClick={() => setPasswordDialogOpen(true)} className="h-8 text-xs">
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Buka Tren
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : !isOwner || !profitUnlocked ? (
              <div className="h-[300px] flex flex-col items-center justify-center p-6 text-center rounded-lg border border-dashed bg-muted/20">
                <div className="p-3 rounded-full bg-primary/10 text-primary mb-3">
                  <Lock className="h-6 w-6" />
                </div>
                <p className="font-semibold text-base">Grafik Tren Keuangan Terkunci</p>
                <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                  Grafik tren omzet, pengeluaran harian, dan profit toko diproteksi untuk menjaga kerahasiaan performa finansial usaha.
                </p>
                {isOwner ? (
                  <Button size="sm" onClick={() => setPasswordDialogOpen(true)}>
                    <Lock className="mr-1.5 h-3.5 w-3.5" />
                    Buka dengan PIN / Sandi Owner
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full border">
                    Khusus Akses Pemilik Toko (Owner)
                  </span>
                )}
              </div>
            ) : dailyData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(160 84% 39%)" fill="hsl(160 84% 39%)" fillOpacity={0.1} strokeWidth={2} />
                  <Area type="monotone" dataKey="expense" stroke="hsl(348 83% 47%)" fill="hsl(348 83% 47%)" fillOpacity={0.1} strokeWidth={2} />
                  {isOwner && profitUnlocked && <Area type="monotone" dataKey="profit" stroke="hsl(222 47% 40%)" fill="hsl(222 47% 40%)" fillOpacity={0.1} strokeWidth={2} />}
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Payment Method Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metode Pembayaran</CardTitle>
            <CardDescription>Distribusi per metode</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : paymentData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <PieChart>
                  <Pie
                    data={paymentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    label={(entry: any) => entry.name}
                    labelLine={false}
                  >
                    {paymentData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products & BI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Produk Terlaris</CardTitle>
            <CardDescription>Top 5 produk berdasarkan revenue</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data penjualan</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.qty} terjual</p>
                    </div>
                    <p className="text-sm font-semibold text-success">{formatCurrency(product.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* BI Insights */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <span>Business Insight</span>
                {(!isOwner || !profitUnlocked) && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground border">
                    <Lock className="h-3 w-3" />
                    Terkunci
                  </span>
                )}
              </CardTitle>
              <CardDescription>Analisis otomatis dari engine KasirFlow</CardDescription>
            </div>
            {isOwner && !profitUnlocked && (
              <Button size="sm" variant="outline" onClick={() => setPasswordDialogOpen(true)} className="h-8 text-xs">
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Buka Insight
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : !isOwner || !profitUnlocked ? (
              <div className="min-h-[220px] flex flex-col items-center justify-center p-6 text-center rounded-lg border border-dashed bg-muted/20">
                <div className="p-3 rounded-full bg-primary/10 text-primary mb-3">
                  <Lock className="h-6 w-6" />
                </div>
                <p className="font-semibold text-base">Business Insight Terkunci</p>
                <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                  Analisis otomatis margin laba, evaluasi efisiensi pengeluaran, dan rekomendasi bisnis KasirFlow hanya dapat diakses oleh Pemilik Toko.
                </p>
                {isOwner ? (
                  <Button size="sm" onClick={() => setPasswordDialogOpen(true)}>
                    <Lock className="mr-1.5 h-3.5 w-3.5" />
                    Buka dengan PIN / Sandi Owner
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full border">
                    Khusus Akses Pemilik Toko (Owner)
                  </span>
                )}
              </div>
            ) : insights.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada insight tersedia</p>
            ) : (
              <div className="space-y-3">
                {insights.map((insight: InsightRule, i) => {
                  const config = insightIcons[insight.type];
                  const Icon = config.icon;
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${config.bg} ${config.border}`}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${config.color}`} />
                      <div>
                        <p className="text-sm font-medium">{insight.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products Bar Chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Revenue per Produk Terlaris</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[200px] w-full rounded-lg" />
          ) : topProducts.length === 0 ? (
            <EmptyChart />
          ) : (
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={100} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="revenue" fill="hsl(160 84% 39%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPICard({ title, value, icon: Icon, subtitle, color, bg }: {
  title: string;
  value: string;
  icon: any;
  subtitle: string;
  color: string;
  bg: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg} shrink-0`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
      <p className="text-sm">Belum ada data untuk ditampilkan</p>
    </div>
  );
}
