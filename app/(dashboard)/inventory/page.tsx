'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Plus,
  Boxes,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle2,
  MoreVertical,
  LockKeyhole,
  RotateCcw,
  Sliders,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import type { Product, InventoryLog } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OwnerPasswordDialog } from '@/components/shared/owner-password-dialog';
import { toast } from 'sonner';

export default function InventoryPage() {
  const { profile, store, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<(InventoryLog & { product?: { name: string; sku: string | null } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Top restock form
  const [showRestockForm, setShowRestockForm] = useState(false);
  const [topProductId, setTopProductId] = useState('');
  const [topQuantity, setTopQuantity] = useState('');
  const [topNote, setTopNote] = useState('');
  const [savingTopRestock, setSavingTopRestock] = useState(false);

  // Password authorization state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'topRestock' | 'stockAction' | null>(null);

  // Selected product action modal (Three-dots)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'restock' | 'adjust' | 'min_stock'>('restock');

  // Action form values
  const [actionQty, setActionQty] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [newActualStock, setNewActualStock] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [newMinStock, setNewMinStock] = useState('');
  const [savingAction, setSavingAction] = useState(false);

  const targetStoreId = store?.id || profile?.store_id || '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';
  const targetUserId = user?.id || profile?.id || '00000000-0000-4000-8000-000000000001';

  const loadProducts = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch(`/api/products?storeId=${targetStoreId}&_t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.products && json.products.length > 0) {
          const rows = json.products as Product[];
          setProducts(rows);
          if (!topProductId && rows[0]) {
            setTopProductId(rows[0].id);
          }
          setLoading(false);
          return;
        }
      }
    } catch {}

    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', targetStoreId)
      .is('deleted_at', null)
      .order('name');

    const rows = (data as Product[] | null) ?? [];
    setProducts(rows);
    if (!topProductId && rows[0]) {
      setTopProductId(rows[0].id);
    }
    setLoading(false);
  }, [targetStoreId, topProductId]);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from('inventory_logs')
      .select('*, product:products(name, sku)')
      .eq('store_id', targetStoreId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) console.error(error.message);
    setLogs((data as any[]) ?? []);
    setLoadingLogs(false);
  }, [targetStoreId]);

  useEffect(() => {
    void loadProducts();
    void loadLogs();
  }, [loadProducts, loadLogs]);

  // Click on the top "+ Restock Produk" button
  const handleTopRestockClick = () => {
    if (showRestockForm) {
      setShowRestockForm(false);
      return;
    }
    setPendingAction('topRestock');
    setPasswordDialogOpen(true);
  };

  // Click on the Three-Dots ("...") on each product row
  const handleStockActionClick = (product: Product) => {
    setSelectedProduct(product);
    setActionQty('');
    setActionNote('');
    setNewActualStock(String(product.stock));
    setAdjustReason('');
    setNewMinStock(String(product.min_stock));
    setActiveTab('restock');
    setPendingAction('stockAction');
    setPasswordDialogOpen(true);
  };

  // Password verified callback
  const handleVerifiedPassword = () => {
    if (pendingAction === 'topRestock') {
      setShowRestockForm(true);
    } else if (pendingAction === 'stockAction' && selectedProduct) {
      setStockDialogOpen(true);
    }
    setPendingAction(null);
  };

  // Submit top restock
  const executeTopRestock = async (event: React.FormEvent) => {
    event.preventDefault();
    const product = products.find((item) => item.id === topProductId);
    const qty = parseInt(topQuantity, 10);

    if (!product || isNaN(qty) || qty <= 0) {
      toast.error('Pilih produk dan masukkan jumlah restock yang valid (minimal 1)');
      return;
    }

    setSavingTopRestock(true);

    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: product.id,
          storeId: targetStoreId,
          userId: targetUserId,
          restock_add: qty,
          note: topNote.trim() || 'Restock supplier',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Gagal melakukan restock');
      }

      toast.success(`Berhasil menambah ${qty} unit stok untuk "${product.name}"`);
      setTopQuantity('');
      setTopNote('');
      setShowRestockForm(false);
      loadProducts();
      loadLogs();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menambah stok produk');
    } finally {
      setSavingTopRestock(false);
    }
  };

  // Submit individual stock action from dialog
  const handleExecuteStockAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setSavingAction(true);

    try {
      if (activeTab === 'restock') {
        const qty = parseInt(actionQty, 10);
        if (isNaN(qty) || qty <= 0) {
          toast.error('Masukkan jumlah restock yang valid (minimal 1)');
          setSavingAction(false);
          return;
        }

        const res = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedProduct.id,
            storeId: targetStoreId,
            userId: targetUserId,
            restock_add: qty,
            note: actionNote.trim() || 'Restock manual via aksi produk',
          }),
        });

        if (!res.ok) {
          const errJson = await res.json();
          throw new Error(errJson.error || 'Gagal melakukan restock');
        }

        toast.success(`Restock +${qty} unit berhasil ditambahkan.`);
      } else if (activeTab === 'adjust') {
        const actual = parseInt(newActualStock, 10);
        if (isNaN(actual) || actual < 0) {
          toast.error('Masukkan jumlah stok fisik yang valid');
          setSavingAction(false);
          return;
        }

        const res = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedProduct.id,
            storeId: targetStoreId,
            userId: targetUserId,
            stock: actual,
            note: adjustReason.trim() || 'Penyesuaian stok opname',
          }),
        });

        if (!res.ok) {
          const errJson = await res.json();
          throw new Error(errJson.error || 'Gagal menyesuaikan stok');
        }

        toast.success(`Stok "${selectedProduct.name}" disesuaikan menjadi ${actual} unit.`);
      } else if (activeTab === 'min_stock') {
        const minVal = parseInt(newMinStock, 10);
        if (isNaN(minVal) || minVal < 0) {
          toast.error('Masukkan angka batas minimum yang valid');
          setSavingAction(false);
          return;
        }

        const res = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedProduct.id,
            storeId: targetStoreId,
            userId: targetUserId,
            min_stock: minVal,
          }),
        });

        if (!res.ok) {
          const errJson = await res.json();
          throw new Error(errJson.error || 'Gagal mengubah batas minimum');
        }

        toast.success(`Batas minimum stok diperbarui menjadi ${minVal} unit.`);
      }

      setStockDialogOpen(false);
      setSelectedProduct(null);
      loadProducts();
      loadLogs();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan perubahan stok');
    } finally {
      setSavingAction(false);
    }
  };

  const lowStockCount = products.filter((p) => p.stock <= p.min_stock && p.stock > 0).length;
  const outOfStockCount = products.filter((p) => p.stock <= 0).length;
  const safeStockCount = products.filter((p) => p.stock > p.min_stock).length;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventori & Stok</h1>
          <p className="text-sm text-muted-foreground">
            Kelola stok masuk, opname fisik, dan riwayat pergerakan produk toko Anda.
          </p>
        </div>
        <Button onClick={handleTopRestockClick} variant="default">
          <Plus className="mr-2 h-4 w-4" />
          {showRestockForm ? 'Tutup Formulir' : 'Restock Produk'}
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase">Total Produk</p>
            <p className="text-2xl font-bold mt-1">{products.length}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Boxes className="h-5 w-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase">Stok Aman</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{safeStockCount}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase">Stok Menipis</p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{lowStockCount}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase">Stok Habis</p>
            <p className="text-2xl font-bold mt-1 text-destructive">{outOfStockCount}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </Card>
      </div>

      {/* Restock Form (Requires verification) */}
      {showRestockForm && (
        <Card className="border-primary/30 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Form Tambah Stok (Restock Cepat)
            </CardTitle>
            <CardDescription>
              Pilih produk dan masukkan jumlah unit yang ditambahkan ke gudang/toko.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={executeTopRestock} className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Pilih Produk</label>
                <select
                  value={topProductId}
                  onChange={(e) => setTopProductId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stok: {p.stock} {p.sku ? `| SKU: ${p.sku}` : ''})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Jumlah Tambahan Unit</label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Contoh: 10"
                  value={topQuantity}
                  onChange={(e) => setTopQuantity(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Catatan / Supplier</label>
                <Input
                  placeholder="Contoh: Restock Supplier A"
                  value={topNote}
                  onChange={(e) => setTopNote(e.target.value)}
                />
              </div>
              <div className="flex gap-2 sm:col-span-3 pt-2">
                <Button type="submit" disabled={savingTopRestock}>
                  {savingTopRestock && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Simpan Restock
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowRestockForm(false)}>
                  Batal
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Products Stock Overview Table */}
      <Card>
        <CardHeader>
          <CardTitle>Status Stok Produk</CardTitle>
          <CardDescription>
            Daftar seluruh produk. Klik menu titik tiga pada baris produk untuk restock atau opname.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : products.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada produk terdaftar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-3">Nama Produk</th>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3">Stok Saat Ini</th>
                    <th className="px-3 py-3">Min. Stok</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const isOut = p.stock <= 0;
                    const isLow = p.stock <= p.min_stock && !isOut;
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-3 py-3 font-medium">{p.name}</td>
                        <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{p.sku || '-'}</td>
                        <td className="px-3 py-3 font-bold">{p.stock}</td>
                        <td className="px-3 py-3 text-muted-foreground">{p.min_stock}</td>
                        <td className="px-3 py-3">
                          {isOut ? (
                            <Badge variant="destructive">Habis</Badge>
                          ) : isLow ? (
                            <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Menipis</Badge>
                          ) : (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">Aman</Badge>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 flex items-center gap-1.5 hover:bg-primary/10"
                            title="Aksi Stok (Perlu Sandi Owner)"
                            onClick={() => handleStockActionClick(p)}
                          >
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs">Aksi</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Movement Log History */}
      <Card>
        <CardHeader>
          <CardTitle>Riwayat Aktivitas Inventori</CardTitle>
          <CardDescription>Log perubahan stok keluar dan masuk secara kronologis.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada riwayat pergerakan stok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-3">Tanggal & Waktu</th>
                    <th className="px-3 py-3">Produk</th>
                    <th className="px-3 py-3">Tipe</th>
                    <th className="px-3 py-3">Perubahan</th>
                    <th className="px-3 py-3">Stok Sebelum &rarr; Sesudah</th>
                    <th className="px-3 py-3">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const isPositive = log.quantity_change > 0;
                    return (
                      <tr key={log.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-3 py-3 text-muted-foreground text-xs">
                          {new Date(log.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="px-3 py-3 font-medium">
                          {log.product?.name || 'Produk'}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline" className="font-mono text-xs">
                            {log.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center font-semibold ${
                              isPositive ? 'text-emerald-600' : 'text-destructive'
                            }`}
                          >
                            {isPositive ? <ArrowUpRight className="h-4 w-4 mr-0.5" /> : <ArrowDownRight className="h-4 w-4 mr-0.5" />}
                            {isPositive ? `+${log.quantity_change}` : log.quantity_change}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {log.stock_before} &rarr; <span className="font-medium text-foreground">{log.stock_after}</span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">{log.note || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stock Action Dialog (Titik Tiga Password Protected) */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockKeyhole className="h-5 w-5 text-emerald-600" />
              Kelola Stok: {selectedProduct?.name}
            </DialogTitle>
            <DialogDescription>
              Akses otorisasi owner terverifikasi. Pilih jenis pengelolaan stok:
            </DialogDescription>
          </DialogHeader>

          {selectedProduct && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/60 p-3 text-xs space-y-1 border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stok Fisik Tercatat:</span>
                  <span className="font-bold text-foreground">{selectedProduct.stock} unit</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Batas Minimum Notifikasi:</span>
                  <span>{selectedProduct.min_stock} unit</span>
                </div>
              </div>

              {/* Mode Selection Tabs */}
              <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('restock')}
                  className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                    activeTab === 'restock' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  + Tambah Stok
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('adjust')}
                  className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                    activeTab === 'adjust' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Opname Fisik
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('min_stock')}
                  className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                    activeTab === 'min_stock' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Batas Min
                </button>
              </div>

              <form onSubmit={handleExecuteStockAction} className="space-y-3 pt-1">
                {activeTab === 'restock' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Jumlah Unit Restock</label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="Contoh: 12"
                        value={actionQty}
                        onChange={(e) => setActionQty(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Catatan / Keterangan</label>
                      <Input
                        placeholder="Contoh: Kiriman supplier toko"
                        value={actionNote}
                        onChange={(e) => setActionNote(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {activeTab === 'adjust' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium">
                        Stok Fisik Aktual Baru (Hasil Hitung Rak)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        placeholder={`Saat ini: ${selectedProduct.stock}`}
                        value={newActualStock}
                        onChange={(e) => setNewActualStock(e.target.value)}
                        required
                        autoFocus
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Selisih: {parseInt(newActualStock || '0', 10) - selectedProduct.stock > 0 ? `+${parseInt(newActualStock || '0', 10) - selectedProduct.stock}` : parseInt(newActualStock || '0', 10) - selectedProduct.stock} unit
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Alasan Penyesuaian</label>
                      <Input
                        placeholder="Contoh: Selisih hitung opname bulanan / barang rusak"
                        value={adjustReason}
                        onChange={(e) => setAdjustReason(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}

                {activeTab === 'min_stock' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      Batas Minimum Stok (Peringatan Stok Menipis)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={newMinStock}
                      onChange={(e) => setNewMinStock(e.target.value)}
                      required
                      autoFocus
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Kasir & sistem akan menandai produk sebagai &quot;Menipis&quot; bila stok menyentuh angka ini.
                    </p>
                  </div>
                )}

                <DialogFooter className="pt-2 flex sm:justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStockDialogOpen(false)}
                    disabled={savingAction}
                  >
                    Batal
                  </Button>
                  <Button type="submit" disabled={savingAction}>
                    {savingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan Perubahan Stok
                  </Button>
                </DialogFooter>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Password verification dialog */}
      <OwnerPasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        onVerified={handleVerifiedPassword}
        title="Otorisasi Akses Stok"
        description="Aksi menu titik tiga inventori memerlukan verifikasi kata sandi atau PIN toko agar karyawan tidak salah pencet."
      />
    </div>
  );
}
