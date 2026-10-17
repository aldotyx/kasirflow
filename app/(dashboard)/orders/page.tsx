'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/calculations';
import {
  printReceiptDirectly,
  ReceiptPrintData,
  isBluetoothSupported,
  getConnectedDevice,
} from '@/lib/thermal-printer';
import { ThermalPrinterDialog } from '@/components/pos/thermal-printer-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ChefHat,
  Clock,
  ShoppingCart,
  Printer,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Volume2,
  VolumeX,
  Trash2,
  ArrowRight,
  Flame,
  Check,
  Utensils,
  Receipt,
  QrCode,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

export type TableOrderStatus = 'PENDING' | 'PREPARING' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
export type TableOrderPaymentStatus = 'UNPAID' | 'PAID' | 'UNPAID_CASH';

export interface TableOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
  imageUrl?: string | null;
}

export interface TableOrder {
  id: string;
  orderCode?: string;
  storeId: string;
  storeName: string;
  storeSlug?: string;
  tableNumber: string;
  customerName?: string;
  items: TableOrderItem[];
  totalAmount: number;
  status: TableOrderStatus;
  paymentStatus: TableOrderPaymentStatus;
  paymentMethod?: string;
  notes?: string;
  invoiceNumber?: string;
  createdAt: string;
  updatedAt: string;
}

// Web Audio API chime sound generator for kitchen alerts (zero external assets needed)
function playKitchenChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.28, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    // Pleasant double ding chime (587.33Hz D5 -> 880Hz A5)
    playTone(587.33, now, 0.35);
    playTone(880, now + 0.16, 0.6);
  } catch {}
}

