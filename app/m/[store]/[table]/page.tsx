'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Coffee,
  ShoppingBag,
  Plus,
  Minus,
  CheckCircle2,
  Clock,
  ChefHat,
  Search,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Utensils,
  AlertCircle,
  X,
  FileText,
  QrCode,
  CreditCard,
  Wallet,
} from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';
import { PakasirQrisDialog } from '@/components/payments/pakasir-qris-dialog';
import { toast } from 'sonner';

interface ProductItem {
  id: string;
  name: string;
  category: string;
  sell_price: number;
  description?: string;
  image_url?: string;
  discount_percent?: number;
}

interface CartItem {
  product: ProductItem;
  quantity: number;
  notes: string;
}

interface SubmittedOrder {
  id: string;
  storeName: string;
  tableNumber: string;
  customerName: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    notes?: string;
  }[];
  totalAmount: number;
  status: 'PENDING' | 'PREPARING' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
  paymentStatus?: 'UNPAID' | 'PAID' | string;
  paymentMethod?: string;
  createdAt: string;
}

export default function TableSelfOrderPage() {
  const params = useParams();
  const rawStore = Array.isArray(params?.store) ? params.store[0] : params?.store;
  const rawTable = Array.isArray(params?.table) ? params.table[0] : params?.table;

  const storeSlug = rawStore || 'aldocoffestreet';
  const tableNumber = (rawTable || '01').toString().padStart(2, '0');

  const [storeName, setStoreName] = useState('Aldo Coffe Street');
  const [storeId, setStoreId] = useState('2f2af344-ed08-43d2-8bdf-0f9aa412f57c');
  const [categories, setCategories] = useState<string[]>(['Semua']);
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Cart State
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'QRIS'>('QRIS');

  // Pakasir QRIS Payment Gateway State
  const [qrisModalOpen, setQrisModalOpen] = useState(false);
  const [qrisOrderId, setQrisOrderId] = useState('');
  const [qrisAmount, setQrisAmount] = useState(0);

  // Active Submitted Order Tracking
  const [activeOrder, setActiveOrder] = useState<SubmittedOrder | null>(null);

  // Fetch menu
  useEffect(() => {
    async function fetchMenu() {
      try {
        setLoading(true);
        const res = await fetch(`/api/menu?storeSlug=${encodeURIComponent(storeSlug)}&_t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.store?.name) setStoreName(data.store.name);
          if (data.store?.id) setStoreId(data.store.id);
          if (data.categories) setCategories(data.categories);
          if (data.products) setProducts(data.products);
        }
      } catch (err) {
        console.error('Failed to load menu:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchMenu();

    // Listen to real-time price changes from Owner
    let bc: BroadcastChannel | null = null;
    const updateProductInCartAndCatalog = (updated: any) => {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === updated.id
            ? {
                ...p,
                sell_price: updated.sell_price,
                buy_price: updated.buy_price,
                discount_percent: updated.discount_percent,
                name: updated.name,
              }
            : p
        )
      );
      setCart((prevCart) => {
        if (!prevCart[updated.id]) return prevCart;
        return {
          ...prevCart,
          [updated.id]: {
            ...prevCart[updated.id],
            product: {
              ...prevCart[updated.id].product,
              sell_price: updated.sell_price,
              discount_percent: updated.discount_percent,
              name: updated.name,
            },
          },
        };
      });
    };

    try {
      bc = new BroadcastChannel('kasirflow_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'PRODUCTS_UPDATED' && event.data?.product) {
          updateProductInCartAndCatalog(event.data.product);
        }
      };
    } catch {}

    const handleCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && detail.id) {
        updateProductInCartAndCatalog(detail);
      }
    };
    window.addEventListener('kasirflow_products_updated', handleCustomEvent);

    return () => {
      if (bc) bc.close();
      window.removeEventListener('kasirflow_products_updated', handleCustomEvent);
    };
  }, [storeSlug]);

  // Check if there is an ongoing order saved in session for this table
  useEffect(() => {
    const savedOrderId = sessionStorage.getItem(`kasirflow_table_order_${tableNumber}`);
    if (savedOrderId) {
      pollOrderStatus(savedOrderId);
    }
  }, [tableNumber]);

  // Poll order status if active order exists
  useEffect(() => {
    if (!activeOrder?.id) return;

    const interval = setInterval(() => {
      pollOrderStatus(activeOrder.id);
    }, 4000);

    return () => clearInterval(interval);
  }, [activeOrder?.id]);

  async function pollOrderStatus(orderId: string) {
    try {
      const res = await fetch(`/api/table-orders?orderId=${encodeURIComponent(orderId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.order) {
          setActiveOrder(data.order);
        }
      }
    } catch {
      // ignore transient poll error
    }
  }

  // Cart operations
  const addToCart = (product: ProductItem) => {
    setCart((prev) => {
      const existing = prev[product.id];
      const newQty = (existing?.quantity || 0) + 1;
      return {
        ...prev,
        [product.id]: {
          product,
          quantity: newQty,
          notes: existing?.notes || '',
        },
      };
    });
    toast.success(`${product.name} ditambahkan`, { duration: 1500 });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      const newQty = existing.quantity + delta;
      if (newQty <= 0) {
        const clone = { ...prev };
        delete clone[productId];
        return clone;
      }
      return {
        ...prev,
        [productId]: { ...existing, quantity: newQty },
      };
    });
  };

  const updateItemNotes = (productId: string, notes: string) => {
    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      return {
        ...prev,
        [productId]: { ...existing, notes },
      };
    });
  };

  const cartList = useMemo(() => Object.values(cart), [cart]);
  const cartTotalItems = useMemo(
    () => cartList.reduce((acc, item) => acc + item.quantity, 0),
    [cartList]
  );
  const cartTotalPrice = useMemo(
    () =>
      cartList.reduce((acc, item) => {
        const disc = item.product.discount_percent || 0;
        const price = item.product.sell_price * (1 - disc / 100);
        return acc + price * item.quantity;
      }, 0),
    [cartList]
  );

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat =
        selectedCategory === 'Semua' || p.category.toLowerCase() === selectedCategory.toLowerCase();
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description?.toLowerCase().includes(search.toLowerCase()) ?? false);
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, search]);

  // Submit order to cashier
  const handleSubmitOrder = async () => {
    if (cartList.length === 0) return;
    if (!customerName.trim()) {
      toast.error('Harap masukkan nama pemesan');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        storeId,
        storeSlug,
        storeName,
        tableNumber,
        customerName: customerName.trim(),
        notes: orderNotes.trim(),
        totalAmount: cartTotalPrice,
        paymentStatus: 'UNPAID',
        paymentMethod,
        items: cartList.map((c) => {
          const disc = c.product.discount_percent || 0;
          const unitPrice = c.product.sell_price * (1 - disc / 100);
          return {
            productId: c.product.id,
            productName: c.product.name,
            quantity: c.quantity,
            unitPrice,
            subtotal: unitPrice * c.quantity,
            notes: c.notes,
            imageUrl: c.product.image_url,
          };
        }),
      };

      const res = await fetch('/api/table-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Gagal mengirim pesanan');
      }

      const data = await res.json();
      if (data.order) {
        setActiveOrder(data.order);
        sessionStorage.setItem(`kasirflow_table_order_${tableNumber}`, data.order.id);
        setCart({});
        setCartOpen(false);
        toast.success('Pesanan berhasil dikirim ke Bar & Kasir!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan saat mengirim pesanan');
    } finally {
      setSubmitting(false);
    }
  };

  // Status tracker screen if order is already submitted
  if (activeOrder) {
    const isPending = activeOrder.status === 'PENDING';
    const isPreparing = activeOrder.status === 'PREPARING';
    const isServed = activeOrder.status === 'SERVED' || activeOrder.status === 'COMPLETED';

    return (
      <div className="min-h-screen bg-stone-50 text-stone-900 pb-24">
        {/* Top Header */}
        <div className="bg-stone-900 text-white px-5 py-6 rounded-b-3xl shadow-lg">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Coffee className="w-5 h-5 text-amber-400" />
                <span className="text-xs uppercase tracking-wider text-amber-400 font-semibold">
                  Self-Order Meja
                </span>
              </div>
              <h1 className="text-xl font-bold mt-0.5">{activeOrder.storeName}</h1>
            </div>
            <div className="px-3.5 py-1.5 bg-amber-500 text-stone-950 font-black rounded-xl text-sm shadow">
              MEJA {activeOrder.tableNumber}
            </div>
          </div>
        </div>

        {/* Live Status Tracker Card */}
        <div className="max-w-md mx-auto px-4 mt-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-200 space-y-6">
            <div className="text-center space-y-1">
              <span className="text-[11px] font-mono text-stone-400 uppercase tracking-widest">
                ID Pesanan: {activeOrder.id}
              </span>
              <h2 className="text-lg font-bold text-stone-900">
                Halo, {activeOrder.customerName}! 👋
              </h2>
              <p className="text-xs text-stone-500">
                Pesanan Anda telah diterima oleh kasir &amp; bar.
              </p>
            </div>

            {/* Step Progress Tracker */}
            <div className="relative pl-6 space-y-7 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-stone-200">
              {/* Step 1: Diterima */}
              <div className="relative flex items-start gap-4">
                <div
                  className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white ${
                    isPending || isPreparing || isServed ? 'bg-emerald-500 text-white' : 'bg-stone-300'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-stone-900">Pesanan Diterima</h4>
                  <p className="text-xs text-stone-500">
                    Menunggu antrean konfirmasi dari kasir
                  </p>
                </div>
              </div>

              {/* Step 2: Sedang Dibuat */}
              <div className="relative flex items-start gap-4">
                <div
                  className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white ${
                    isPreparing || isServed
                      ? 'bg-amber-500 text-white animate-pulse'
                      : isPending
                      ? 'bg-stone-300 text-white'
                      : 'bg-stone-200'
                  }`}
                >
                  {isPreparing ? <Clock className="w-3 h-3" /> : <ChefHat className="w-3 h-3" />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-stone-900">Sedang Disiapkan di Bar</h4>
                  <p className="text-xs text-stone-500">
                    Barista / dapur sedang meracik pesanan Anda
                  </p>
                </div>
              </div>

              {/* Step 3: Siap / Diantar */}
              <div className="relative flex items-start gap-4">
                <div
                  className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white ${
                    isServed ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-400'
                  }`}
                >
                  <Utensils className="w-3 h-3" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-stone-900">Pesanan Selesai / Diantar</h4>
                  <p className="text-xs text-stone-500">
                    Silakan santap di Meja {activeOrder.tableNumber}
                  </p>
                </div>
              </div>
            </div>

            {/* List of items ordered */}
            <div className="border-t border-stone-100 pt-4 space-y-3">
              <h3 className="text-xs font-bold text-stone-600 uppercase tracking-wider">
                Rincian Pesanan
              </h3>
              <div className="divide-y divide-stone-100 text-xs">
                {activeOrder.items.map((it, idx) => (
                  <div key={idx} className="py-2.5 flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-stone-900">
                        {it.quantity}x {it.productName}
                      </div>
                      {it.notes && (
                        <div className="text-[11px] text-stone-500 italic mt-0.5">
                          Catatan: &ldquo;{it.notes}&rdquo;
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-stone-900">
                      {formatCurrency(it.subtotal)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-stone-100 flex justify-between items-center text-sm font-bold">
                <span>Total Tagihan Meja</span>
                <span className="text-amber-600 font-extrabold text-base">
                  {formatCurrency(activeOrder.totalAmount)}
                </span>
              </div>

              {/* DUAL CHECKOUT PAYMENT OPTIONS & STATUS */}
              <div className="pt-3 border-t border-stone-100 space-y-3">
                {activeOrder.paymentStatus === 'PAID' ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center gap-3 shadow-sm animate-in fade-in">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-extrabold text-xs text-emerald-900 uppercase tracking-wide flex items-center gap-1.5">
                        <span>LUNAS &bull; SUDAH DIBAYAR</span>
                      </div>
                      <p className="text-[11px] text-emerald-700 leading-snug mt-0.5">
                        Pembayaran sebesar <strong>{formatCurrency(activeOrder.totalAmount)}</strong> sukses diterima. Pesanan Anda segera disajikan barista!
                      </p>
                    </div>
                  </div>
                ) : activeOrder.paymentStatus === 'UNPAID_CASH' ? (
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-2.5 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
                      <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-700">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <span>Menunggu Pembayaran Tunai di Kasir</span>
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed font-medium">
                      Silakan selesaikan pembayaran tunai di kasir dengan menyebutkan <strong>Meja {activeOrder.tableNumber}</strong> (Nama: <strong>{activeOrder.customerName}</strong>).
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setQrisOrderId(activeOrder.id);
                        setQrisAmount(activeOrder.totalAmount);
                        setQrisModalOpen(true);
                      }}
                      className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow"
                    >
                      <QrCode className="w-3.5 h-3.5" /> Ganti &amp; Bayar di Meja (QRIS Instan)
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                      Pilih Cara Pembayaran:
                    </div>

                    {/* (A) Tombol Bayar di Meja (QRIS Instan) */}
                    <button
                      type="button"
                      onClick={() => {
                        setQrisOrderId(activeOrder.id);
                        setQrisAmount(activeOrder.totalAmount);
                        setQrisModalOpen(true);
                      }}
                      className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-2xl font-bold text-xs flex items-center justify-between shadow-md active:scale-98 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2 bg-white/20 rounded-xl">
                          <QrCode className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="font-extrabold text-sm">Bayar di Meja (QRIS Instan)</div>
                          <div className="text-[10px] text-amber-100 font-normal">
                            BCA, Mandiri, BRI, BNI, GoPay, OVO, Dana, ShopeePay
                          </div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/90" />
                    </button>

                    {/* (B) Tombol Bayar di Kasir (Tunai) */}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/table-orders', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              orderId: activeOrder.id,
                              paymentStatus: 'UNPAID_CASH',
                            }),
                          });
                          if (res.ok) {
                            setActiveOrder((prev) => (prev ? { ...prev, paymentStatus: 'UNPAID_CASH' } : null));
                            toast.info('Instruksi pembayaran tunai aktif', {
                              description: `Silakan ke kasir untuk membayar Meja ${activeOrder.tableNumber}`,
                            });
                          }
                        } catch {
                          toast.error('Gagal memperbarui metode pembayaran');
                        }
                      }}
                      className="w-full py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-2xl font-bold text-xs flex items-center justify-between active:scale-98 transition border border-stone-200 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2 bg-stone-200 rounded-xl text-stone-700">
                          <Wallet className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-xs">Bayar di Kasir (Tunai)</div>
                          <div className="text-[10px] text-stone-500 font-normal">
                            Bayar langsung di kasir sebutkan Meja {activeOrder.tableNumber}
                          </div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-stone-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 space-y-2">
              <button
                onClick={() => {
                  setActiveOrder(null);
                  sessionStorage.removeItem(`kasirflow_table_order_${tableNumber}`);
                }}
                className="w-full py-3 bg-stone-100 hover:bg-stone-200 active:scale-98 rounded-xl font-semibold text-xs text-stone-700 flex items-center justify-center gap-2 transition"
              >
                <Plus className="w-4 h-4" /> Pesan Tambahan / Menu Lain
              </button>
              <p className="text-[11px] text-stone-400 text-center">
                Pesanan terhubung langsung ke kasir &amp; bar secara realtime.
              </p>
            </div>
          </div>
        </div>

        {/* Pakasir QRIS Payment Dialog in Active Order Screen */}
        <PakasirQrisDialog
          open={qrisModalOpen}
          onOpenChange={setQrisModalOpen}
          orderId={qrisOrderId || activeOrder.id}
          amount={qrisAmount || activeOrder.totalAmount}
          title={`QRIS Instan Meja ${activeOrder.tableNumber}`}
          description="Scan menggunakan BCA, Mandiri, BRI, BNI, GoPay, OVO, Dana, ShopeePay."
          onPaymentSuccess={async () => {
            try {
              await fetch('/api/table-orders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId: activeOrder.id,
                  paymentStatus: 'PAID',
                }),
              });
              setActiveOrder((prev) => (prev ? { ...prev, paymentStatus: 'PAID' } : null));
              setQrisModalOpen(false);
              toast.success('Pembayaran QRIS Berhasil! Status Meja LUNAS.');
            } catch {
              // ignore
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-28">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-30 bg-stone-900 text-white px-4 py-4 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-amber-400 text-[11px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> Self-Order Digital
            </div>
            <h1 className="text-lg font-extrabold tracking-tight mt-0.5">{storeName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-amber-500 text-stone-950 font-black rounded-xl text-xs tracking-wide shadow-sm">
              MEJA {tableNumber}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Welcome Banner */}
      <div className="max-w-md mx-auto px-4 pt-4">
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="font-extrabold text-sm flex items-center gap-1.5">
              Pesan Langsung Tanpa Antre ✨
            </h2>
            <p className="text-[11px] text-amber-100 leading-tight">
              Pilih menu favorit Anda, pesanan langsung masuk ke bar &amp; kasir secara realtime.
            </p>
          </div>
        </div>
      </div>

      {/* Search & Categories */}
      <div className="max-w-md mx-auto px-4 pt-4 space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kopi, makanan, atau minuman..."
            className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-stone-800 shadow-sm"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-sm cursor-pointer ${
                  active
                    ? 'bg-amber-600 text-white shadow-amber-600/30'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product List Grid */}
      <div className="max-w-md mx-auto px-4 pt-4">
        {loading ? (
          <div className="py-16 text-center space-y-2">
            <Coffee className="w-8 h-8 text-amber-600 animate-spin mx-auto" />
            <p className="text-xs text-stone-500 font-medium">Memuat buku menu digital...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-2xl border border-stone-200 p-6">
            <AlertCircle className="w-8 h-8 text-stone-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-stone-700">Tidak ada menu yang cocok</p>
            <p className="text-[11px] text-stone-400 mt-1">Coba kata kunci atau kategori lain</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {filteredProducts.map((p) => {
              const inCart = cart[p.id];
              const disc = p.discount_percent || 0;
              const finalPrice = p.sell_price * (1 - disc / 100);

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl p-3 border border-stone-200 shadow-sm hover:shadow transition flex gap-3.5 items-center justify-between"
                >
                  {p.image_url && (
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-stone-100 flex-shrink-0 relative">
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {disc > 0 && (
                        <span className="absolute top-1 left-1 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                          -{disc}%
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-xs text-stone-900 truncate">{p.name}</h3>
                    {p.description && (
                      <p className="text-[10px] text-stone-500 line-clamp-2 mt-0.5 leading-snug">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="font-extrabold text-xs text-amber-700">
                        {formatCurrency(finalPrice)}
                      </span>
                      {disc > 0 && (
                        <span className="text-[10px] text-stone-400 line-through">
                          {formatCurrency(p.sell_price)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Add / Quantity Button */}
                  <div className="flex-shrink-0">
                    {p.stock !== undefined && p.stock <= 0 ? (
                      <span className="text-[10px] bg-stone-100 text-stone-500 font-bold px-2.5 py-1 rounded-lg border border-stone-200">
                        Habis
                      </span>
                    ) : inCart ? (
                      <div className="flex items-center bg-amber-50 rounded-xl border border-amber-200 p-0.5">
                        <button
                          onClick={() => updateQuantity(p.id, -1)}
                          className="w-6 h-6 flex items-center justify-center text-amber-800 hover:bg-amber-200 rounded-lg transition"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 font-bold text-xs text-amber-900">
                          {inCart.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(p.id, 1)}
                          className="w-6 h-6 flex items-center justify-center text-amber-800 hover:bg-amber-200 rounded-lg transition"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(p)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-[11px] rounded-xl flex items-center gap-1 shadow-sm transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Tambah
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Bar */}
      {cartTotalItems > 0 && (
        <div className="fixed bottom-4 left-0 right-0 z-40 px-4 max-w-md mx-auto">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white rounded-2xl p-3.5 shadow-xl flex items-center justify-between border border-stone-700 transition active:scale-98"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-black text-xs">
                {cartTotalItems}
              </div>
              <div className="text-left">
                <div className="text-[10px] text-stone-400">Total Pesanan Meja {tableNumber}</div>
                <div className="text-sm font-black text-amber-400">
                  {formatCurrency(cartTotalPrice)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 px-3 py-1.5 rounded-xl">
              Lihat Keranjang <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>
      )}

      {/* Cart Modal / Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl max-w-md mx-auto w-full p-5 shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <h3 className="font-extrabold text-base text-stone-900">
                  Konfirmasi Pesanan Meja {tableNumber}
                </h3>
                <p className="text-[11px] text-stone-500">{storeName}</p>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="p-2 text-stone-400 hover:text-stone-700 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of items */}
            <div className="flex-1 overflow-y-auto divide-y divide-stone-100 py-3 space-y-2">
              {cartList.map(({ product, quantity, notes }) => {
                const disc = product.discount_percent || 0;
                const price = product.sell_price * (1 - disc / 100);
                return (
                  <div key={product.id} className="pt-2 pb-3 space-y-1.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-xs text-stone-900">{product.name}</div>
                        <div className="text-[11px] text-amber-700 font-semibold">
                          {formatCurrency(price)}
                        </div>
                      </div>
                      <div className="flex items-center bg-stone-100 rounded-lg p-0.5">
                        <button
                          onClick={() => updateQuantity(product.id, -1)}
                          className="w-5 h-5 flex items-center justify-center text-stone-700"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 font-bold text-xs">{quantity}</span>
                        <button
                          onClick={() => updateQuantity(product.id, 1)}
                          className="w-5 h-5 flex items-center justify-center text-stone-700"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {/* Item Notes */}
                    <input
                      type="text"
                      placeholder="Catatan (cth: Less sugar, pedas, hangat)"
                      value={notes}
                      onChange={(e) => updateItemNotes(product.id, e.target.value)}
                      className="w-full text-[11px] bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1 text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                );
              })}
            </div>

            {/* Customer Name & Notes */}
            <div className="border-t border-stone-100 pt-3 space-y-2.5">
              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">
                  Nama Anda / Pemesan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Budi, Cindy, dsb."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">
                  Catatan Tambahan untuk Kasir / Dapur (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Tolong siapkan sekaligus"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1.5">
                  Metode Pembayaran
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('QRIS')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      paymentMethod === 'QRIS'
                        ? 'border-amber-600 bg-amber-50/70 text-amber-950 ring-1 ring-amber-600'
                        : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <QrCode className={`w-4 h-4 ${paymentMethod === 'QRIS' ? 'text-amber-600' : 'text-stone-400'}`} />
                      <span className="text-[9px] font-bold bg-amber-200/60 text-amber-900 px-1.5 py-0.2 rounded-full">
                        Otomatis
                      </span>
                    </div>
                    <div className="mt-2">
                      <span className="text-xs font-bold block">QRIS Dinamis</span>
                      <span className="text-[10px] text-stone-500">BCA, GoPay, OVO, dll.</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CASH')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      paymentMethod === 'CASH'
                        ? 'border-amber-600 bg-amber-50/70 text-amber-950 ring-1 ring-amber-600'
                        : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Wallet className={`w-4 h-4 ${paymentMethod === 'CASH' ? 'text-amber-600' : 'text-stone-400'}`} />
                    </div>
                    <div className="mt-2">
                      <span className="text-xs font-bold block">Bayar di Kasir</span>
                      <span className="text-[10px] text-stone-500">Tunai saat selesai</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs font-bold pt-2 border-t border-stone-100">
                <span className="text-stone-600">Total Pembayaran:</span>
                <span className="text-base font-black text-amber-700">
                  {formatCurrency(cartTotalPrice)}
                </span>
              </div>

              <button
                onClick={handleSubmitOrder}
                disabled={submitting}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>Mengirim ke Kasir...</>
                ) : paymentMethod === 'QRIS' ? (
                  <>
                    <QrCode className="w-4 h-4" /> Pesan &amp; Tampilkan QRIS
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" /> Kirim Pesanan ke Kasir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pakasir QRIS Payment Gateway Dialog for Self-Order */}
      <PakasirQrisDialog
        open={qrisModalOpen}
        onOpenChange={setQrisModalOpen}
        orderId={qrisOrderId}
        amount={qrisAmount}
        title={`QRIS Meja ${tableNumber}`}
        description="Scan menggunakan BCA, Mandiri, BRI, BNI, GoPay, OVO, Dana, ShopeePay, atau LinkAja."
        onPaymentSuccess={() => {
          if (qrisOrderId) {
            pollOrderStatus(qrisOrderId);
          }
        }}
      />
    </div>
  );
}
