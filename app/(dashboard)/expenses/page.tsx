'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import type { Expense } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function ExpensesPage() {
  const { profile } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: '', description: '', expense_date: new Date().toISOString().slice(0, 10) });

  const loadExpenses = useCallback(async () => {
    if (!profile?.store_id) return;
    setLoading(true);
    const { data, error } = await supabase.from('expenses').select('*').eq('store_id', profile.store_id).order('expense_date', { ascending: false }).order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setExpenses((data as Expense[] | null) ?? []);
    setLoading(false);
  }, [profile?.store_id]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const addExpense = async () => {
    if (!profile?.store_id || !profile.id || Number(form.amount) <= 0 || !form.description.trim()) {
      toast.error('Keterangan dan nominal pengeluaran wajib diisi');
      return;
    }
    const { error } = await supabase.from('expenses').insert({
      store_id: profile.store_id,
      user_id: profile.id,
      amount: Number(form.amount),
      description: form.description.trim(),
      expense_date: form.expense_date,
    });
    if (error) toast.error(error.message);
    else {
      toast.success('Pengeluaran dicatat');
      setForm({ amount: '', description: '', expense_date: new Date().toISOString().slice(0, 10) });
      setShowForm(false);
      loadExpenses();
    }
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Pengeluaran</h1><p className="text-sm text-muted-foreground">Catat biaya operasional toko.</p></div>
        <Button onClick={() => setShowForm((value) => !value)}><Plus className="mr-2 h-4 w-4" />Tambah pengeluaran</Button>
      </div>
      {showForm && <Card className="mb-6"><CardHeader><CardTitle>Catat pengeluaran</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3">
        <div><label className="mb-1 block text-sm font-medium">Keterangan</label><Input placeholder="Contoh: listrik toko" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
        <div><label className="mb-1 block text-sm font-medium">Nominal</label><Input type="number" min="1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></div>
        <div><label className="mb-1 block text-sm font-medium">Tanggal</label><Input type="date" value={form.expense_date} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} /></div>
        <div className="flex gap-2 sm:col-span-3"><Button onClick={addExpense}>Simpan</Button><Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button></div>
      </CardContent></Card>}
      <Card><CardHeader><CardTitle>Riwayat pengeluaran</CardTitle></CardHeader><CardContent>
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : expenses.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Belum ada pengeluaran.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="px-3 py-3">Tanggal</th><th className="px-3 py-3">Keterangan</th><th className="px-3 py-3">Nominal</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-b last:border-0"><td className="px-3 py-3">{expense.expense_date}</td><td className="px-3 py-3">{expense.description || '-'}</td><td className="px-3 py-3">Rp {Number(expense.amount).toLocaleString('id-ID')}</td></tr>)}</tbody></table></div>}
      </CardContent></Card>
    </div>
  );
}