export default function OrdersQueuePage() {
  const router = useRouter();
  const { store } = useAuth();

  const [orders, setOrders] = useState<TableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TableOrderStatus>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'columns'>('grid');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);

  // Order deletion confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<TableOrder | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Printing state
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);

  // Keep track of previously seen order IDs to trigger chime on new orders
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  // 1. Initial Load: Read from LocalStorage Cache first (Instant, zero flash)
  useEffect(() => {
    try {
      const cached = localStorage.getItem('kasirflow_table_orders_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOrders(parsed);
          parsed.forEach((o: TableOrder) => {
            if (o.id) seenOrderIdsRef.current.add(o.id);
          });
          setLoading(false);
        }
      }
    } catch {}
  }, []);

  // 2. Fetch Orders from Server & Supabase with Dual Persistence
  const fetchOrders = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/table-orders', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const serverOrders: TableOrder[] = Array.isArray(data.orders) ? data.orders : [];

        // Check if there are newly arrived orders
        let hasNewOrder = false;
        serverOrders.forEach((o) => {
          if (o.id && !seenOrderIdsRef.current.has(o.id)) {
            seenOrderIdsRef.current.add(o.id);
            if (!initialLoadRef.current) {
              hasNewOrder = true;
            }
          }
        });

        if (initialLoadRef.current) {
          initialLoadRef.current = false;
        } else if (hasNewOrder && soundEnabled) {
          playKitchenChime();
          toast.info('Pesanan Meja Baru Diterima!', {
            description: 'Ada pelanggan baru yang melakukan pemesanan dari QR meja.',
          });
        }

        setOrders(serverOrders);

        // Save into local cache for 100% offline & refresh resilience
        try {
          localStorage.setItem('kasirflow_table_orders_cache', JSON.stringify(serverOrders));
          window.dispatchEvent(new Event('kasirflow:orders-updated'));
        } catch {}
      }
    } catch (err) {
      console.warn('Gagal memperbarui antrean:', err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, [soundEnabled]);

  // Periodic polling every 5 seconds
  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => {
      fetchOrders();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // 3. Action: Update Order Status (PENDING -> PREPARING -> SERVED -> COMPLETED)
  const handleUpdateStatus = async (orderId: string, newStatus: TableOrderStatus) => {
    // Optimistic UI update
    const updated = orders.map((o) =>
      o.id === orderId ? { ...o, status: newStatus, updatedAt: new Date().toISOString() } : o
    );
    setOrders(updated);
    try {
      localStorage.setItem('kasirflow_table_orders_cache', JSON.stringify(updated));
      window.dispatchEvent(new Event('kasirflow:orders-updated'));
    } catch {}

    const statusLabels: Record<TableOrderStatus, string> = {
      PENDING: 'Menunggu',
      PREPARING: 'Sedang Dimasak',
      SERVED: 'Siap Disajikan',
      COMPLETED: 'Selesai',
      CANCELLED: 'Dibatalkan',
    };

    try {
      const res = await fetch('/api/table-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status: newStatus }),
      });

      if (res.ok) {
        toast.success(`Status diubah: ${statusLabels[newStatus]}`);
      } else {
        toast.error('Gagal memperbarui status ke database');
      }
    } catch {
      toast.error('Jaringan bermasalah, tersimpan di perangkat lokal');
    }
  };

  // 4. Action: Pull to Cashier Register (/pos)
  const handlePullToCashier = (order: TableOrder) => {
    try {
      // Store targeted order into localStorage for immediate pick up by POS page
      localStorage.setItem('kasirflow_pos_direct_load', JSON.stringify(order));
      toast.success(`Memuat Pesanan Meja ${order.tableNumber} ke Kasir...`);
      router.push(`/pos?loadTableOrder=${encodeURIComponent(order.id)}`);
    } catch {
      router.push('/pos');
    }
  };

  // 5. Action: Print Kitchen Order Ticket (ESC/POS Thermal Bluetooth or Window)
  const handlePrintKitchenTicket = async (order: TableOrder) => {
    setPrintingOrderId(order.id);
    const storeName = store?.name || 'Aldo Coffe Street';

    const printPayload: ReceiptPrintData = {
      invoiceNumber: order.orderCode || `KOT-M${order.tableNumber}`,
      storeName: `${storeName} [DAPUR / BAR]`,
      storeAddress: `TIKET PESANAN DAPUR`,
      date: new Date(order.createdAt).toLocaleString('id-ID', {
        dateStyle: 'short',
        timeStyle: 'medium',
      }),
      items: order.items.map((it) => ({
        productName: it.productName + (it.notes ? ` (${it.notes})` : ''),
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal,
      })),
      subtotal: order.totalAmount,
      grandTotal: order.totalAmount,
      paymentMethod: order.paymentStatus === 'PAID' ? 'LUNAS (QRIS)' : 'BELUM DIBAYAR (KASIR)',
      customerName: order.customerName,
      tableNumber: order.tableNumber,
      cashierName: 'QR Meja',
      footerNotes: order.notes ? `CATATAN: ${order.notes}` : 'Segera siapkan untuk pelanggan',
    };

    try {
      const res = await printReceiptDirectly(printPayload);
      if (res.success) {
        toast.success(`Tiket Dapur Meja ${order.tableNumber} berhasil dicetak!`);
      } else {
        // Fallback: Open printer dialog or standard print
        setPrinterDialogOpen(true);
        toast.info(res.error || 'Silakan sambungkan printer Bluetooth');
      }
    } catch {
      setPrinterDialogOpen(true);
    } finally {
      setPrintingOrderId(null);
    }
  };

  // 6. Action: Delete / Cancel Order
  const confirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/table-orders?id=${encodeURIComponent(orderToDelete.id)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const remaining = orders.filter((o) => o.id !== orderToDelete.id);
        setOrders(remaining);
        try {
          localStorage.setItem('kasirflow_table_orders_cache', JSON.stringify(remaining));
          window.dispatchEvent(new Event('kasirflow:orders-updated'));
        } catch {}
        toast.success(`Pesanan Meja ${orderToDelete.tableNumber} dihapus`);
      } else {
        toast.error('Gagal menghapus pesanan');
      }
    } catch {
      toast.error('Gagal memproses penghapusan pesanan');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    }
  };

  // Counts by status
  const counts = useMemo(() => {
    const c = {
      ALL: orders.length,
      PENDING: 0,
      PREPARING: 0,
      SERVED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    orders.forEach((o) => {
      if (o.status && c[o.status] !== undefined) {
        c[o.status]++;
      }
    });
    return c;
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Status filter
      if (statusFilter !== 'ALL' && o.status !== statusFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTable = o.tableNumber.toLowerCase().includes(q);
        const matchName = (o.customerName || '').toLowerCase().includes(q);
        const matchCode = (o.orderCode || '').toLowerCase().includes(q);
        const matchItem = o.items.some((it) => it.productName.toLowerCase().includes(q));
        if (!matchTable && !matchName && !matchCode && !matchItem) {
          return false;
        }
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  // Relative elapsed time calculator
  const getElapsedTime = (dateString: string) => {
    try {
      const diffSec = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
      if (diffSec < 60) return `${diffSec} dtk lalu`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} mnt lalu`;
      const diffHour = Math.floor(diffMin / 60);
      return `${diffHour} jam lalu`;
    } catch {
      return '';
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <ChefHat className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Antrean Pesanan & Dapur (KDS)
              </h1>
              <p className="text-xs text-muted-foreground">
                Penyimpanan ganda Supabase + LocalStorage · Terpisah rapi dari kasir
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Chime Audio */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) playKitchenChime();
              toast.info(next ? 'Suara lonceng dapur diaktifkan' : 'Suara lonceng dimatikan');
            }}
            className="gap-2 text-xs font-semibold"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="h-4 w-4 text-emerald-500" />
                <span>Audio Aktif</span>
              </>
            ) : (
              <>
                <VolumeX className="h-4 w-4 text-muted-foreground" />
                <span>Audio Bisu</span>
              </>
            )}
          </Button>

          {/* Thermal Printer Modal */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPrinterDialogOpen(true)}
            className="gap-2 text-xs font-semibold"
          >
            <Printer className="h-4 w-4 text-amber-500" />
            <span>Printer Bluetooth</span>
          </Button>

          {/* Manual Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchOrders(true)}
            disabled={refreshing}
            className="gap-2 text-xs font-semibold"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </Button>

          {/* Direct Link to Cashier Register */}
          <Button
            size="sm"
            onClick={() => router.push('/pos')}
            className="gap-2 text-xs font-bold bg-primary text-primary-foreground shadow-sm"
          >
            <ShoppingCart className="h-4 w-4" />
            <span>Buka Kasir</span>
          </Button>
        </div>
      </div>

      {/* Metrics & Filter Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`p-3 rounded-xl border text-left transition ${
            statusFilter === 'ALL'
              ? 'bg-primary/10 border-primary shadow-xs'
              : 'bg-card hover:bg-muted/50 border-border'
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground">Semua Antrean</div>
          <div className="text-2xl font-black mt-1 text-foreground">{counts.ALL}</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('PENDING')}
          className={`p-3 rounded-xl border text-left transition ${
            statusFilter === 'PENDING'
              ? 'bg-amber-500/10 border-amber-500 shadow-xs'
              : 'bg-card hover:bg-muted/50 border-border'
          }`}
        >
          <div className="text-xs font-semibold text-amber-500 flex items-center justify-between">
            <span>Menunggu Kasir</span>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <div className="text-2xl font-black mt-1 text-amber-500">{counts.PENDING}</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('PREPARING')}
          className={`p-3 rounded-xl border text-left transition ${
            statusFilter === 'PREPARING'
              ? 'bg-blue-500/10 border-blue-500 shadow-xs'
              : 'bg-card hover:bg-muted/50 border-border'
          }`}
        >
          <div className="text-xs font-semibold text-blue-500 flex items-center justify-between">
            <span>Sedang Dimasak</span>
            <Flame className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-2xl font-black mt-1 text-blue-500">{counts.PREPARING}</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('SERVED')}
          className={`p-3 rounded-xl border text-left transition ${
            statusFilter === 'SERVED'
              ? 'bg-teal-500/10 border-teal-500 shadow-xs'
              : 'bg-card hover:bg-muted/50 border-border'
          }`}
        >
          <div className="text-xs font-semibold text-teal-500 flex items-center justify-between">
            <span>Siap Saji</span>
            <Utensils className="w-3.5 h-3.5 text-teal-500" />
          </div>
          <div className="text-2xl font-black mt-1 text-teal-500">{counts.SERVED}</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('COMPLETED')}
          className={`p-3 rounded-xl border text-left transition ${
            statusFilter === 'COMPLETED'
              ? 'bg-emerald-500/10 border-emerald-500 shadow-xs'
              : 'bg-card hover:bg-muted/50 border-border'
          }`}
        >
          <div className="text-xs font-semibold text-emerald-500 flex items-center justify-between">
            <span>Selesai</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-2xl font-black mt-1 text-emerald-500">{counts.COMPLETED}</div>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari Meja, Nama, atau Menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 w-full sm:w-auto justify-end">
          <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                viewMode === 'grid'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Tiket Dapur
            </button>
            <button
              type="button"
              onClick={() => setViewMode('columns')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                viewMode === 'columns'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Kolom Kanban
            </button>
          </div>
        </div>
      </div>

      {/* Content Section */}
      {loading ? (
        <div className="p-16 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-sm font-semibold">Memuat antrean pesanan & menyelaraskan data...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center">
          <CardContent className="space-y-4 pt-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
              <ChefHat className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Tidak Ada Antrean yang Cocok</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                {searchQuery || statusFilter !== 'ALL'
                  ? 'Tidak ada pesanan yang sesuai dengan filter pencarian saat ini.'
                  : 'Saat ini belum ada pesanan aktif dari meja pelanggan. Pesanan meja akan otomatis muncul di sini.'}
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter('ALL');
                  setSearchQuery('');
                }}
                className="text-xs"
              >
                Reset Filter
              </Button>
              <Button
                size="sm"
                onClick={() => router.push('/tables')}
                className="text-xs gap-1.5 font-bold"
              >
                <QrCode className="w-3.5 h-3.5" />
                Lihat QR Meja
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW (Kitchen Ticket Style) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const isPending = order.status === 'PENDING';
            const isPreparing = order.status === 'PREPARING';
            const isServed = order.status === 'SERVED';
            const isCompleted = order.status === 'COMPLETED';

            return (
              <Card
                key={order.id}
                className={`flex flex-col border-2 transition shadow-sm hover:shadow-md ${
                  isPending
                    ? 'border-amber-500/50 bg-amber-500/[0.02]'
                    : isPreparing
                    ? 'border-blue-500/50 bg-blue-500/[0.02]'
                    : isServed
                    ? 'border-teal-500/50 bg-teal-500/[0.02]'
                    : 'border-border bg-card opacity-80'
                }`}
              >
                {/* Ticket Header */}
                <CardHeader className="p-4 pb-3 border-b bg-muted/20">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-foreground text-background text-sm font-black tracking-wide">
                          MEJA {order.tableNumber}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-md font-bold ${
                            order.paymentStatus === 'PAID'
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                          }`}
                        >
                          {order.paymentStatus === 'PAID' ? 'Lunas (QRIS)' : 'Belum Bayar'}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">
                          {order.customerName || `Pelanggan Meja ${order.tableNumber}`}
                        </span>
                        <span>·</span>
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span>{getElapsedTime(order.createdAt)}</span>
                      </div>
                    </div>

                    {/* Order Code */}
                    <div className="text-right">
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {order.orderCode || order.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                </CardHeader>

                {/* Ticket Items Body */}
                <CardContent className="p-4 flex-1 space-y-3">
                  <div className="space-y-2">
                    {order.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-3 text-xs border-b border-border/50 pb-2 last:border-0 last:pb-0"
                      >
                        <div className="flex items-start gap-2 flex-1">
                          <span className="font-black text-sm text-foreground bg-muted px-1.5 py-0.5 rounded">
                            {it.quantity}x
                          </span>
                          <div className="flex-1">
                            <p className="font-bold text-foreground text-sm leading-snug">
                              {it.productName}
                            </p>
                            {it.notes && (
                              <p className="text-[11px] text-amber-600 font-semibold italic mt-0.5">
                                Catatan: {it.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="font-mono text-muted-foreground text-xs whitespace-nowrap">
                          {formatCurrency(it.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Customer General Notes */}
                  {order.notes && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-bold">Pesan Tambahan:</span> {order.notes}
                    </div>
                  )}

                  {/* Total & Summary */}
                  <div className="flex items-center justify-between pt-2 border-t text-xs">
                    <span className="text-muted-foreground">Total Pesanan</span>
                    <span className="text-sm font-black text-foreground">
                      {formatCurrency(order.totalAmount)}
                    </span>
                  </div>
                </CardContent>

                {/* Ticket Footer Actions */}
                <div className="p-3 bg-muted/40 border-t space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Pull to Cashier Button */}
                    <Button
                      size="sm"
                      onClick={() => handlePullToCashier(order)}
                      className="gap-1.5 text-xs font-bold bg-primary text-primary-foreground shadow-xs w-full"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Tarik ke Kasir</span>
                    </Button>

                    {/* Print Kitchen Order Ticket Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={printingOrderId === order.id}
                      onClick={() => handlePrintKitchenTicket(order)}
                      className="gap-1.5 text-xs font-bold w-full"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-500" />
                      <span>{printingOrderId === order.id ? 'Mencetak...' : 'Cetak Tiket'}</span>
                    </Button>
                  </div>

                  {/* Status Progression Controls */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
                    <div className="flex items-center gap-1.5 flex-1">
                      {isPending && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleUpdateStatus(order.id, 'PREPARING')}
                          className="w-full text-xs font-bold bg-blue-500/15 text-blue-600 hover:bg-blue-500/25 border border-blue-500/30 gap-1.5"
                        >
                          <Flame className="w-3.5 h-3.5" />
                          <span>Mulai Masak</span>
                        </Button>
                      )}

                      {isPreparing && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleUpdateStatus(order.id, 'SERVED')}
                          className="w-full text-xs font-bold bg-teal-500/15 text-teal-600 hover:bg-teal-500/25 border border-teal-500/30 gap-1.5"
                        >
                          <Utensils className="w-3.5 h-3.5" />
                          <span>Siap Disajikan</span>
                        </Button>
                      )}

                      {isServed && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleUpdateStatus(order.id, 'COMPLETED')}
                          className="w-full text-xs font-bold bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border border-emerald-500/30 gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Selesaikan</span>
                        </Button>
                      )}

                      {isCompleted && (
                        <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 py-1">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Pesanan Telah Selesai</span>
                        </div>
                      )}
                    </div>

                    {/* Delete / Cancel Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOrderToDelete(order);
                        setDeleteDialogOpen(true);
                      }}
                      className="text-muted-foreground hover:text-destructive h-8 px-2"
                      title="Batalkan / Hapus Pesanan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* KANBAN / STATUS COLUMNS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Column 1: Menunggu Kasir */}
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
              <span className="font-bold text-sm text-amber-600">Menunggu Kasir</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-stone-950 font-black text-xs">
                {orders.filter((o) => o.status === 'PENDING').length}
              </span>
            </div>

            <div className="space-y-3">
              {orders
                .filter((o) => o.status === 'PENDING')
                .map((order) => (
                  <Card key={order.id} className="border-amber-500/30 p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="font-black text-xs bg-foreground text-background px-2 py-0.5 rounded">
                        MEJA {order.tableNumber}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {getElapsedTime(order.createdAt)}
                      </span>
                    </div>
                    <div className="text-xs space-y-1">
                      {order.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="font-semibold text-foreground">
                            {it.quantity}x {it.productName}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {formatCurrency(it.subtotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        onClick={() => handlePullToCashier(order)}
                        className="flex-1 text-xs font-bold h-7"
                      >
                        Tarik ke Kasir
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleUpdateStatus(order.id, 'PREPARING')}
                        className="text-xs font-bold h-7"
                      >
                        Masak
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          </div>

          {/* Column 2: Sedang Dimasak */}
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
              <span className="font-bold text-sm text-blue-600">Sedang Dimasak</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500 text-white font-black text-xs">
                {orders.filter((o) => o.status === 'PREPARING').length}
              </span>
            </div>

            <div className="space-y-3">
              {orders
                .filter((o) => o.status === 'PREPARING')
                .map((order) => (
                  <Card key={order.id} className="border-blue-500/30 p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="font-black text-xs bg-foreground text-background px-2 py-0.5 rounded">
                        MEJA {order.tableNumber}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {getElapsedTime(order.createdAt)}
                      </span>
                    </div>
                    <div className="text-xs space-y-1">
                      {order.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="font-semibold text-foreground">
                            {it.quantity}x {it.productName}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleUpdateStatus(order.id, 'SERVED')}
                        className="w-full text-xs font-bold h-7 bg-teal-500/15 text-teal-600 hover:bg-teal-500/25"
                      >
                        Siap Disajikan
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          </div>

          {/* Column 3: Siap Disajikan / Selesai */}
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-between">
              <span className="font-bold text-sm text-teal-600">Siap Saji</span>
              <span className="px-2 py-0.5 rounded-full bg-teal-500 text-white font-black text-xs">
                {orders.filter((o) => o.status === 'SERVED').length}
              </span>
            </div>

            <div className="space-y-3">
              {orders
                .filter((o) => o.status === 'SERVED')
                .map((order) => (
                  <Card key={order.id} className="border-teal-500/30 p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="font-black text-xs bg-foreground text-background px-2 py-0.5 rounded">
                        MEJA {order.tableNumber}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {getElapsedTime(order.createdAt)}
                      </span>
                    </div>
                    <div className="text-xs space-y-1">
                      {order.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="font-semibold text-foreground">
                            {it.quantity}x {it.productName}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        onClick={() => handleUpdateStatus(order.id, 'COMPLETED')}
                        className="w-full text-xs font-bold h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Selesaikan
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete / Cancel Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              <span>Hapus Pesanan dari Antrean?</span>
            </DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus pesanan Meja {orderToDelete?.tableNumber} (
              {orderToDelete?.orderCode})? Tindakan ini akan menghapus antrean dari sistem kasir dan
              dapur.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteOrder}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting ? 'Menghapus...' : 'Ya, Hapus Antrean'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Thermal Printer Settings Dialog */}
      <ThermalPrinterDialog
        open={printerDialogOpen}
        onOpenChange={setPrinterDialogOpen}
        storeName={store?.name}
      />
    </div>
  );
}
