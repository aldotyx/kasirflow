'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Printer, Lock, Unlock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import type { Expense, Sale } from '@/types/database';
import { OwnerPasswordDialog } from '@/components/shared/owner-password-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type ReportMode = 'simple' | 'tax';

export default function ReportsPage() {
  const { profile, store } = useAuth();
  const isOwner = profile?.role === 'OWNER';
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [mode, setMode] = useState<ReportMode>('simple');
  const [taxRate, setTaxRate] = useState(Number(store?.tax_rate || 12));
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [profitUnlocked, setProfitUnlocked] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

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
    toast.info('Data profit dan laporan keuangan dikunci kembali.');
  };

  const loadReport = useCallback(async () => {
    if (!profile?.store_id) return;
    setLoading(true);
    const start = `${month}-01T00:00:00.000Z`;
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const [salesRes, expensesRes] = await Promise.all([
      supabase.from('sales').select('*').eq('store_id', profile.store_id).gte('created_at', start).lt('created_at', end.toISOString()).order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').eq('store_id', profile.store_id).gte('expense_date', `${month}-01`).lt('expense_date', end.toISOString().slice(0, 10)),
    ]);
    if (salesRes.error) toast.error(salesRes.error.message);
    if (expensesRes.error) toast.error(expensesRes.error.message);
    setSales((salesRes.data as Sale[] | null) ?? []);
    setExpenses((expensesRes.data as Expense[] | null) ?? []);
    setLoading(false);
  }, [month, profile?.store_id]);

  useEffect(() => { void loadReport(); }, [loadReport]);
  useEffect(() => { if (store?.tax_rate !== undefined) setTaxRate(Number(store.tax_rate || 12)); }, [store?.tax_rate]);

  const completed = useMemo(() => sales.filter((sale) => sale.status === 'COMPLETED'), [sales]);
  const revenue = useMemo(() => completed.reduce((sum, sale) => sum + Number(sale.subtotal), 0), [completed]);
  const tax = useMemo(() => completed.reduce((sum, sale) => sum + Number(sale.tax_amount), 0), [completed]);
  const hpp = useMemo(() => completed.reduce((sum, sale) => sum + Number(sale.total_hpp), 0), [completed]);
  const expenseTotal = useMemo(() => expenses.reduce((sum, expense) => sum + Number(expense.amount), 0), [expenses]);
  const grossProfit = revenue - hpp;
  const netProfit = grossProfit - expenseTotal;
  const csvValue = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

  const exportCsv = () => {
    const header = mode === 'simple'
      ? ['Bulan', 'Revenue', 'HPP', 'Gross Profit', 'Pengeluaran', 'Net Profit']
      : ['Bulan', 'DPP/Penjualan', 'Tarif Pajak', 'Pajak Keluaran', 'Total Penjualan', 'HPP', 'Pengeluaran', 'Laba Bersih'];
    const row = mode === 'simple'
      ? [month, revenue, hpp, grossProfit, expenseTotal, netProfit]
      : [month, revenue, `${taxRate}%`, revenue * taxRate / 100, revenue + (revenue * taxRate / 100), hpp, expenseTotal, netProfit];
    const lines = mode === 'tax' ? [header, row, [], ['Catatan', 'Draft rekap pajak untuk pemeriksaan owner; bukan pengganti pelaporan resmi DJP/Bea Cukai.']] : [header, row];
    const blob = new Blob([`\uFEFF${lines.map((line) => line.map(csvValue).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${mode === 'simple' ? 'evaluasi' : 'rekap-pajak'}-${month}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const saveTaxRate = async () => {
    if (!isOwner || !profile?.store_id || taxRate < 0 || taxRate > 100) return;
    const { error } = await supabase.from('stores').update({ tax_rate: taxRate }).eq('id', profile.store_id);
    if (error) toast.error(error.message); else toast.success('Tarif pajak toko disimpan');
  };

  return <div className="p-4 lg:p-6 print:p-0">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 print:mb-3">
      <div>
        <h1 className="text-2xl font-bold">Laporan</h1>
        <p className="text-sm text-muted-foreground print:hidden">Pilih laporan evaluasi sederhana atau draft rekap pajak.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        {profitUnlocked ? (
          <div className="flex items-center gap-2 mr-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 border border-emerald-500/20">
              <Unlock className="h-3.5 w-3.5" />
              Finansial Terbuka
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={lockFinancials}
              className="h-10 text-xs"
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
              className="h-10 text-xs mr-2 border-primary/40 text-primary hover:bg-primary/10"
            >
              <Lock className="mr-1.5 h-3.5 w-3.5" />
              Buka Profit
            </Button>
          )
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Bulan</label>
          <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tipe</label>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={mode} onChange={(event) => setMode(event.target.value as ReportMode)}>
            <option value="simple">Evaluasi sederhana</option>
            <option value="tax">Rekap pajak</option>
          </select>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={loading}>
          <Download className="mr-2 h-4 w-4" />Excel/CSV
        </Button>
        <Button onClick={() => window.print()} disabled={loading}>
          <Printer className="mr-2 h-4 w-4" />PDF
        </Button>
      </div>
    </div>
    <Card><CardHeader><CardTitle>{store?.name || 'KasirFlow'} — {mode === 'simple' ? 'Evaluasi usaha' : 'Draft rekap pajak'} {month}</CardTitle></CardHeader><CardContent>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : <div className="space-y-4">
        {mode === 'simple' ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg bg-muted p-4"><p className="text-sm text-muted-foreground">Revenue</p><p className="text-xl font-bold">Rp {revenue.toLocaleString('id-ID')}</p></div>
          <div className="rounded-lg bg-muted p-4"><p className="text-sm text-muted-foreground">Transaksi</p><p className="text-xl font-bold">{completed.length}</p></div>
          {profitUnlocked ? [['HPP', hpp], ['Gross Profit', grossProfit], ['Pengeluaran', expenseTotal], ['Net Profit', netProfit]].map(([label, value]) => <div className="rounded-lg bg-muted p-4" key={String(label)}><p className="text-sm text-muted-foreground">{label}</p><p className="text-xl font-bold">Rp {Number(value).toLocaleString('id-ID')}</p></div>) : <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 sm:col-span-2 lg:col-span-3"><p className="text-sm text-amber-900">Detail profit dikunci.</p>{isOwner ? <Button size="sm" className="mt-2" onClick={() => setPasswordDialogOpen(true)}>Buka dengan password owner</Button> : <p className="mt-1 text-sm font-medium text-amber-900">Khusus owner</p>}</div>}
        </div> : <><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Ini draft rekap internal. Untuk SPT resmi, validasi dengan akuntan dan sistem pelaporan pajak yang berlaku.</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg bg-muted p-4"><p className="text-sm text-muted-foreground">DPP/Penjualan (Revenue)</p><p className="text-xl font-bold">Rp {revenue.toLocaleString('id-ID')}</p></div>{profitUnlocked ? <><div className="rounded-lg bg-muted p-4"><p className="text-sm text-muted-foreground">Tarif pajak</p>{isOwner ? <div className="flex gap-2"><Input type="number" min="0" max="100" value={taxRate} onChange={(event) => setTaxRate(Number(event.target.value))} /><Button size="sm" onClick={() => { setPasswordDialogOpen(true); }}>Simpan</Button></div> : <p className="text-xl font-bold">{taxRate}%</p>}</div><div className="rounded-lg bg-muted p-4"><p className="text-sm text-muted-foreground">Pajak keluaran</p><p className="text-xl font-bold">Rp {(revenue * taxRate / 100).toLocaleString('id-ID')}</p></div><div className="rounded-lg bg-muted p-4"><p className="text-sm text-muted-foreground">Laba bersih</p><p className="text-xl font-bold">Rp {netProfit.toLocaleString('id-ID')}</p></div></> : <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 sm:col-span-2"><p className="text-sm text-amber-900">Detail pajak dan profit dikunci.</p>{isOwner ? <Button size="sm" className="mt-2" onClick={() => setPasswordDialogOpen(true)}>Buka dengan password owner</Button> : <p className="mt-1 text-sm font-medium text-amber-900">Khusus owner</p>}</div>}</div></>}
        <p className="text-sm text-muted-foreground">{completed.length} transaksi selesai, {expenses.length} pengeluaran.</p>
      </div>}
    </CardContent></Card>
    <OwnerPasswordDialog
      open={passwordDialogOpen}
      onOpenChange={setPasswordDialogOpen}
      onVerified={() => {
        setProfitUnlocked(true);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('kasirflow_financials_unlocked', 'true');
        }
        toast.success('Akses detail profit dan laporan usaha terbuka');
        void saveTaxRate();
      }}
      title="Verifikasi Akses Laporan Owner"
      description="Masukkan PIN toko atau kata sandi Owner untuk melihat detail profit dan konfigurasi pajak usaha."
    />
  </div>;
}
