'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { useCartStore } from '@/lib/cart-store';
import { formatCurrency } from '@/lib/calculations';
import type { Product, Category } from '@/types/database';
import { PakasirQrisDialog } from '@/components/payments/pakasir-qris-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Receipt, Search, Minus, Plus, Trash2, ShoppingCart, Loader2, CheckCircle2,
  Printer, ExternalLink, Info, Volume2, X, Bell, ChefHat, Clock, Utensils,
  PauseCircle, Play, History, FolderKanban, Check, Sparkles, Tag, ArrowRight,
  ClipboardList, Layers, Undo2, Bluetooth, Share2
} from 'lucide-react';
import { toast } from 'sonner';
import { speakPaymentSuccess, playNotificationChime, speakText } from '@/lib/voice-service';
import { PosVoiceControl } from '@/components/pos/pos-voice-control';
import { cn } from '@/lib/utils';
import { ThermalPrinterDialog } from '@/components/pos/thermal-printer-dialog';
import {
  connectBluetoothPrinter,
  sendEscPosToPrinter,
  buildEscPosReceipt,
  shareReceiptViaWhatsApp,
  getPrinterStatus,
  type ReceiptPrintData,
  type PaperWidth,
} from '@/lib/thermal-printer';

export default function POSPage() {
  const router = useRouter();
  const { profile, store } = useAuth();
  const cart = useCartStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [cartMobileOpen, setCartMobileOpen] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  // Realtime Table Orders State
  const [tableOrders, setTableOrders] = useState<any[]>([]);
  const [tableOrdersOpen, setTableOrdersOpen] = useState(false);
  const [lastPendingCount, setLastPendingCount] = useState(0);
  const [activeTableOrderId, setActiveTableOrderId] = useState<string | null>(null);

  // POS Cashier Draft Orders State (Park / Hold Cart)
  const [drafts, setDrafts] = useState<any[]>([]);
  const [saveDraftOpen, setSaveDraftOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftTable, setDraftTable] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);

  // Unified Antrean Dialog Tabs & Filters
  const [antreanTab, setAntreanTab] = useState<'tables' | 'drafts' | 'recent'>('tables');
  const [tableFilter, setTableFilter] = useState<'ALL' | 'PENDING' | 'PREPARING' | 'PAID'>('ALL');

  // Recent Completed Sales of Today (so details are never lost!)
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [lastCompletedSale, setLastCompletedSale] = useState<any>(null);

  // Pakasir QRIS Payment Gateway State
  const [pakasirDialogOpen, setPakasirDialogOpen] = useState(false);
  const [pakasirOrderId, setPakasirOrderId] = useState('');

  // Thermal Printer & Struk WhatsApp State
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [printerConnected, setPrinterConnected] = useState(false);
  const [printingBluetooth, setPrintingBluetooth] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [showWhatsappInput, setShowWhatsappInput] = useState(false);

  useEffect(() => {
    setPrinterConnected(Boolean(getPrinterStatus()));
    const handleStatusChange = () => {
      setPrinterConnected(Boolean(getPrinterStatus()));
    };
    window.addEventListener('kasirflow_printer_status_changed', handleStatusChange);
    return () => {
      window.removeEventListener('kasirflow_printer_status_changed', handleStatusChange);
    };
  }, []);

  const handlePrintBluetoothFromPos = async () => {
    if (!receiptData) return;
    setPrintingBluetooth(true);
    try {
      let status = getPrinterStatus();
      if (!status) {
        toast.info('Menghubungkan ke printer thermal Bluetooth...');
        status = await connectBluetoothPrinter();
        setPrinterConnected(true);
      }

      const paperWidth = (localStorage.getItem('kasirflow_paper_width') as PaperWidth) || '58mm';
      const customFooter = localStorage.getItem('kasirflow_receipt_footer') || 'Password WiFi: aldocoffe2026';

      const payload: ReceiptPrintData = {
        invoiceNumber: receiptData.invoice_number,
        storeName: receiptData.storeName || store?.name || 'Aldo Coffe Street',
        storeAddress: receiptData.storeAddress || store?.address,
        storePhone: receiptData.storePhone || store?.phone,
        date: receiptData.date || new Date().toLocaleString('id-ID'),
        items: receiptData.items.map((it: any) => ({
          productName: it.product.name,
          quantity: it.quantity,
          unitPrice: Number(it.product.sell_price) * (1 - Number(it.product.discount_percent || 0) / 100),
          subtotal: Number(it.product.sell_price) * (1 - Number(it.product.discount_percent || 0) / 100) * it.quantity,
        })),
        subtotal: receiptData.subtotal,
        discount: receiptData.discount || 0,
        tax: receiptData.tax || 0,
        grandTotal: receiptData.grandTotal,
        paidAmount: receiptData.paid,
        changeAmount: receiptData.change,
        paymentMethod: receiptData.paymentMethod,
        cashierName: profile?.full_name || 'Kasir',
        footerNotes: customFooter,
      };

      const bytes = buildEscPosReceipt(payload, paperWidth);
      await sendEscPosToPrinter(bytes);
      toast.success('Struk berhasil dicetak ke printer Bluetooth!');
    } catch (err: any) {
      if (err?.name !== 'NotFoundError') {
        toast.error(err?.message || 'Gagal mencetak ke printer thermal Bluetooth');
      }
    } finally {
      setPrintingBluetooth(false);
    }
  };

  const handleShareWhatsAppFromPos = (phone?: string) => {
    if (!receiptData) return;
    const customFooter = localStorage.getItem('kasirflow_receipt_footer') || 'Password WiFi: aldocoffe2026';
    const payload: ReceiptPrintData = {
      invoiceNumber: receiptData.invoice_number,
      storeName: receiptData.storeName || store?.name || 'Aldo Coffe Street',
      storeAddress: receiptData.storeAddress || store?.address,
      storePhone: receiptData.storePhone || store?.phone,
      date: receiptData.date || new Date().toLocaleString('id-ID'),
      items: receiptData.items.map((it: any) => ({
        productName: it.product.name,
        quantity: it.quantity,
        unitPrice: Number(it.product.sell_price) * (1 - Number(it.product.discount_percent || 0) / 100),
        subtotal: Number(it.product.sell_price) * (1 - Number(it.product.discount_percent || 0) / 100) * it.quantity,
      })),
      subtotal: receiptData.subtotal,
      discount: receiptData.discount || 0,
      tax: receiptData.tax || 0,
      grandTotal: receiptData.grandTotal,
      paidAmount: receiptData.paid,
      changeAmount: receiptData.change,
      paymentMethod: receiptData.paymentMethod,
      cashierName: profile?.full_name || 'Kasir',
      footerNotes: customFooter,
    };
    shareReceiptViaWhatsApp(payload, phone || whatsappPhone);
  };

  const pendingTableOrders = tableOrders.filter((o) => o.status === 'PENDING');

  const fetchTableOrders = useCallback(async () => {
    try {
      const targetStoreId = store?.id || profile?.store_id || '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';
      const res = await fetch(`/api/table-orders?storeId=${encodeURIComponent(targetStoreId)}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const orders = data.orders || [];
        const pending = orders.filter((o: any) => o.status === 'PENDING');
        if (pending.length > lastPendingCount && lastPendingCount !== 0) {
          const newest = pending[0];
          playNotificationChime(0.7);
          speakText(`Pesanan baru masuk dari Meja ${newest.tableNumber}`);
          toast.success(`Pesanan baru dari Meja ${newest.tableNumber}!`, {
            description: `${newest.customerName} memesan ${newest.items?.length || 0} menu`,
          });
        }
        setLastPendingCount(pending.length);
        setTableOrders(orders);
        try {
          localStorage.setItem('kasirflow_table_orders_cache', JSON.stringify(orders));
        } catch {}
      }
    } catch {
      // Fallback: read from local cache
      try {
        const cached = localStorage.getItem('kasirflow_table_orders_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) setTableOrders(parsed);
        }
      } catch {}
    }
  }, [lastPendingCount, store?.id, profile?.store_id]);

  // Initial read from cache to eliminate order flicker on refresh
  useEffect(() => {
    try {
      const cached = localStorage.getItem('kasirflow_table_orders_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTableOrders(parsed);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchTableOrders();
    const interval = setInterval(fetchTableOrders, 4000);

    const channel = supabase
      .channel('table_orders_realtime_pos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_orders' },
        () => {
          fetchTableOrders();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchTableOrders]);

  const processedTableOrderIdsRef = useRef<Set<string>>(new Set());
  const realDbProductIdsRef = useRef<Set<string>>(new Set());

  const importTableOrderToCart = useCallback(
    (order: any) => {
      if (!order) return;
      const orderId = order.id || order.orderCode || `order-${Date.now()}`;
      if (processedTableOrderIdsRef.current.has(orderId)) return;
      processedTableOrderIdsRef.current.add(orderId);

      const itemsList = Array.isArray(order.items) ? order.items : [];
      const newCartItems = itemsList.map((it: any, idx: number) => {
        const prodId = it.productId || it.product_id || it.id || `table-item-${idx}`;
        const name = it.productName || it.product_name || it.name || 'Menu Meja';
        const isUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const existingProduct = products.find(
          (p) => p.id === prodId || (p.name && name && p.name.trim().toLowerCase() === name.trim().toLowerCase())
        );
        const safeId = existingProduct ? existingProduct.id : (isUuidPattern.test(prodId) ? prodId : 'b87e5d23-71ab-4c3e-8e6f-998811223344');
        const price = Number(it.unitPrice ?? it.unit_price ?? it.price ?? it.sell_price ?? it.subtotal ?? 0);
        const qty = Math.max(1, Number(it.quantity ?? it.qty ?? 1));
        const tableNum = String(order.tableNumber || order.table_number || '00');

        const product: Product = {
          id: existingProduct?.id || safeId,
          store_id: profile?.store_id || '2f2af344-ed08-43d2-8bdf-0f9aa412f57c',
          name: existingProduct?.name || name,
          sell_price: price > 0 ? price : (Number(existingProduct?.sell_price) || 0),
          buy_price: Number(existingProduct?.buy_price) || 0,
          stock: existingProduct?.stock !== undefined ? existingProduct.stock : 999,
          min_stock: existingProduct?.min_stock || 0,
          category_id: existingProduct?.category_id || null,
          sku: existingProduct?.sku || `MEJA-${tableNum}`,
          image_url: it.imageUrl || it.image_url || existingProduct?.image_url || null,
          discount_percent: existingProduct?.discount_percent || 0,
          is_active: true,
          created_at: existingProduct?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
        };
        return {
          product,
          quantity: qty,
        };
      });

      // Update cart using store getState directly to prevent infinite re-render loop
      useCartStore.getState().setItems(newCartItems);
      setActiveTableOrderId(order.id || null);

      // Clean the URL query param cleanly without page reload
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState({}, '', window.location.pathname);
      }

      if (order.id) {
        fetch('/api/table-orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id, status: 'PREPARING' }),
        }).catch(() => {});
      }

      const tableLabel = order.tableNumber || order.table_number || '';
      toast.success(`Pesanan Meja ${tableLabel} berhasil dimasukkan ke keranjang kasir!`);
      setTableOrdersOpen(false);
    },
    [products, profile?.store_id]
  );

  // Auto-load order when pulled from /orders (KDS screen)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Check direct localStorage transfer first
    const directStr = localStorage.getItem('kasirflow_pos_direct_load');
    if (directStr) {
      try {
        localStorage.removeItem('kasirflow_pos_direct_load');
        const directOrder = JSON.parse(directStr);
        if (directOrder && directOrder.id && !processedTableOrderIdsRef.current.has(directOrder.id)) {
          importTableOrderToCart(directOrder);
          return;
        }
      } catch {}
    }

    // 2. Check URL param loadTableOrder
    try {
      const url = new URL(window.location.href);
      const paramId = url.searchParams.get('loadTableOrder');
      if (paramId && !processedTableOrderIdsRef.current.has(paramId)) {
        let targetOrder = tableOrders.find((o) => o.id === paramId || o.orderCode === paramId);
        if (!targetOrder) {
          const cachedStr = localStorage.getItem('kasirflow_table_orders_cache');
          if (cachedStr) {
            const cachedOrders = JSON.parse(cachedStr);
            if (Array.isArray(cachedOrders)) {
              targetOrder = cachedOrders.find((o: any) => o.id === paramId || o.orderCode === paramId);
            }
          }
        }

        if (targetOrder) {
          importTableOrderToCart(targetOrder);
        } else {
          fetch(`/api/table-orders?orderId=${encodeURIComponent(paramId)}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.order && !processedTableOrderIdsRef.current.has(data.order.id)) {
                importTableOrderToCart(data.order);
              }
            })
            .catch(() => {});
        }
      }
    } catch {}
  }, [tableOrders, importTableOrderToCart]);

  // Fetch POS drafts from server & localStorage
  const fetchDrafts = useCallback(async () => {
    try {
      const targetStoreId = store?.id || profile?.store_id || '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';
      const res = await fetch(`/api/draft-orders?storeId=${encodeURIComponent(targetStoreId)}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setDrafts(data.drafts || []);
        localStorage.setItem('kasirflow_pos_drafts', JSON.stringify(data.drafts || []));
      } else {
        const saved = localStorage.getItem('kasirflow_pos_drafts');
        if (saved) setDrafts(JSON.parse(saved));
      }
    } catch {
      try {
        const saved = localStorage.getItem('kasirflow_pos_drafts');
        if (saved) setDrafts(JSON.parse(saved));
      } catch {}
    }
  }, [store?.id, profile?.store_id]);

  // Fetch today's sales for cashier recent order history
  const fetchRecentSales = useCallback(async () => {
    try {
      const targetStoreId = store?.id || profile?.store_id || '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('store_id', targetStoreId)
        .gte('created_at', todayStart)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        setRecentSales(data);
      }
    } catch {}
  }, [store?.id, profile?.store_id]);

  useEffect(() => {
    fetchDrafts();
    fetchRecentSales();
    try {
      const last = localStorage.getItem('kasirflow_last_completed_sale');
      if (last) setLastCompletedSale(JSON.parse(last));
    } catch {}
  }, [fetchDrafts, fetchRecentSales]);

  // Save current cart into draft queue
  const handleSaveDraft = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (cart.items.length === 0) {
      toast.error('Keranjang kosong, tidak ada pesanan untuk disimpan');
      return;
    }

    setSavingDraft(true);
    const targetStoreId = store?.id || profile?.store_id || '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';
    const draftPayload = {
      id: cart.activeDraftId || undefined,
      storeId: targetStoreId,
      name: draftName.trim() || (draftTable ? `Meja ${draftTable}` : `Antrean #${drafts.length + 1}`),
      tableNumber: draftTable.trim(),
      notes: draftNotes.trim(),
      subtotal,
      totalHpp: cart.getTotalHpp(),
      grandTotal,
      paymentMethod: cart.paymentMethod,
      items: cart.items.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        sellPrice: Number(item.product.sell_price),
        buyPrice: Number(item.product.buy_price || 0),
        discountPercent: Number(item.product.discount_percent || 0),
        subtotal: Number(item.product.sell_price) * (1 - Number(item.product.discount_percent || 0) / 100) * item.quantity,
        imageUrl: item.product.image_url,
        sku: item.product.sku,
      })),
    };

    try {
      const res = await fetch('/api/draft-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftPayload),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Draft tersimpan: "${data.draft.name}"`, {
          description: `${cart.items.length} menu tersimpan aman di Antrean Kasir`,
        });
      } else {
        const fallbackDraft = {
          ...draftPayload,
          id: `LOCAL-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const updated = [fallbackDraft, ...drafts.filter((d) => d.id !== cart.activeDraftId)];
        setDrafts(updated);
        localStorage.setItem('kasirflow_pos_drafts', JSON.stringify(updated));
        toast.success(`Draft tersimpan di antrean kasir lokal!`);
      }

      cart.clearCart();
      setSaveDraftOpen(false);
      setDraftName('');
      setDraftTable('');
      setDraftNotes('');
      fetchDrafts();
    } catch {
      toast.error('Gagal menyimpan draft pesanan');
    } finally {
      setSavingDraft(false);
    }
  };

  // Restore a draft back into active cart
  const restoreDraftToCart = (draft: any) => {
    const restoredItems = draft.items.map((it: any) => {
      const existingProduct = products.find((p) => p.id === it.productId);
      const product: Product = existingProduct || {
        id: it.productId,
        store_id: profile?.store_id || 'demo-store-id',
        name: it.productName,
        sell_price: it.sellPrice || it.unitPrice || 0,
        buy_price: it.buyPrice || 0,
        stock: 999,
        min_stock: 0,
        category_id: null,
        sku: it.sku || `DFT-${draft.tableNumber || ''}`,
        image_url: it.imageUrl || null,
        discount_percent: it.discountPercent || 0,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };
      return {
        product,
        quantity: it.quantity,
      };
    });

    cart.setItems(restoredItems);
    cart.setActiveDraft(draft.id, draft.name);
    if (draft.paymentMethod) {
      cart.setPaymentMethod(draft.paymentMethod);
    }

    toast.success(`Draft "${draft.name}" dimuat ke keranjang kasir!`, {
      description: 'Silakan lanjutkan pembayaran atau tambahkan menu',
    });
    setTableOrdersOpen(false);
    setCartMobileOpen(true);
  };

  // Delete a draft from queue
  const deleteDraft = async (draftId: string) => {
    try {
      await fetch(`/api/draft-orders?id=${encodeURIComponent(draftId)}`, { method: 'DELETE' });
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      const saved = localStorage.getItem('kasirflow_pos_drafts');
      if (saved) {
        const list = JSON.parse(saved).filter((d: any) => d.id !== draftId);
        localStorage.setItem('kasirflow_pos_drafts', JSON.stringify(list));
      }
      toast.info('Draft antrean dihapus');
    } catch {
      toast.error('Gagal menghapus draft');
    }
  };

  // View receipt for any past sale
  const showSaleReceipt = async (sale: any) => {
    if (sale.items && sale.items.length > 0) {
      setReceiptData(sale);
      return;
    }

    try {
      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', sale.id);

      const mappedItems = (saleItems || []).map((si: any) => ({
        product: {
          id: si.product_id,
          name: si.product_name,
          sell_price: si.unit_price,
          buy_price: si.unit_cost,
          discount_percent: 0,
        },
        quantity: si.quantity,
      }));

      setReceiptData({
        saleId: sale.id,
        invoice_number: sale.invoice_number,
        items: mappedItems,
        subtotal: sale.subtotal,
        discount: sale.discount_amount || 0,
        tax: sale.tax_amount || 0,
        grandTotal: sale.grand_total,
        paid: sale.paid_amount || sale.grand_total,
        change: sale.change_amount || 0,
        paymentMethod: sale.payment_method,
        storeName: store?.name || 'KasirFlow',
        storeAddress: store?.address,
        storePhone: store?.phone,
        storeLogo: store?.logo_url || null,
        date: new Date(sale.created_at).toLocaleString('id-ID'),
      });
    } catch {
      toast.error('Gagal memuat rincian transaksi');
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const targetStoreId = store?.id || profile?.store_id || '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';

    // First check local cache for 0ms initial load
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
      const prodRes = await fetch(`/api/products?storeId=${targetStoreId}&_t=${Date.now()}`);
      if (prodRes.ok) {
        const prodJson = await prodRes.json();
        if (prodJson.products && prodJson.products.length > 0) {
          let list = prodJson.products as Product[];
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
          const categoriesRes = await supabase
            .from('categories')
            .select('*')
            .eq('store_id', targetStoreId)
            .order('name');
          if (categoriesRes.data) setCategories(categoriesRes.data as Category[]);
          setLoading(false);
          return;
        }
      }
    } catch {}

    const [productsRes, categoriesRes] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*)')
        .eq('store_id', targetStoreId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('categories')
        .select('*')
        .eq('store_id', targetStoreId)
        .order('name'),
    ]);

    if (productsRes.data && productsRes.data.length > 0) {
      realDbProductIdsRef.current = new Set(productsRes.data.map((p: any) => p.id));
      setProducts(productsRes.data as Product[]);
      const slug = store?.slug || 'aldocoffestreet';
      fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeSlug: slug, products: productsRes.data }),
      }).catch(() => {});
    } else {
      try {
        const slug = store?.slug || 'aldocoffestreet';
        const menuRes = await fetch(`/api/menu?storeSlug=${encodeURIComponent(slug)}&_t=${Date.now()}`);
        if (menuRes.ok) {
          const menuData = await menuRes.json();
          if (menuData.products && menuData.products.length > 0) {
            setProducts(menuData.products as Product[]);
          }
        }
      } catch {
        if (productsRes.data) setProducts(productsRes.data as Product[]);
      }
    }
    if (categoriesRes.data) setCategories(categoriesRes.data as Category[]);
    setLoading(false);
  }, [store?.id, store?.slug, profile?.store_id]);

  useEffect(() => {
    loadData();

    // Real-time synchronization when owner changes prices in Products page
    let bc: BroadcastChannel | null = null;
    const applyProductUpdate = (updated: Product) => {
      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
      // Also update existing item in active cart if present
      const currentItems = cart.items;
      let cartChanged = false;
      const updatedCartItems = currentItems.map((ci) => {
        if (ci.product.id === updated.id) {
          cartChanged = true;
          return {
            ...ci,
            product: {
              ...ci.product,
              sell_price: updated.sell_price,
              buy_price: updated.buy_price,
              discount_percent: updated.discount_percent,
            },
          };
        }
        return ci;
      });
      if (cartChanged) {
        cart.setItems(updatedCartItems);
        toast.info(`Harga produk "${updated.name}" diperbarui oleh owner secara real-time.`);
      }
    };

    try {
      bc = new BroadcastChannel('kasirflow_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'PRODUCTS_UPDATED' && event.data?.product) {
          applyProductUpdate(event.data.product);
        }
      };
    } catch {}

    const handleCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && detail.id) {
        applyProductUpdate(detail);
      }
    };
    window.addEventListener('kasirflow_products_updated', handleCustomEvent);

    return () => {
      if (bc) bc.close();
      window.removeEventListener('kasirflow_products_updated', handleCustomEvent);
    };
  }, [loadData, cart]);

  const filteredProducts = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
    return matchSearch && matchCategory;
  });

  const subtotal = cart.getSubtotal();
  const grandTotal = subtotal;
  const change = cart.paidAmount - grandTotal;

  const generateUniqueInvoiceNumber = async (storeId: string, attempt = 0): Promise<string> => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    // Unique 4-character code derived from store UUID to prevent cross-store collision
    const storeCode = storeId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'POS';

    // Count today's sales for this store
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    let currentCount = 0;
    try {
      const { count } = await supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .gte('created_at', todayStart);
      currentCount = count || 0;
    } catch {
      currentCount = 0;
    }

    const seq = String(currentCount + 1 + attempt).padStart(4, '0');

    // On retry, append random salt to guarantee collision-freedom
    if (attempt > 0) {
      const salt = Math.random().toString(36).substring(2, 6).toUpperCase();
      return `INV-${dateStr}-${storeCode}-${seq}-${salt}`;
    }

    return `INV-${dateStr}-${storeCode}-${seq}`;
  };

  const handleCheckout = async () => {
    if (!profile?.store_id || !profile?.id || cart.items.length === 0) return;
    if (cart.paidAmount < grandTotal) {
      toast.error('Uang bayar kurang dari total');
      return;
    }

    setProcessing(true);
    try {
      let sale: any = null;
      let finalInvoiceNum = '';
      let attempt = 0;
      const maxAttempts = 3;

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.id);
      const validUserId = isUuid ? profile.id : '00000000-0000-4000-8000-000000000001';

      while (attempt < maxAttempts) {
        finalInvoiceNum = await generateUniqueInvoiceNumber(profile.store_id, attempt);

        const saleData = {
          store_id: profile.store_id,
          user_id: validUserId,
          invoice_number: finalInvoiceNum,
          subtotal: subtotal,
          discount_amount: 0,
          tax_amount: 0,
          grand_total: grandTotal,
          total_hpp: cart.getTotalHpp(),
          payment_method: cart.paymentMethod,
          paid_amount: cart.paidAmount,
          change_amount: change,
          status: 'COMPLETED',
        };

        const { data, error: saleError } = await supabase
          .from('sales')
          .insert(saleData)
          .select()
          .single();

        if (!saleError && data) {
          sale = data;
          break;
        }

        // Check if duplicate key violation
        const isDuplicate =
          saleError?.code === '23505' ||
          saleError?.message?.toLowerCase().includes('unique') ||
          saleError?.message?.toLowerCase().includes('duplicate') ||
          saleError?.message?.toLowerCase().includes('sales_invoice_number_key');

        if (isDuplicate) {
          attempt++;
          continue;
        }

        throw saleError;
      }

      if (!sale) {
        throw new Error('Gagal memproses transaksi: nomor invoice bentrok. Silakan coba lagi.');
      }

      // Create sale items with foreign key constraint safety (product_id REFERENCES products(id))
      const isUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const saleItems = cart.items.map((item) => {
        const isDbProduct = realDbProductIdsRef.current.has(item.product.id);
        const validFkId = isDbProduct && isUuidRegex.test(item.product.id) ? item.product.id : null;

        return {
          sale_id: sale.id,
          product_id: validFkId,
          product_name: item.product.name,
          unit_cost: Number(item.product.buy_price || 0),
          unit_price: Number(item.product.sell_price) * (1 - Number(item.product.discount_percent || 0) / 100),
          quantity: item.quantity,
          subtotal: Number(item.product.sell_price) * (1 - Number(item.product.discount_percent || 0) / 100) * item.quantity,
        };
      });

      let { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
      if (itemsError) {
        console.warn('sale_items insert error, trying fallback:', itemsError.message);
        if (
          itemsError.code === '23503' ||
          itemsError.message?.toLowerCase().includes('foreign key') ||
          itemsError.message?.toLowerCase().includes('sale_items_product_id_fkey')
        ) {
          // Automatic safe retry: set product_id to null (fully supported by PostgreSQL schema)
          const fallbackItems = saleItems.map((si) => ({ ...si, product_id: null }));
          const { error: retryError } = await supabase.from('sale_items').insert(fallbackItems);
          if (retryError) throw retryError;
        } else {
          throw itemsError;
        }
      }

      // Update stock and create inventory logs (only for valid UUID database products)
      for (const item of cart.items) {
        if (!isUuidRegex.test(item.product.id)) continue;
        const product = products.find((p) => p.id === item.product.id);
        if (!product) continue;

        const newStock = Math.max(0, product.stock - item.quantity);
        await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.product.id);

        if (validUserId && isUuidRegex.test(validUserId)) {
          try {
            await supabase.from('inventory_logs').insert({
              store_id: profile.store_id,
              product_id: item.product.id,
              user_id: validUserId,
              type: 'SALE',
              quantity_change: -item.quantity,
              stock_before: product.stock,
              stock_after: newStock,
              note: `Penjualan ${finalInvoiceNum}`,
            });
          } catch {}
        }
      }

      const completedReceipt = {
        saleId: sale.id,
        invoice_number: finalInvoiceNum,
        items: [...cart.items],
        subtotal,
        discount: 0,
        tax: 0,
        grandTotal,
        paid: cart.paidAmount,
        change,
        paymentMethod: cart.paymentMethod,
        storeName: store?.name || 'KasirFlow',
        storeAddress: store?.address,
        storePhone: store?.phone,
        storeLogo: store?.logo_url || null,
        date: new Date().toLocaleString('id-ID'),
        timestamp: new Date().toISOString(),
      };

      setReceiptData(completedReceipt);
      setLastCompletedSale(completedReceipt);
      try {
        localStorage.setItem('kasirflow_last_completed_sale', JSON.stringify(completedReceipt));
      } catch {}

      const announcedTotal = grandTotal;
      const announcedMethod = cart.paymentMethod;
      const announcedStore = store?.name;

      // If this transaction was from an active table order, mark it COMPLETED & PAID with invoice number
      if (activeTableOrderId) {
        fetch('/api/table-orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: activeTableOrderId,
            status: 'COMPLETED',
            paymentStatus: 'PAID',
            invoiceNumber: finalInvoiceNum,
          }),
        })
          .then(() => fetchTableOrders())
          .catch(() => {});
        setActiveTableOrderId(null);
      }

      // If this transaction was from an active draft, remove from draft queue
      if (cart.activeDraftId) {
        deleteDraft(cart.activeDraftId);
      }

      cart.clearCart();
      setCheckoutOpen(false);
      setCartMobileOpen(false);
      toast.success('Transaksi berhasil!', {
        description: `Invoice ${finalInvoiceNum} tersimpan di riwayat kasir.`,
      });
      loadData(); // Refresh products for updated stock
      fetchRecentSales();
      fetchTableOrders();

      // Automatic spoken announcement (Soundbox)
      speakPaymentSuccess(announcedTotal, {
        storeName: announcedStore,
        paymentMethod: announcedMethod,
      });
    } catch (error: any) {
      toast.error(error.message || 'Gagal memproses transaksi');
    } finally {
      setProcessing(false);
    }
  };

  const quickCashAmounts = [50000, 100000, 150000, 200000];
  const totalCartQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left: Product Grid */}
      <div className="flex-1 flex flex-col min-w-0 p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold mb-1">Kasir</h1>
            <p className="text-sm text-muted-foreground">Pilih produk dan tambahkan ke keranjang</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={(pendingTableOrders.length + drafts.length) > 0 ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setAntreanTab(drafts.length > 0 && pendingTableOrders.length === 0 ? 'drafts' : 'tables');
                setTableOrdersOpen(true);
              }}
              className={cn(
                'relative gap-1.5 font-bold',
                (pendingTableOrders.length + drafts.length) > 0
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                  : 'text-foreground'
              )}
              title="Kelola antrean pesanan masuk & draft kasir"
            >
              <FolderKanban className="h-4 w-4" />
              <span className="hidden sm:inline">Antrean &amp; Draft</span>
              <span className="sm:hidden">Antrean</span>
              {(pendingTableOrders.length + drafts.length) > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-rose-600 text-white text-xs font-black animate-pulse">
                  {pendingTableOrders.length + drafts.length}
                </span>
              )}
            </Button>
            {/* Dedicated KDS / Antrean Page Link */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/orders')}
              className="gap-1.5 font-bold text-xs h-9 border-amber-500/40 text-amber-600 bg-amber-50/50 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-400"
              title="Buka Halaman Khusus Antrean & Dapur (KDS)"
            >
              <ChefHat className="h-4 w-4 text-amber-500" />
              <span className="hidden md:inline">Layar Dapur</span>
              {pendingTableOrders.length > 0 && (
                <span className="h-4 px-1 rounded-full bg-amber-500 text-stone-950 text-[10px] font-black flex items-center justify-center">
                  {pendingTableOrders.length}
                </span>
              )}
            </Button>
            <Button
              variant={cart.items.length > 0 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCartMobileOpen(true)}
              className="lg:hidden relative gap-2 font-medium"
            >
              <ShoppingCart className="h-4 w-4" />
              <span>Keranjang</span>
              {totalCartQuantity > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                  {totalCartQuantity}
                </span>
              )}
            </Button>
            {/* Bluetooth Thermal Printer Indicator & Trigger */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrinterDialogOpen(true)}
              className={cn(
                'gap-1.5 font-bold text-xs h-9 transition-all',
                printerConnected
                  ? 'border-emerald-500/60 text-emerald-850 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Koneksikan Printer Thermal Bluetooth / USB (Gratis Tanpa Langganan)"
            >
              <Bluetooth className={cn('h-4 w-4', printerConnected ? 'text-emerald-600 animate-pulse' : 'text-muted-foreground')} />
              <span className="hidden md:inline">Printer Thermal</span>
              <span className={cn('h-2 w-2 rounded-full', printerConnected ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600')} />
            </Button>
            <PosVoiceControl storeName={store?.name} />
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari produk atau SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-thin pb-2">
          <Button
            variant={selectedCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory('all')}
            className="shrink-0"
          >
            Semua
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat.id)}
              className="shrink-0"
            >
              {cat.name}
            </Button>
          ))}
        </div>

        {/* Products grid */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mb-3 opacity-50" />
            <p>Belum ada produk. Tambahkan produk di menu Produk & Stok.</p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pr-2">
              {filteredProducts.map((product) => {
                const outOfStock = product.stock <= 0;
                const lowStock = product.stock <= product.min_stock && product.stock > 0;
                return (
                  <button
                    key={product.id}
                    onClick={() => cart.addItem(product)}
                    disabled={outOfStock}
                    className="group relative flex flex-col rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:shadow-md hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="mb-3 aspect-square overflow-hidden rounded-md bg-muted relative">
                      {product.image_url && !imageErrors[product.id] ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          onError={() => setImageErrors((prev) => ({ ...prev, [product.id]: true }))}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground/40 bg-muted/60 select-none">
                          {product.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm leading-tight line-clamp-2">{product.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {product.sku || 'No SKU'}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-sm font-bold text-primary">{formatCurrency(Number(product.sell_price) * (1 - Number(product.discount_percent || 0) / 100))}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <span className={`text-xs ${outOfStock ? 'text-destructive' : lowStock ? 'text-warning' : 'text-muted-foreground'}`}>
                        Stok: {product.stock}
                      </span>
                      {lowStock && !outOfStock && (
                        <span className="text-xs text-warning">(rendah)</span>
                      )}
                      {outOfStock && (
                        <span className="text-xs text-destructive">(habis)</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Cart Drawer Backdrop on Mobile/Tablet */}
      {cartMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30 transition-opacity backdrop-blur-xs"
          onClick={() => setCartMobileOpen(false)}
        />
      )}

      {/* Right: Cart */}
      <div
        className={cn(
          'w-full sm:w-[380px] lg:w-[400px] flex flex-col border-l bg-card shrink-0 transition-transform duration-200 ease-in-out',
          'fixed lg:relative inset-y-0 right-0 z-40 lg:z-auto pt-16 lg:pt-0 shadow-2xl lg:shadow-none',
          cartMobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0 pointer-events-none lg:pointer-events-auto'
        )}
      >
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Keranjang
              {totalCartQuantity > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {totalCartQuantity}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-1">
              {cart.items.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => cart.clearCart()} className="text-xs h-8">
                  <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" />
                  Kosongkan
                </Button>
              )}
              <button
                className="lg:hidden p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground ml-1"
                onClick={() => setCartMobileOpen(false)}
                title="Tutup keranjang"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Active draft/table indicator */}
        {(cart.activeDraftId || activeTableOrderId) && (
          <div className="mx-3 mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-between text-xs shadow-xs">
            <div className="flex items-center gap-1.5 truncate">
              <ClipboardList className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="font-bold text-amber-900 dark:text-amber-200 truncate">
                {cart.activeDraftName || (activeTableOrderId ? 'Pesanan Meja Aktif' : 'Draft Antrean Aktif')}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-muted-foreground hover:text-destructive px-1.5"
              onClick={() => {
                cart.setActiveDraft(null, null);
                setActiveTableOrderId(null);
                toast.info('Konteks draft dilepas dari keranjang');
              }}
            >
              Lepas
            </Button>
          </div>
        )}

        {/* Reassuring Last Completed Transaction Banner so order details are NEVER lost */}
        {lastCompletedSale && cart.items.length === 0 && (
          <div className="mx-3 mt-3 p-2.5 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs shadow-xs flex items-center justify-between animate-in fade-in">
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1 font-bold text-emerald-800 dark:text-emerald-300 truncate">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">Selesai: {lastCompletedSale.invoice_number}</span>
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium truncate">
                {formatCurrency(lastCompletedSale.grandTotal)} &bull; {lastCompletedSale.items?.length || 0} menu
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] font-bold border-emerald-400 bg-white dark:bg-stone-900 text-emerald-700 hover:bg-emerald-100 shrink-0 shadow-xs"
              onClick={() => setReceiptData(lastCompletedSale)}
            >
              <Receipt className="h-3.5 w-3.5 mr-1" />
              Rincian
            </Button>
          </div>
        )}

        {/* Cart items */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {cart.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                <ShoppingCart className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm font-medium">Keranjang kosong</p>
                <p className="text-xs">Pilih produk untuk memulai pesanan</p>
                {drafts.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAntreanTab('drafts');
                      setTableOrdersOpen(true);
                    }}
                    className="mt-4 text-xs font-bold gap-1.5 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  >
                    <FolderKanban className="h-3.5 w-3.5 text-amber-600" />
                    Buka Draft Antrean ({drafts.length})
                  </Button>
                )}
              </div>
            ) : (
              cart.items.map((item) => (
                <div key={item.product.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(Number(item.product.sell_price) * (1 - Number(item.product.discount_percent || 0) / 100))}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => cart.updateQuantity(item.product.id, item.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => cart.updateQuantity(item.product.id, item.quantity + 1)}
                      disabled={item.quantity >= item.product.stock}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 ml-1 text-destructive"
                      onClick={() => cart.removeItem(item.product.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Cart summary */}
        {cart.items.length > 0 && (
          <div className="border-t p-4 space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-primary">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  if (activeTableOrderId) {
                    const found = tableOrders.find((o) => o.id === activeTableOrderId);
                    setDraftName(found ? `Meja ${found.tableNumber} - ${found.customerName}` : 'Pesanan Meja');
                    setDraftTable(found?.tableNumber || '');
                  } else if (cart.activeDraftName) {
                    setDraftName(cart.activeDraftName);
                  } else {
                    setDraftName(`Antrean #${drafts.length + 1}`);
                  }
                  setSaveDraftOpen(true);
                }}
                className="h-11 border-amber-300 dark:border-amber-800 bg-amber-50/80 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-bold text-xs gap-1.5 shadow-xs"
                title="Tahan pesanan dan simpan ke antrean draft"
              >
                <PauseCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Simpan Draft</span>
              </Button>
              <Button
                className="w-full h-11 text-xs font-bold"
                size="lg"
                onClick={() => setCheckoutOpen(true)}
              >
                <Receipt className="h-4 w-4 mr-1.5" />
                Bayar Sekarang
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pembayaran</DialogTitle>
            <DialogDescription>Total tagihan: {formatCurrency(grandTotal)}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Metode Pembayaran</label>
              <Select value={cart.paymentMethod} onValueChange={(v) => cart.setPaymentMethod(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Tunai</SelectItem>
                  <SelectItem value="QRIS">QRIS</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                  <SelectItem value="DEBIT">Debit</SelectItem>
                  <SelectItem value="CREDIT">Kredit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cart.paymentMethod === 'CASH' && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold">Uang Tunai Diterima</label>
                    <span className="text-xs text-muted-foreground">
                      Total: <strong className="text-foreground">{formatCurrency(grandTotal)}</strong>
                    </span>
                  </div>
                  <Input
                    type="number"
                    value={cart.paidAmount || ''}
                    onChange={(e) => cart.setPaidAmount(Number(e.target.value) || 0)}
                    placeholder={grandTotal.toString()}
                    className="font-mono text-base font-bold h-11"
                    autoFocus
                  />
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                      <Button
                        type="button"
                        variant={cart.paidAmount === grandTotal ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => cart.setPaidAmount(grandTotal)}
                        className={cn(
                          'text-xs font-bold h-9',
                          cart.paidAmount === grandTotal && 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        )}
                      >
                        Uang Pas
                      </Button>
                      {[10000, 20000, 50000, 100000].map((amt) => (
                        <Button
                          key={amt}
                          type="button"
                          variant={cart.paidAmount === amt ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => cart.setPaidAmount(amt)}
                          className="text-xs font-bold h-9 font-mono"
                        >
                          {formatCurrency(amt)}
                        </Button>
                      ))}
                    </div>

                    {/* Quick increment buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      {[10000, 20000, 50000, 100000].map((inc) => (
                        <button
                          key={inc}
                          type="button"
                          onClick={() => cart.setPaidAmount((cart.paidAmount || 0) + inc)}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-muted hover:bg-amber-100 dark:hover:bg-amber-950/40 hover:text-amber-900 border text-muted-foreground transition font-medium"
                        >
                          +{formatCurrency(inc)}
                        </button>
                      ))}
                      {cart.paidAmount > 0 && (
                        <button
                          type="button"
                          onClick={() => cart.setPaidAmount(0)}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition font-medium ml-auto"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {cart.paidAmount > 0 && (
                  <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total</span>
                      <span>{formatCurrency(grandTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dibayar</span>
                      <span>{formatCurrency(cart.paidAmount)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-medium">
                      <span>Kembalian</span>
                      <span className={change >= 0 ? 'text-success' : 'text-destructive'}>
                        {formatCurrency(Math.max(0, change))}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            {cart.paymentMethod === 'QRIS' && (
              <div className="rounded-2xl border p-4 bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-stone-900 dark:text-stone-100">
                      QRIS Dinamis Pakasir
                    </span>
                  </div>
                  <span className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                    Idempotent &bull; Auto-Detect
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tampilkan barcode QRIS resmi toko di layar untuk discan oleh pelanggan (BCA, Mandiri, BRI, BNI, GoPay, OVO, Dana, ShopeePay).
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    const uniqueId = `POS-${Date.now().toString(36).toUpperCase()}`;
                    setPakasirOrderId(uniqueId);
                    setPakasirDialogOpen(true);
                  }}
                  className="w-full h-10 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-2 shadow"
                >
                  <Receipt className="h-4 w-4" /> Tampilkan Barcode QRIS Pakasir
                </Button>
              </div>
            )}

            {cart.paymentMethod !== 'CASH' && cart.paymentMethod !== 'QRIS' && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="text-muted-foreground">
                  Pembayaran non-tunai. Pastikan pelanggan telah membayar sebelum konfirmasi.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={processing || (cart.paymentMethod === 'CASH' && cart.paidAmount < grandTotal)}
            >
              {processing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Konfirmasi Pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={!!receiptData} onOpenChange={(open) => !open && setReceiptData(null)}>
        <DialogContent className="w-[95vw] sm:max-w-md md:max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-bold">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              Transaksi Berhasil
            </DialogTitle>
          </DialogHeader>
          {receiptData && (
            <div className="space-y-3 text-sm">
              <div className="text-center pb-3 border-b">
                {receiptData.storeLogo && (
                  <div className="flex justify-center mb-2">
                    <img
                      src={receiptData.storeLogo}
                      alt="Logo Toko"
                      className="h-12 w-12 rounded-xl object-cover border shadow-xs bg-white"
                    />
                  </div>
                )}
                <p className="font-bold text-base sm:text-lg">{receiptData.storeName}</p>
                {receiptData.storeAddress && <p className="text-xs text-muted-foreground mt-0.5">{receiptData.storeAddress}</p>}
                {receiptData.storePhone && <p className="text-xs text-muted-foreground">{receiptData.storePhone}</p>}
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground font-mono">{receiptData.invoice_number}</span>
                <span className="text-muted-foreground">{receiptData.date}</span>
              </div>
              <Separator />
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {receiptData.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span className="truncate pr-2">{item.product.name} x{item.quantity}</span>
                    <span className="font-medium shrink-0">{formatCurrency(Number(item.product.sell_price) * (1 - Number(item.product.discount_percent || 0) / 100) * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{formatCurrency(receiptData.subtotal)}</span></div>
                <div className="flex justify-between text-sm font-bold pt-0.5"><span>Total</span><span className="text-primary">{formatCurrency(receiptData.grandTotal)}</span></div>
              </div>
              <Separator />
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Bayar ({receiptData.paymentMethod})</span><span>{formatCurrency(receiptData.paid)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Kembalian</span><span className="font-semibold text-emerald-600">{formatCurrency(receiptData.change)}</span></div>
              </div>
              <p className="text-center text-xs text-muted-foreground pt-1 italic">Terima kasih atas kunjungan Anda!</p>

              {/* Main Print & Share Action Section */}
              <div className="rounded-xl border bg-muted/40 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Cetak / Kirim Struk Pelanggan
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Bebas Langganan (Rp 0)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    type="button"
                    onClick={handlePrintBluetoothFromPos}
                    disabled={printingBluetooth}
                    className="h-10 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs gap-1.5"
                    title="Cetak struk instan ke printer thermal Bluetooth (58mm/80mm)"
                  >
                    {printingBluetooth ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Bluetooth className="h-4 w-4" />
                    )}
                    <span>Cetak Thermal Bluetooth</span>
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (showWhatsappInput) {
                        handleShareWhatsAppFromPos();
                      } else {
                        setShowWhatsappInput(true);
                      }
                    }}
                    className="h-10 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 gap-1.5 shadow-xs"
                    title="Kirim struk digital langsung ke nomor WhatsApp pelanggan"
                  >
                    <Share2 className="h-4 w-4 text-emerald-600" />
                    <span>Kirim Struk WhatsApp</span>
                  </Button>
                </div>

                {/* Optional WhatsApp Input drawer */}
                {showWhatsappInput && (
                  <div className="p-2.5 rounded-lg bg-background border space-y-2 animate-in fade-in-50">
                    <label className="text-xs font-semibold text-muted-foreground block">
                      Nomor WhatsApp Pelanggan (Opsional):
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="tel"
                        placeholder="Contoh: 08123456789 atau kosongkan"
                        value={whatsappPhone}
                        onChange={(e) => setWhatsappPhone(e.target.value)}
                        className="text-xs h-9"
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleShareWhatsAppFromPos()}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 shrink-0"
                      >
                        Kirim Sekarang
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Format pesan otomatis rapi, mencantumkan detail menu, subtotal, dan nomor nota.
                    </p>
                  </div>
                )}
              </div>

              {/* Tip for iframe sandbox print restrictions */}
              <div className="rounded-md bg-muted/60 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2 border">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>
                  <strong>Tips Cetak:</strong> Untuk printer Bluetooth (RPP02N, Panda, MPT-II, dll), pastikan Bluetooth aktif. Jika menggunakan kabel USB, klik tombol <strong>Cetak Browser</strong>.
                </span>
              </div>
            </div>
          )}
          <DialogFooter className="pt-3 border-t sm:justify-stretch">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => {
                  setReceiptData(null);
                  setShowWhatsappInput(false);
                  setWhatsappPhone('');
                }}
                className="w-full text-xs sm:text-sm h-10 font-bold"
              >
                Selesai
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  speakPaymentSuccess(receiptData.grandTotal, {
                    storeName: receiptData.storeName,
                    paymentMethod: receiptData.paymentMethod,
                  });
                  toast.info('Memutar ulang suara pengumuman...');
                }}
                className="w-full text-xs sm:text-sm h-10 font-medium gap-1 text-primary hover:text-primary hover:bg-primary/10 border-primary/20"
                title="Dengarkan lagi suara nominal pembayaran"
              >
                <Volume2 className="h-4 w-4 shrink-0" />
                <span className="truncate">Ulang Suara</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => window.print()}
                className="w-full text-xs sm:text-sm h-10 font-medium"
              >
                <Printer className="h-4 w-4 mr-1 shrink-0" />
                <span className="truncate">Cetak Browser</span>
              </Button>
              {receiptData?.saleId && (
                <a
                  href={`/receipt/${receiptData.saleId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md text-xs sm:text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-2 w-full text-center truncate"
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Tab Baru</span>
                </a>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Draft Dialog */}
      <Dialog open={saveDraftOpen} onOpenChange={setSaveDraftOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <PauseCircle className="h-5 w-5 text-amber-600" />
              Simpan ke Draft Antrean Kasir
            </DialogTitle>
            <DialogDescription>
              Tahan transaksi ini sementara. Meja atau kasir dapat melanjutkan pesanan ini kapan saja tanpa kehilangan menu.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveDraft} className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Nama Pelanggan / Label Antrean
              </label>
              <Input
                placeholder="Contoh: Meja 03, Kak Sarah, Antrean #1"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['Meja 1', 'Meja 2', 'Meja 3', 'Meja 4', 'Takeaway', 'Grab/Gojek'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDraftName(preset)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-muted hover:bg-amber-100 hover:text-amber-900 border text-muted-foreground transition font-medium"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Catatan Tambahan (Opsional)
              </label>
              <Input
                placeholder="Contoh: Menunggu teman / bayar nanti"
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
              />
            </div>

            <div className="p-3 bg-muted/60 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jumlah Item</span>
                <span className="font-semibold">{cart.items.length} menu ({totalCartQuantity} porsi)</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-border/50">
                <span>Total Ditahan:</span>
                <span className="text-primary">{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setSaveDraftOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={savingDraft} className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5">
                {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                Simpan ke Draft
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Comprehensive Unified Antrean & Draft Dialog */}
      <Dialog open={tableOrdersOpen} onOpenChange={setTableOrdersOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6">
          <DialogHeader className="shrink-0 pb-2">
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-bold">
              <FolderKanban className="h-5 w-5 text-amber-600" />
              Antrean Pesanan &amp; Draft Kasir
            </DialogTitle>
            <DialogDescription>
              Kelola pesanan realtime dari QR Meja, pesanan yang sedang ditahan kasir (draft), dan riwayat pesanan selesai.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={antreanTab} onValueChange={(v) => setAntreanTab(v as any)} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid grid-cols-3 mb-3 shrink-0 h-11 p-1 bg-muted/80">
              <TabsTrigger value="tables" className="text-xs font-bold gap-1.5 relative">
                <Bell className="h-3.5 w-3.5 text-amber-600" />
                <span>Pesanan Meja</span>
                {pendingTableOrders.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
                    {pendingTableOrders.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="drafts" className="text-xs font-bold gap-1.5 relative">
                <PauseCircle className="h-3.5 w-3.5 text-blue-600" />
                <span>Draft Kasir</span>
                {drafts.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-black">
                    {drafts.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="recent" className="text-xs font-bold gap-1.5">
                <History className="h-3.5 w-3.5 text-emerald-600" />
                <span>Selesai Hari Ini ({recentSales.length})</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Realtime Table Orders */}
            <TabsContent value="tables" className="flex-1 flex flex-col min-h-0 overflow-hidden m-0">
              {/* Filter pills */}
              <div className="flex gap-1.5 pb-2 shrink-0 overflow-x-auto scrollbar-thin text-xs">
                {(['ALL', 'PENDING', 'PREPARING', 'PAID'] as const).map((filterKey) => {
                  const label =
                    filterKey === 'ALL'
                      ? `Semua (${tableOrders.length})`
                      : filterKey === 'PENDING'
                      ? `Menunggu (${pendingTableOrders.length})`
                      : filterKey === 'PREPARING'
                      ? `Sedang Dimasak (${tableOrders.filter((o) => o.status === 'PREPARING').length})`
                      : `Lunas/Selesai (${tableOrders.filter((o) => o.status === 'COMPLETED' || o.paymentStatus === 'PAID').length})`;
                  return (
                    <button
                      key={filterKey}
                      type="button"
                      onClick={() => setTableFilter(filterKey)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg font-semibold text-xs transition shrink-0',
                        tableFilter === filterKey
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <ScrollArea className="flex-1 pr-2">
                <div className="space-y-3 py-1">
                  {tableOrders.filter((o) => {
                    if (tableFilter === 'PENDING') return o.status === 'PENDING';
                    if (tableFilter === 'PREPARING') return o.status === 'PREPARING';
                    if (tableFilter === 'PAID') return o.status === 'COMPLETED' || o.paymentStatus === 'PAID';
                    return true;
                  }).length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground space-y-2">
                      <Utensils className="h-10 w-10 mx-auto opacity-30" />
                      <p className="text-sm font-semibold">Tidak ada pesanan meja pada kategori ini</p>
                      <p className="text-xs">Pelanggan yang scan barcode QR di meja akan muncul secara otomatis di sini.</p>
                    </div>
                  ) : (
                    tableOrders
                      .filter((o) => {
                        if (tableFilter === 'PENDING') return o.status === 'PENDING';
                        if (tableFilter === 'PREPARING') return o.status === 'PREPARING';
                        if (tableFilter === 'PAID') return o.status === 'COMPLETED' || o.paymentStatus === 'PAID';
                        return true;
                      })
                      .map((order) => {
                        const isPaid = order.paymentStatus === 'PAID';
                        const isCompleted = order.status === 'COMPLETED';
                        const isPreparing = order.status === 'PREPARING';

                        return (
                          <div
                            key={order.id}
                            className={cn(
                              'p-3.5 sm:p-4 rounded-2xl border transition-all space-y-2.5',
                              isPaid || isCompleted
                                ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20'
                                : order.status === 'PENDING'
                                ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs ring-1 ring-amber-400/50'
                                : 'border-blue-300 bg-blue-50/30 dark:bg-blue-950/20'
                            )}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="px-2.5 py-0.5 rounded-lg bg-stone-900 text-white font-black text-xs">
                                    MEJA {order.tableNumber}
                                  </span>
                                  <span className="font-bold text-sm text-foreground">{order.customerName}</span>
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    {order.id}
                                  </span>
                                </div>
                                {order.notes && (
                                  <p className="text-xs text-amber-800 dark:text-amber-300 italic mt-1 font-medium">
                                    Catatan: &ldquo;{order.notes}&rdquo;
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {isPaid ? (
                                  <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1 shadow-xs">
                                    <CheckCircle2 className="h-3 w-3" /> LUNAS
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-300">
                                    Belum Lunas
                                  </span>
                                )}
                                <span className="text-[10px] font-semibold text-muted-foreground">
                                  {isCompleted
                                    ? 'Selesai'
                                    : isPreparing
                                    ? 'Sedang Dimasak'
                                    : 'Menunggu Konfirmasi'}
                                </span>
                              </div>
                            </div>

                            {/* Ordered items breakdown */}
                            <div className="divide-y divide-border/60 text-xs bg-background/90 rounded-xl p-2.5 border border-border/40">
                              {order.items?.map((it: any, idx: number) => (
                                <div key={idx} className="py-1.5 flex justify-between items-start">
                                  <div>
                                    <span className="font-semibold text-foreground">{it.quantity}x {it.productName}</span>
                                    {it.notes && (
                                      <span className="block text-[11px] text-muted-foreground italic">
                                        ({it.notes})
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-medium text-foreground">{formatCurrency(it.subtotal)}</span>
                                </div>
                              ))}
                            </div>

                            <div className="flex justify-between items-center text-sm font-bold pt-1">
                              <span className="text-muted-foreground">Total Tagihan:</span>
                              <span className="text-primary font-black text-base">
                                {formatCurrency(order.totalAmount)}
                              </span>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
                              {!isCompleted && (
                                <Button
                                  size="sm"
                                  onClick={() => importTableOrderToCart(order)}
                                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-1.5 shadow-xs"
                                >
                                  <ShoppingCart className="h-3.5 w-3.5" />
                                  Tarik ke Kasir &amp; Bayar
                                </Button>
                              )}
                              {order.status === 'PENDING' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    fetch('/api/table-orders', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ orderId: order.id, status: 'PREPARING' }),
                                    }).then(() => fetchTableOrders());
                                  }}
                                  className="text-xs font-semibold gap-1"
                                >
                                  <ChefHat className="h-3.5 w-3.5" />
                                  Tandai Sedang Dibuat
                                </Button>
                              )}
                              {order.status === 'PREPARING' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    fetch('/api/table-orders', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ orderId: order.id, status: 'SERVED' }),
                                    }).then(() => fetchTableOrders());
                                    toast.success(`Meja ${order.tableNumber} disajikan`);
                                  }}
                                  className="text-xs font-semibold gap-1 text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Disajikan
                                </Button>
                              )}
                              {!isCompleted ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    fetch('/api/table-orders', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ orderId: order.id, status: 'COMPLETED' }),
                                    }).then(() => fetchTableOrders());
                                    toast.success(`Meja ${order.tableNumber} selesai & dikosongkan`);
                                  }}
                                  className="text-xs text-muted-foreground hover:text-foreground ml-auto"
                                >
                                  Selesaikan Meja
                                </Button>
                              ) : (
                                <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                                  <CheckCircle2 className="h-4 w-4" />
                                  Pesanan Selesai Tersimpan
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* TAB 2: Cashier Drafts (Held Cart Orders) */}
            <TabsContent value="drafts" className="flex-1 flex flex-col min-h-0 overflow-hidden m-0">
              <ScrollArea className="flex-1 pr-2">
                <div className="space-y-3 py-1">
                  {drafts.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground space-y-2">
                      <PauseCircle className="h-10 w-10 mx-auto opacity-30 text-amber-600" />
                      <p className="text-sm font-semibold">Belum ada pesanan yang ditahan di draft</p>
                      <p className="text-xs max-w-sm mx-auto">
                        Jika pelanggan sedang mengantre atau menunda pembayaran, Anda bisa klik tombol <strong>&ldquo;Simpan Draft&rdquo;</strong> di keranjang kasir.
                      </p>
                    </div>
                  ) : (
                    drafts.map((draft) => (
                      <div
                        key={draft.id}
                        className="p-4 rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5 shadow-xs"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-lg bg-blue-700 text-white font-bold text-xs">
                                DRAFT
                              </span>
                              <span className="font-bold text-sm text-foreground">{draft.name}</span>
                              {draft.tableNumber && (
                                <span className="text-xs font-semibold px-2 py-0.5 bg-muted rounded-md">
                                  Meja {draft.tableNumber}
                                </span>
                              )}
                            </div>
                            {draft.notes && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">
                                Catatan: &ldquo;{draft.notes}&rdquo;
                              </p>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Disimpan: {new Date(draft.updatedAt || draft.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className="text-base font-black text-primary">
                            {formatCurrency(draft.grandTotal)}
                          </span>
                        </div>

                        {/* Items list */}
                        <div className="divide-y divide-border/60 text-xs bg-background/90 rounded-xl p-2.5 border border-border/40">
                          {draft.items?.map((it: any, idx: number) => (
                            <div key={idx} className="py-1 flex justify-between">
                              <span className="font-medium text-foreground">{it.quantity}x {it.productName}</span>
                              <span className="text-muted-foreground">{formatCurrency(it.subtotal)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center justify-between pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteDraft(draft.id)}
                            className="text-xs text-destructive hover:bg-destructive/10 h-8"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Hapus Draft
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => restoreDraftToCart(draft)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 h-8 shadow-xs"
                          >
                            <Play className="h-3.5 w-3.5" />
                            Lanjutkan ke Kasir
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* TAB 3: Recent Completed Sales of Today */}
            <TabsContent value="recent" className="flex-1 flex flex-col min-h-0 overflow-hidden m-0">
              <ScrollArea className="flex-1 pr-2">
                <div className="space-y-2.5 py-1">
                  {recentSales.length === 0 && !lastCompletedSale ? (
                    <div className="py-12 text-center text-muted-foreground space-y-2">
                      <History className="h-10 w-10 mx-auto opacity-30 text-emerald-600" />
                      <p className="text-sm font-semibold">Belum ada transaksi selesai hari ini</p>
                      <p className="text-xs">Setelah pembayaran berhasil, rincian transaksi otomatis tersimpan di sini dan tidak akan hilang.</p>
                    </div>
                  ) : (
                    recentSales.map((sale) => (
                      <div
                        key={sale.id}
                        className="p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/20 flex flex-wrap items-center justify-between gap-2 shadow-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-emerald-800 dark:text-emerald-300">
                              {sale.invoice_number}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                              {sale.payment_method || 'LUNAS'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(sale.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} &bull; Total: <strong className="text-foreground">{formatCurrency(sale.grand_total)}</strong>
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => showSaleReceipt(sale)}
                          className="text-xs font-bold gap-1 border-emerald-300 hover:bg-emerald-100 text-emerald-800"
                        >
                          <Receipt className="h-3.5 w-3.5" />
                          Lihat Rincian Struk
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Pakasir QRIS Payment Gateway Dialog */}
      <PakasirQrisDialog
        open={pakasirDialogOpen}
        onOpenChange={setPakasirDialogOpen}
        orderId={pakasirOrderId}
        amount={grandTotal}
        title="QRIS Dinamis Aldo Coffe Street"
        description="Pelanggan scan QRIS dari BCA, Mandiri, BRI, BNI, GoPay, OVO, Dana, ShopeePay."
        onPaymentSuccess={() => {
          cart.setPaidAmount(grandTotal);
          setCheckoutOpen(false);
          void handleCheckout();
        }}
      />

      {/* Bluetooth Thermal Printer Management Dialog */}
      <ThermalPrinterDialog
        open={printerDialogOpen}
        onOpenChange={setPrinterDialogOpen}
        storeName={store?.name || 'Aldo Coffe Street'}
      />
    </div>
  );
}
