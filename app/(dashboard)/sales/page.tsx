'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatDateTime } from '@/lib/calculations';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Receipt, Printer, CheckCircle2, Search, ExternalLink, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Sale = {
  id: string;
  invoice_number: string;
  payment_method: string;
  grand_total: number;
  subtotal: number;
  created_at: string;
  status: string;
  tax_amount: number;
  discount_amount: number;
  paid_amount: number;
  change_amount: number;
};

type Item = {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export default function SalesPage() {
  const { profile, store } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [search, setSearch] = useState('');

  const loadSales = useCallback(async () => {
    if (!profile?.store_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('store_id', profile.store_id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      toast.error(error.message);
    }
    setSales((data as Sale[]) || []);
    setLoading(false);
  }, [profile?.store_id]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const showReceipt = async (sale: Sale, autoPrint = false) => {
    setSelected(sale);
    setLoadingItems(true);
    const { data, error } = await supabase
      .from('sale_items')
      .select('product_name,quantity,unit_price,subtotal')
      .eq('sale_id', sale.id);

    if (error) {
      toast.error(error.message);
    }
    const loadedItems = (data as Item[]) || [];
    setItems(loadedItems);
    setLoadingItems(false);

    if (autoPrint) {
      setTimeout(() => {
        window.print();
      }, 350);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredSales = sales.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.invoice_number.toLowerCase().includes(q) ||
      s.payment_method.toLowerCase().includes(q) ||
      s.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Penjualan & Transaksi</h1>
          <p className="text-sm text-muted-foreground">
            Riwayat lengkap transaksi kasir, detail belanja, dan pencetakan struk.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nomor invoice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Menampilkan <span className="font-semibold text-foreground">{filteredSales.length}</span> transaksi
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Transaksi Penjualan</CardTitle>
          <CardDescription>Daftar invoice transaksi yang telah diproses oleh kasir.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredSales.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Belum ada transaksi.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-3">Invoice</th>
                    <th className="px-3 py-3">Metode Bayar</th>
                    <th className="px-3 py-3">Total Belanja</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Waktu Transaksi</th>
                    <th className="px-3 py-3 text-right">Opsi Struk</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-3 py-3 font-semibold font-mono text-foreground">
                        {s.invoice_number}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="font-mono text-xs">
                          {s.payment_method}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 font-bold text-foreground">
                        {formatCurrency(Number(s.grand_total))}
                      </td>
                      <td className="px-3 py-3">
                        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {formatDateTime(s.created_at)}
                      </td>
                      <td className="px-3 py-3 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void showReceipt(s, false)}
                          className="h-8"
                        >
                          <Receipt className="mr-1.5 h-3.5 w-3.5" />
                          Lihat Struk
                        </Button>
                        <a
                          href={`/receipt/${s.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-2.5"
                          title="Cetak struk di tab baru (bebas restriksi iframe)"
                        >
                          <Printer className="mr-1.5 h-3.5 w-3.5" />
                          Cetak
                          <ExternalLink className="ml-1 h-3 w-3 opacity-80" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Printable Receipt Dialog */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setItems([]);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader className="no-print">
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Struk Penjualan
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div id="printable-receipt" className="space-y-3 text-sm bg-background font-sans">
              {/* Store Header */}
              <div className="text-center pb-2 border-b">
                <h3 className="font-bold text-base tracking-tight">{store?.name || 'KASIRFLOW POS'}</h3>
                {store?.address && (
                  <p className="text-xs text-muted-foreground mt-0.5">{store.address}</p>
                )}
                {store?.phone && (
                  <p className="text-xs text-muted-foreground">{store.phone}</p>
                )}
              </div>

              {/* Invoice Meta */}
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">No. Invoice:</span>
                  <span className="font-mono font-semibold">{selected.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Waktu:</span>
                  <span>{formatDateTime(selected.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pembayaran:</span>
                  <span className="font-medium">{selected.payment_method}</span>
                </div>
              </div>

              <Separator />

              {/* Line Items */}
              <div className="space-y-1.5 py-1">
                {loadingItems ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : items.length === 0 ? (
                  <p className="text-xs text-center text-muted-foreground">Memuat item...</p>
                ) : (
                  items.map((item, i) => (
                    <div key={i} className="text-xs">
                      <div className="flex justify-between font-medium">
                        <span>{item.product_name}</span>
                        <span>{formatCurrency(Number(item.subtotal))}</span>
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {item.quantity} x {formatCurrency(Number(item.unit_price))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Separator />

              {/* Totals */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(Number(selected.subtotal))}</span>
                </div>
                {Number(selected.discount_amount) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Diskon</span>
                    <span>-{formatCurrency(Number(selected.discount_amount))}</span>
                  </div>
                )}
                {Number(selected.tax_amount) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Pajak (PPN)</span>
                    <span>+{formatCurrency(Number(selected.tax_amount))}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1 border-t">
                  <span>TOTAL</span>
                  <span>{formatCurrency(Number(selected.grand_total))}</span>
                </div>
                <div className="flex justify-between text-muted-foreground pt-0.5">
                  <span>Bayar</span>
                  <span>{formatCurrency(Number(selected.paid_amount))}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Kembalian</span>
                  <span>{formatCurrency(Number(selected.change_amount))}</span>
                </div>
              </div>

              <Separator />

              {/* Receipt Footer */}
              <div className="text-center text-[11px] text-muted-foreground pt-1 space-y-0.5">
                <p>Terima kasih atas kunjungan Anda!</p>
                <p>Barang yang sudah dibeli tidak dapat ditukar/dikembalikan.</p>
              </div>

              {/* Tip info for iframe / browser restrictions */}
              <div className="rounded-md bg-muted/60 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2 border">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>
                  <strong>Tips Print:</strong> Jika jendela printer laptop tidak muncul di preview AI Studio, gunakan tombol <strong>Cetak di Tab Baru</strong>.
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="no-print flex flex-col sm:flex-row sm:justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setItems([]);
              }}
            >
              Tutup
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="secondary" onClick={handlePrint} className="flex-1 sm:flex-none">
                <Printer className="mr-1.5 h-4 w-4" />
                Cetak Langsung
              </Button>
              {selected && (
                <a
                  href={`/receipt/${selected.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3 py-2 flex-1 sm:flex-none"
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Cetak di Tab Baru
                </a>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
