'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Plus,
  Search,
  Image as ImageIcon,
  MoreVertical,
  Trash2,
  Pencil,
  Percent,
  Package,
  AlertTriangle,
  LockKeyhole,
  Boxes,
  RotateCcw,
  Store,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import type { Product } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { OwnerPasswordDialog } from '@/components/shared/owner-password-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const getProductPrice = (product: Product) => {
  const discount = Math.min(100, Math.max(0, Number(product.discount_percent || 0)));
  return Number(product.sell_price) * (1 - discount / 100);
};

export default function ProductsPage() {
  const { profile, store, user, session } = useAuth();
  const isOwner = profile?.role === 'OWNER';
  const targetStoreId = store?.id || profile?.store_id || '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';
  const targetUserId = user?.id || profile?.id || '00000000-0000-4000-8000-000000000001';
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'open' | 'save' | 'edit' | 'delete' | 'actionMenu' | null>(null);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [actionProduct, setActionProduct] = useState<Product | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editImage, setEditImage] = useState<File | null>(null);
  const [editName, setEditName] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editBuyPrice, setEditBuyPrice] = useState('');
  const [editDiscount, setEditDiscount] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [addStockQty, setAddStockQty] = useState('');
  const [editMinStock, setEditMinStock] = useState('5');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [restockDialogOpen, setRestockDialogOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [quickRestockAmount, setQuickRestockAmount] = useState('10');
  const [quickRestockNote, setQuickRestockNote] = useState('Restock produk');
  const [saving, setSaving] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: 'Makanan & Camilan',
    buy_price: '',
    sell_price: '',
    stock: '',
    min_stock: '5',
    image: null as File | null,
  });

  const syncProductsToMenu = useCallback(async (prods: Product[]) => {
    try {
      const slug = store?.slug || 'aldocoffestreet';
      await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeSlug: slug, products: prods }),
      });
    } catch {
      // ignore
    }
  }, [store?.slug]);

  const loadProducts = useCallback(async () => {
    setLoading(true);

    // Initial check from localStorage cache for instant 0ms render
    try {
      const cached = localStorage.getItem(`kasirflow_products_cache_${targetStoreId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProducts(parsed);
        }
      }
    } catch {}

    try {
      const res = await fetch(`/api/products?storeId=${targetStoreId}&_t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.products && json.products.length > 0) {
          let list = json.products as Product[];
          // Overlay any active local overrides
          try {
            list = list.map((p) => {
              const localOverride = localStorage.getItem(`kasirflow_product_override_${p.id}`);
              if (localOverride) {
                const parsed = JSON.parse(localOverride);
                return { ...p, ...parsed };
              }
              return p;
            });
            localStorage.setItem(`kasirflow_products_cache_${targetStoreId}`, JSON.stringify(list));
          } catch {}

          setProducts(list);
          void syncProductsToMenu(list);
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

    if (data && data.length > 0) {
      setProducts(data as Product[]);
      void syncProductsToMenu(data as Product[]);
    } else {
      // Connect to shared live menu products so products always exist and match customer menu
      try {
        const slug = store?.slug || 'aldocoffestreet';
        const res = await fetch(`/api/menu?storeSlug=${encodeURIComponent(slug)}&_t=${Date.now()}`);
        if (res.ok) {
          const menuData = await res.json();
          if (menuData.products && menuData.products.length > 0) {
            setProducts(menuData.products as Product[]);
          }
        }
      } catch {
        setProducts((data as Product[] | null) ?? []);
      }
    }
    setLoading(false);
  }, [targetStoreId, store?.slug, syncProductsToMenu]);

  useEffect(() => {
    void loadProducts();

    // Listen to real-time updates from other tabs / windows
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('kasirflow_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'PRODUCTS_UPDATED' && event.data?.product) {
          const updated = event.data.product;
          setProducts((prev) =>
            prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
          );
        }
      };
    } catch {}

    const handleCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && detail.id) {
        setProducts((prev) =>
          prev.map((p) => (p.id === detail.id ? { ...p, ...detail } : p))
        );
      }
    };
    window.addEventListener('kasirflow_products_updated', handleCustomEvent);

    return () => {
      if (bc) bc.close();
      window.removeEventListener('kasirflow_products_updated', handleCustomEvent);
    };
  }, [loadProducts]);

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${targetStoreId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) {
        console.warn('Image upload error:', uploadError.message);
        return null;
      }
      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
      return data.publicUrl;
    } catch {
      return null;
    }
  };

  const executeAddProduct = async () => {
    if (!form.name.trim() || !form.sell_price) {
      toast.error('Nama produk dan harga jual wajib diisi');
      return;
    }

    setSaving(true);
    let imageUrl: string | null = null;
    if (form.image) {
      imageUrl = await uploadImage(form.image);
    }

    const buyPrice = Number(form.buy_price) || 0;
    const sellPrice = Number(form.sell_price) || 0;
    const stock = parseInt(form.stock || '0', 10) || 0;
    const minStock = parseInt(form.min_stock || '5', 10) || 5;

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: targetStoreId,
          userId: targetUserId,
          name: form.name.trim(),
          sku: form.sku.trim() || null,
          category: form.category.trim() || 'Makanan & Camilan',
          buy_price: buyPrice,
          sell_price: sellPrice,
          stock,
          min_stock: minStock,
          image_url: imageUrl,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Gagal menambahkan produk');
      }

      toast.success(`Produk "${form.name.trim()}" berhasil ditambahkan!`);
      setForm({ name: '', sku: '', category: 'Makanan & Camilan', buy_price: '', sell_price: '', stock: '', min_stock: '5', image: null });
      setShowForm(false);
      void loadProducts();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menambahkan produk');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddForm = () => {
    setPendingAction('open');
    setPasswordDialogOpen(true);
  };

  const handleThreeDotsClick = (product: Product) => {
    setActionProduct(product);
    setPendingAction('actionMenu');
    setPasswordDialogOpen(true);
  };

  const handleStartEdit = (product: Product) => {
    setEditProduct(product);
    setEditName(product.name || '');
    setEditSku(product.sku || '');
    setEditBuyPrice(String(product.buy_price ?? 0));
    setEditPrice(String(product.sell_price));
    setEditDiscount(String(product.discount_percent || 0));
    setEditStock(String(product.stock ?? 0));
    setAddStockQty('');
    setEditMinStock(String(product.min_stock ?? 5));
    setEditImage(null);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editProduct) return;
    setSaving(true);

    let imageUrl = editProduct.image_url;
    if (editImage) {
      const uploaded = await uploadImage(editImage);
      if (uploaded) imageUrl = uploaded;
    }

    const updatedName = editName.trim() || editProduct.name;
    const updatedSku = editSku.trim() || null;
    const updatedBuyPrice = !isNaN(Number(editBuyPrice)) && Number(editBuyPrice) >= 0 ? Number(editBuyPrice) : Number(editProduct.buy_price || 0);
    const updatedPrice = Number(editPrice) || Number(editProduct.sell_price);
    const updatedDiscount = Math.min(100, Math.max(0, Number(editDiscount) || 0));
    const parsedStock = parseInt(editStock, 10);
    const parsedAdd = addStockQty.trim() ? parseInt(addStockQty, 10) : undefined;
    const parsedMinStock = parseInt(editMinStock, 10) || 5;

    const finalStockCalculated = !isNaN(parsedStock)
      ? (parsedAdd && parsedAdd > 0 ? parsedStock + parsedAdd : parsedStock)
      : editProduct.stock;

    const optimisticProduct: Product = {
      ...editProduct,
      name: updatedName,
      sku: updatedSku,
      buy_price: updatedBuyPrice,
      sell_price: updatedPrice,
      discount_percent: updatedDiscount,
      stock: finalStockCalculated,
      min_stock: parsedMinStock,
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    };

    // 1. Instant 0ms local state update so user sees change immediately
    setProducts((prev) =>
      prev.map((p) => (p.id === editProduct.id ? optimisticProduct : p))
    );

    // 2. Persist to localStorage
    try {
      localStorage.setItem(`kasirflow_product_override_${editProduct.id}`, JSON.stringify(optimisticProduct));
      const cached = localStorage.getItem(`kasirflow_products_cache_${targetStoreId}`);
      if (cached) {
        const list = JSON.parse(cached);
        const idx = list.findIndex((p: any) => p.id === editProduct.id);
        if (idx >= 0) list[idx] = optimisticProduct;
        else list.push(optimisticProduct);
        localStorage.setItem(`kasirflow_products_cache_${targetStoreId}`, JSON.stringify(list));
      }
    } catch {}

    // 3. Broadcast real-time event across tabs
    try {
      const bc = new BroadcastChannel('kasirflow_sync');
      bc.postMessage({ type: 'PRODUCTS_UPDATED', product: optimisticProduct, storeId: targetStoreId });
      bc.close();
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kasirflow_products_updated', { detail: optimisticProduct }));
    }

    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          id: editProduct.id,
          storeId: targetStoreId,
          userId: targetUserId,
          name: updatedName,
          sku: updatedSku,
          buy_price: updatedBuyPrice,
          sell_price: updatedPrice,
          discount_percent: updatedDiscount,
          stock: !isNaN(parsedStock) ? parsedStock : undefined,
          restock_add: parsedAdd && !isNaN(parsedAdd) && parsedAdd > 0 ? parsedAdd : undefined,
          min_stock: parsedMinStock,
          image_url: imageUrl,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Gagal menyimpan perubahan ke server');
      }

      const resJson = await res.json();
      const confirmedProd = resJson.product ? { ...optimisticProduct, ...resJson.product } : optimisticProduct;

      setProducts((prev) =>
        prev.map((p) => (p.id === editProduct.id ? confirmedProd : p))
      );

      toast.success(`Produk "${updatedName}" berhasil diperbarui!`, {
        description: `Harga Jual: Rp ${updatedPrice.toLocaleString('id-ID')} · HPP: Rp ${updatedBuyPrice.toLocaleString('id-ID')}`,
      });

      setEditDialogOpen(false);
      setEditProduct(null);
      void loadProducts();
    } catch (err: any) {
      toast.error(err.message || 'Gagal memperbarui produk');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenQuickRestock = (product: Product) => {
    setRestockProduct(product);
    setQuickRestockAmount('10');
    setQuickRestockNote('Restock produk');
    setRestockDialogOpen(true);
  };

  const handleExecuteQuickRestock = async () => {
    if (!restockProduct) return;
    const qty = parseInt(quickRestockAmount, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Jumlah restock minimal 1 unit');
      return;
    }

    setSaving(true);
    const newStock = restockProduct.stock + qty;
    const restockedProduct = {
      ...restockProduct,
      stock: newStock,
      updated_at: new Date().toISOString(),
    };

    // Instant local state update
    setProducts((prev) =>
      prev.map((p) => (p.id === restockProduct.id ? restockedProduct : p))
    );

    // Save to localStorage & broadcast
    try {
      localStorage.setItem(`kasirflow_product_override_${restockProduct.id}`, JSON.stringify(restockedProduct));
      const bc = new BroadcastChannel('kasirflow_sync');
      bc.postMessage({ type: 'PRODUCTS_UPDATED', product: restockedProduct, storeId: targetStoreId });
      bc.close();
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kasirflow_products_updated', { detail: restockedProduct }));
    }

    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          id: restockProduct.id,
          storeId: targetStoreId,
          userId: targetUserId,
          restock_add: qty,
          note: quickRestockNote.trim() || `Restock +${qty} unit`,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Gagal menambah stok');
      }

      const json = await res.json();
      toast.success(`Berhasil menambah +${qty} unit stok untuk "${restockProduct.name}"!`, {
        description: `Total stok sekarang: ${json.newStock ?? newStock} unit`,
      });

      setRestockDialogOpen(false);
      setRestockProduct(null);
      void loadProducts();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menambah stok produk');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = (product: Product) => {
    setPendingProduct(product);
    void confirmDelete(product);
  };

  const confirmDelete = async (product: Product) => {
    try {
      await fetch(`/api/products?id=${product.id}`, { method: 'DELETE' });
      await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', product.id).catch(() => {});
      toast.success(`Produk "${product.name}" berhasil dihapus`);
      loadProducts();
    } catch {
      toast.error('Gagal menghapus produk');
    }
    setPendingProduct(null);
  };

  const handleVerifiedPassword = () => {
    if (pendingAction === 'open') {
      setShowForm(true);
    } else if (pendingAction === 'actionMenu' && actionProduct) {
      setActionDialogOpen(true);
    } else if (pendingAction === 'edit' && editProduct) {
      setEditDialogOpen(true);
    } else if (pendingAction === 'delete' && pendingProduct) {
      void confirmDelete(pendingProduct);
    }
    setPendingAction(null);
  };

  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.sku?.toLowerCase().includes(q) ?? false);
  });

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Store Identity Banner with Logo, Name & Quick Actions */}
      <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {store?.logo_url ? (
            <img
              src={store.logo_url}
              alt={store.name || 'Logo Toko'}
              className="h-14 w-14 rounded-xl object-cover border-2 border-primary/25 bg-white shadow-sm flex-shrink-0"
            />
          ) : (
            <div className="h-14 w-14 rounded-xl bg-primary/15 text-primary flex items-center justify-center border border-primary/20 flex-shrink-0">
              <Store className="h-7 w-7" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground truncate">
                {store?.name || 'Aldo Coffe Street'}
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary px-2 py-0.5 rounded-full border border-primary/25">
                Katalog Aktif
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {store?.address ? `${store.address} • ` : ''}ID Owner: <span className="font-mono text-foreground font-semibold">{user?.id?.substring(0, 18) || '00000000-0000'}...</span>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (products.length > 0) {
                handleOpenQuickRestock(products[0]);
              } else {
                toast.info('Belum ada produk. Tambahkan produk baru terlebih dahulu.');
              }
            }}
            className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 font-bold shadow-xs cursor-pointer"
          >
            <Boxes className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            + Tambah Stok Cepat
          </Button>

          <Button onClick={handleOpenAddForm} className="shadow-xs font-semibold">
            <Plus className="mr-2 h-4 w-4" />
            Tambah Produk
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              toast.info('Memperbarui katalog produk...');
              void loadProducts();
            }}
            title="Muat Ulang Katalog Produk"
            className="h-9 w-9 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search and stats bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama produk atau SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Menampilkan <span className="font-semibold text-foreground">{filteredProducts.length}</span> dari {products.length} produk
        </p>
      </div>

      {/* Add Product Form */}
      {showForm && (
        <Card className="border-primary/40 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Tambah Produk Baru</CardTitle>
            <CardDescription>Isi detail produk lengkap termasuk harga modal (HPP) dan harga jual.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void executeAddProduct();
              }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">Nama Produk</label>
                <Input
                  placeholder="Contoh: Kopi Susu Gula Aren"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Kode SKU / Barcode</label>
                <Input
                  placeholder="Contoh: KOP-01"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Kategori Produk</label>
                <div className="flex gap-1.5 flex-wrap mb-1">
                  {['Makanan', 'Camilan', 'Kopi', 'Non-Kopi'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm({ ...form, category: cat })}
                      className={`text-[11px] px-2 py-0.5 rounded cursor-pointer border transition ${
                        form.category.toLowerCase().includes(cat.toLowerCase())
                          ? 'bg-primary text-primary-foreground border-primary font-bold'
                          : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <Input
                  placeholder="Contoh: Makanan & Camilan"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Harga Modal / HPP (Opsional)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Contoh: 6000"
                  value={form.buy_price}
                  onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Harga Jual</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Contoh: 18000"
                  value={form.sell_price}
                  onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Stok Awal</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Contoh: 50"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Batas Minimum Stok</label>
                <Input
                  type="number"
                  min="1"
                  value={form.min_stock}
                  onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Foto Produk (Opsional)</label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setForm({ ...form, image: e.target.files?.[0] || null })}
                />
              </div>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-3 pt-2">
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Simpan Produk
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Batal
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Produk</CardTitle>
          <CardDescription>Semua barang yang aktif dijual di toko Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Package className="mx-auto h-12 w-12 opacity-40 mb-3" />
              <p className="text-base font-medium">Tidak ada produk ditemukan.</p>
              <p className="text-sm mt-1">Coba kata kunci lain atau tambahkan produk baru.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-3">Produk</th>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3">Harga Beli</th>
                    <th className="px-3 py-3">Harga Jual</th>
                    <th className="px-3 py-3">Diskon</th>
                    <th className="px-3 py-3">Harga Akhir</th>
                    <th className="px-3 py-3">Stok</th>
                    <th className="px-3 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const finalPrice = getProductPrice(product);
                    const discount = Number(product.discount_percent || 0);
                    return (
                      <tr key={product.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            {product.image_url && !imageErrors[product.id] ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                onError={() => setImageErrors((prev) => ({ ...prev, [product.id]: true }))}
                                className="h-10 w-10 rounded-md object-cover border"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground border">
                                <ImageIcon className="h-5 w-5 opacity-50" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-foreground">{product.name}</p>
                              {product.stock <= product.min_stock && (
                                <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                  <AlertTriangle className="h-3 w-3" />
                                  {product.stock <= 0 ? 'Stok habis' : 'Stok menipis'}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{product.sku || '-'}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          Rp {Number(product.buy_price).toLocaleString('id-ID')}
                        </td>
                        <td className="px-3 py-3">
                          <span className={discount > 0 ? 'line-through text-muted-foreground text-xs block' : ''}>
                            Rp {Number(product.sell_price).toLocaleString('id-ID')}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {discount > 0 ? (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                              {discount}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-semibold text-foreground">
                          Rp {finalPrice.toLocaleString('id-ID')}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-semibold text-sm ${
                                product.stock <= 0
                                  ? 'text-destructive font-bold'
                                  : product.stock <= product.min_stock
                                  ? 'text-amber-600 font-bold'
                                  : 'text-foreground'
                              }`}
                            >
                              {product.stock} unit
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActionProduct(product);
                                handleOpenQuickRestock(product);
                              }}
                              className="h-7 px-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 border-emerald-300 dark:border-emerald-800 transition flex items-center gap-1 shadow-2xs cursor-pointer"
                              title={`Tambah / Restock Stok ${product.name}`}
                            >
                              <Plus className="h-3 w-3" />
                              Tambah Stok
                            </Button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 flex items-center gap-1.5 hover:bg-primary/10"
                            title="Aksi Produk (Memerlukan Sandi Owner)"
                            onClick={() => handleThreeDotsClick(product)}
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

      {/* Edit Product Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ubah Produk: {editProduct?.name}</DialogTitle>
            <DialogDescription>
              Atur harga modal (HPP), harga jual, diskon promo, serta kelola jumlah stok fisik dan batas minimum.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Nama Produk</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nama produk"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Kode SKU / Barcode</label>
                <Input
                  value={editSku}
                  onChange={(e) => setEditSku(e.target.value)}
                  placeholder="Contoh: KOP-01"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Harga Modal / HPP (Rp)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={editBuyPrice}
                  onChange={(e) => setEditBuyPrice(e.target.value)}
                  placeholder="Contoh: 6000"
                  className="border-emerald-500/40 font-semibold"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Biaya modal untuk perhitungan laba bersih.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Harga Jual Normal (Rp)</label>
                <Input
                  type="number"
                  min="0"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="font-semibold"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Harga reguler sebelum diskon promo.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Diskon (%)</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0 - 100"
                  value={editDiscount}
                  onChange={(e) => setEditDiscount(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Potongan promo pelanggan.
                </p>
              </div>
            </div>

            {/* Profit Margin Info */}
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-3 text-xs flex items-center justify-between">
              <div>
                <span className="text-muted-foreground block text-[11px]">Estimasi Laba Kotor per Unit:</span>
                <span className="font-bold text-sm text-emerald-700 dark:text-emerald-300">
                  Rp {Math.max(0, (Number(editPrice) * (1 - (Number(editDiscount) || 0) / 100)) - (Number(editBuyPrice) || 0)).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground block text-[11px]">Margin Keuntungan:</span>
                <span className="font-bold text-sm text-foreground">
                  {Number(editPrice) > 0
                    ? `${Math.round(((Math.max(0, (Number(editPrice) * (1 - (Number(editDiscount) || 0) / 100)) - (Number(editBuyPrice) || 0))) / (Number(editPrice) * (1 - (Number(editDiscount) || 0) / 100))) * 100)}%`
                    : '0%'}
                </span>
              </div>
            </div>

            {/* STOCK MANAGEMENT SECTION */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Pengaturan Stok Fisik
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Stok Saat Ini (Unit)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value)}
                    placeholder="Contoh: 50"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Ubah langsung jumlah stok fisik di gudang.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    + Tambah Stok Masuk (Restock)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={addStockQty}
                    onChange={(e) => setAddStockQty(e.target.value)}
                    placeholder="Contoh: +10 atau +25"
                    className="border-emerald-500/40 focus-visible:ring-emerald-500"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Opsional: otomatis menambahkan ke stok saat ini.
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Batas Peringatan Minimum Stok
                </label>
                <Input
                  type="number"
                  min="1"
                  value={editMinStock}
                  onChange={(e) => setEditMinStock(e.target.value)}
                  placeholder="Contoh: 5"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Notifikasi stok menipis jika jumlah sisa &le; angka ini.
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Ganti Foto Produk</label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setEditImage(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={() => void handleSaveEdit()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Restock Dialog */}
      <Dialog open={restockDialogOpen} onOpenChange={setRestockDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              Restock Stok: {restockProduct?.name}
            </DialogTitle>
            <DialogDescription>
              Tambah stok masuk ke inventori produk ini secara instan.
            </DialogDescription>
          </DialogHeader>

          {restockProduct && (
            <div className="space-y-4 py-2">
              {/* Product Selector if multiple products exist */}
              {products.length > 1 && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Pilih Produk:
                  </label>
                  <select
                    value={restockProduct.id}
                    onChange={(e) => {
                      const selected = products.find((p) => p.id === e.target.value);
                      if (selected) setRestockProduct(selected);
                    }}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Stok: {p.stock} unit)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="rounded-xl bg-muted/60 p-3 text-xs space-y-1 border flex justify-between items-center">
                <span className="text-muted-foreground">Stok Fisik Saat Ini:</span>
                <span className="text-sm font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                  {restockProduct.stock} unit
                </span>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Jumlah Stok Masuk yang Ditambahkan (+ Unit)
                </label>
                <Input
                  type="number"
                  min="1"
                  value={quickRestockAmount}
                  onChange={(e) => setQuickRestockAmount(e.target.value)}
                  placeholder="Masukkan jumlah unit"
                  className="text-base font-semibold"
                />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {['5', '10', '20', '50', '100'].map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 px-2.5"
                      onClick={() => setQuickRestockAmount(preset)}
                    >
                      +{preset}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Catatan / Keterangan (Opsional)</label>
                <Input
                  value={quickRestockNote}
                  onChange={(e) => setQuickRestockNote(e.target.value)}
                  placeholder="Contoh: Kiriman supplier, stok mingguan"
                />
              </div>

              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                Stok setelah restock:{' '}
                <strong>
                  {restockProduct.stock + (parseInt(quickRestockAmount, 10) || 0)} unit
                </strong>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestockDialogOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleExecuteQuickRestock} disabled={saving} className="bg-primary">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Konfirmasi &amp; Tambah Stok
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Action Dialog (Opened after Password / PIN Verified) */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl">
          {/* Header */}
          <div className="p-5 pb-4 border-b border-border/50 bg-neutral-50/70 dark:bg-neutral-800/40">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-800/50 px-2 py-0.5 rounded-md">
                <LockKeyhole className="h-3 w-3" />
                Otorisasi Owner
              </span>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground font-medium">{actionProduct?.category || 'Katalog Produk'}</span>
            </div>
            <DialogTitle className="text-base font-bold text-foreground">
              Aksi Produk: {actionProduct?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Pilih tindakan di bawah atau perbarui harga produk secara real-time.
            </DialogDescription>
          </div>

          {actionProduct && (
            <div className="p-5 space-y-4">
              {/* Product Info Card */}
              <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-700/60 p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200/60 dark:border-neutral-700/40">
                  <span className="text-muted-foreground">Kode SKU / Barcode</span>
                  <span className="font-mono font-medium px-2 py-0.5 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 text-foreground">
                    {actionProduct.sku || '-'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-0.5">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-muted-foreground block">Harga Modal (HPP)</span>
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 text-sm">
                      Rp {Number(actionProduct.buy_price || 0).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-muted-foreground block">Harga Jual Normal</span>
                    <span className="font-mono font-bold text-foreground text-sm">
                      Rp {Number(actionProduct.sell_price).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-200/60 dark:border-neutral-700/40">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-muted-foreground block">Stok Gudang</span>
                    <span className={`font-semibold text-xs ${actionProduct.stock <= (actionProduct.min_stock || 5) ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                      {actionProduct.stock} unit {actionProduct.stock <= (actionProduct.min_stock || 5) ? '(Menipis)' : '(Aman)'}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-muted-foreground block">Diskon Promo</span>
                    <span className="font-semibold text-xs text-foreground">
                      {actionProduct.discount_percent ? `${actionProduct.discount_percent}% Aktif` : 'Tidak Ada'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                {/* 1. Quick Restock Button */}
                <button
                  type="button"
                  onClick={() => {
                    setActionDialogOpen(false);
                    handleOpenQuickRestock(actionProduct);
                  }}
                  className="w-full flex items-center gap-3 p-3 text-left rounded-xl border border-primary/25 bg-primary/5 hover:bg-primary/10 transition-colors group cursor-pointer"
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 text-primary">
                    <Boxes className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs text-primary flex items-center justify-between">
                      <span>+ Tambah Stok Cepat (Restock)</span>
                      <ChevronRight className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      Tambah jumlah unit stok produk ini seketika
                    </div>
                  </div>
                </button>

                {/* 2. Edit Price, Discount, Stock, HPP */}
                <button
                  type="button"
                  onClick={() => {
                    setActionDialogOpen(false);
                    handleStartEdit(actionProduct);
                  }}
                  className="w-full flex items-center gap-3 p-3 text-left rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-850 hover:border-primary/50 transition-colors group cursor-pointer"
                >
                  <div className="h-9 w-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 text-foreground">
                    <Pencil className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs text-foreground flex items-center justify-between">
                      <span>Ubah Harga, HPP, Diskon &amp; Detail</span>
                      <ChevronRight className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      Seting harga jual real-time, biaya HPP, diskon promo, atau foto
                    </div>
                  </div>
                </button>

                {/* 3. Delete Product */}
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Apakah Anda yakin ingin menghapus produk "${actionProduct.name}" dari katalog?`)) {
                      setActionDialogOpen(false);
                      handleDeleteProduct(actionProduct);
                    }
                  }}
                  className="w-full flex items-center gap-3 p-2.5 text-left rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors group cursor-pointer text-destructive"
                >
                  <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs">Hapus Produk dari Katalog</div>
                    <div className="text-[11px] text-destructive/70">Nonaktifkan produk agar tidak muncul di kasir</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          <div className="p-4 border-t border-border/50 bg-neutral-50/60 dark:bg-neutral-800/30 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setActionDialogOpen(false)} className="px-4">
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Owner verification dialog */}
      <OwnerPasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        onVerified={handleVerifiedPassword}
        title="Otorisasi Akses Owner"
        description="Aksi menu titik tiga katalog produk memerlukan verifikasi kata sandi atau PIN toko agar karyawan tidak salah pencet."
      />
    </div>
  );
}

