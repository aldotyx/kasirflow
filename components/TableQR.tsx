'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import {
  QrCode,
  Printer,
  Copy,
  Check,
  Plus,
  Minus,
  ExternalLink,
  ChefHat,
  Utensils,
  CheckCircle2,
  Clock,
  Bell,
  Globe,
  ShoppingBag,
  Wallet,
  Building2,
  DollarSign,
} from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';
import { playNotificationChime, speakText } from '@/lib/voice-service';
import { toast } from 'sonner';

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
  storeId: string;
  storeName: string;
  tableNumber: string;
  customerName?: string;
  items: TableOrderItem[];
  totalAmount: number;
  status: 'PENDING' | 'PREPARING' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
  paymentStatus: 'UNPAID' | 'PAID' | 'UNPAID_CASH';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export default function TableQR() {
  const { store } = useAuth();
  const [tableCount, setTableCount] = useState(8);

  // Bind strictly to the active branch (Multi-Cabang Isolation)
  const storeId = store?.id || '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';
  const storeName = store?.name || 'Aldo Coffe Street';
  const storeSlug =
    store?.slug ||
    (store?.name || 'Aldo Coffe Street').toLowerCase().replace(/[^a-z0-9]/g, '') ||
    'aldocoffestreet';

  // Dynamic Base URL detection
  const [originUrl, setOriginUrl] = useState('');
  const [copiedTable, setCopiedTable] = useState<string | null>(null);

  // Realtime Orders
  const [tableOrders, setTableOrders] = useState<TableOrder[]>([]);
  const [lastOrderCount, setLastOrderCount] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<TableOrder | null>(null);
  const [printingOrder, setPrintingOrder] = useState<TableOrder | null>(null);

  // Track known paid order IDs to prevent duplicate voice speech
  const knownPaidOrdersRef = useRef<Set<string>>(new Set());
  const initialFetchDoneRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOriginUrl(window.location.origin);
    }
  }, []);

  const activeBaseUrl = originUrl || 'https://kasirflow.store';

  // Fetch table orders strictly filtered by current active branch storeId
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/table-orders?storeId=${encodeURIComponent(storeId)}`);
      if (res.ok) {
        const data = await res.json();
        const orders: TableOrder[] = data.orders || [];

        // 1. Check for incoming new pending orders
        const pendingOrders = orders.filter((o) => o.status === 'PENDING');
        if (pendingOrders.length > lastOrderCount && lastOrderCount !== 0) {
          const newest = pendingOrders[0];
          playNotificationChime(0.7);
          speakText(`Pesanan baru masuk dari Meja ${newest.tableNumber}`);
          toast.success(`Pesanan baru masuk dari Meja ${newest.tableNumber}!`, {
            description: `${newest.customerName} memesan ${newest.items.length} menu`,
          });
        }
        setLastOrderCount(pendingOrders.length);

        // 2. Check for newly PAID orders (from customer QRIS or cashier confirmation)
        if (initialFetchDoneRef.current) {
          for (const ord of orders) {
            if (ord.paymentStatus === 'PAID' && !knownPaidOrdersRef.current.has(ord.id)) {
              knownPaidOrdersRef.current.add(ord.id);

              // Voice announcement: "Makasih kak pembayaran [nominal] rupiah sukses diterima"
              playNotificationChime(0.8);
              speakText(`Makasih kak pembayaran ${ord.totalAmount} rupiah sukses diterima`);
              toast.success(`Pembayaran Meja ${ord.tableNumber} LUNAS!`, {
                description: `Rp ${ord.totalAmount.toLocaleString('id-ID')} berhasil diterima. Mencetak tiket...`,
              });

              // Trigger 58mm thermal ticket print
              setPrintingOrder(ord);
              setTimeout(() => {
                window.print();
              }, 400);
            }
          }
        } else {
          // Initialize known paid orders on first fetch
          orders.forEach((o) => {
            if (o.paymentStatus === 'PAID') {
              knownPaidOrdersRef.current.add(o.id);
            }
          });
          initialFetchDoneRef.current = true;
        }

        setTableOrders(orders);
      }
    } catch {
      // ignore
    }
  }, [storeId, lastOrderCount]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 3500);

    // Supabase Realtime listener
    const channel = supabase
      .channel(`table_orders_realtime_${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_orders' },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, storeId]);

  const updateOrderStatus = async (
    orderId: string,
    newStatus?: TableOrder['status'],
    newPaymentStatus?: TableOrder['paymentStatus']
  ) => {
    try {
      const payload: any = { orderId };
      if (newStatus) payload.status = newStatus;
      if (newPaymentStatus) payload.paymentStatus = newPaymentStatus;

      const res = await fetch('/api/table-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (newPaymentStatus === 'PAID') {
          toast.success('Pembayaran berhasil ditandai LUNAS!');
        } else if (newStatus) {
          toast.success(`Status pesanan diperbarui menjadi ${newStatus}`);
        }
        fetchOrders();
        if (selectedOrder?.id === orderId) {
          setSelectedOrder((prev) =>
            prev
              ? {
                  ...prev,
                  ...(newStatus ? { status: newStatus } : {}),
                  ...(newPaymentStatus ? { paymentStatus: newPaymentStatus } : {}),
                }
              : null
          );
        }
      }
    } catch {
      toast.error('Gagal memperbarui status pesanan');
    }
  };

  const handleManualPrint = (order: TableOrder) => {
    setPrintingOrder(order);
    setTimeout(() => {
      window.print();
    }, 250);
  };

  const copyUrl = (num: string) => {
    const targetUrl = `${activeBaseUrl}/m/${storeSlug}/${num}`;
    navigator.clipboard.writeText(targetUrl);
    setCopiedTable(num);
    toast.success(`Tautan Meja ${num} disalin ke clipboard!`);
    setTimeout(() => setCopiedTable(null), 2000);
  };

  // Map active orders per table
  const ordersByTable = tableOrders.reduce((acc, order) => {
    if (order.status !== 'COMPLETED' && order.status !== 'CANCELLED') {
      acc[order.tableNumber] = order;
    }
    return acc;
  }, {} as Record<string, TableOrder>);

  const activePendingOrders = tableOrders.filter((o) => o.status === 'PENDING');
  const cashPendingOrders = tableOrders.filter((o) => o.paymentStatus === 'UNPAID_CASH');

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Control */}
      <div className="no-print bg-white dark:bg-card p-6 rounded-3xl border border-stone-200 dark:border-border shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Cabang: {storeName}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-stone-900 dark:text-foreground flex items-center gap-2 mt-1">
              <QrCode className="w-7 h-7 text-amber-600" /> Meja &amp; Barcode QR Self-Ordering
            </h1>
            <p className="text-xs text-stone-500 dark:text-muted-foreground mt-0.5">
              Pelanggan scan barcode di meja, pesan menu di HP, dan pesanan masuk ke kasir cabang ini secara realtime.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center bg-stone-100 dark:bg-muted rounded-xl p-1 border border-stone-200 dark:border-border">
              <button
                onClick={() => setTableCount(Math.max(1, tableCount - 1))}
                className="p-2 hover:bg-white dark:hover:bg-card rounded-lg transition-colors cursor-pointer"
                title="Kurang meja"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="px-3 font-bold text-sm select-none">{tableCount} Meja</span>
              <button
                onClick={() => setTableCount(tableCount + 1)}
                className="p-2 hover:bg-white dark:hover:bg-card rounded-lg transition-colors cursor-pointer"
                title="Tambah meja"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => {
                if (tableOrders.length > 0) {
                  handleManualPrint(tableOrders[0]);
                } else {
                  window.print();
                }
              }}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Cetak Tiket Thermal 58mm
            </button>
          </div>
        </div>

        {/* Live URL Configuration Card */}
        <div className="bg-amber-50/70 dark:bg-muted/40 rounded-2xl p-4 border border-amber-200/80 dark:border-border space-y-2.5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-700 dark:text-amber-500" />
              <span className="text-xs font-bold text-stone-800 dark:text-foreground">
                Domain Barcode Cabang Ini:
              </span>
              <code className="text-[11px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 px-2.5 py-0.5 rounded-lg text-amber-900 dark:text-amber-400 font-mono">
                {activeBaseUrl}/m/{storeSlug}/[meja]
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                Realtime Branch Sync Aktif
              </span>
            </div>
          </div>

          <div className="text-[11px] text-stone-500 flex flex-wrap items-center gap-2">
            <span>Tautan barcode meja terisolasi untuk cabang <strong>{storeName}</strong>.</span>
            <a
              href={`${activeBaseUrl}/m/${storeSlug}/01`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold hover:underline"
            >
              Tes Buka Meja 01 <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Cash Payment Alert Banner */}
      {cashPendingOrders.length > 0 && (
        <div className="no-print bg-amber-500 text-stone-950 p-4 rounded-2xl shadow-md flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-stone-950 text-amber-400 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm">
                Ada {cashPendingOrders.length} Pesanan Menunggu Pembayaran Tunai di Kasir!
              </h3>
              <p className="text-xs font-medium text-stone-900">
                Meja {cashPendingOrders.map((o) => o.tableNumber).join(', ')} telah memilih bayar tunai di kasir.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedOrder(cashPendingOrders[0])}
            className="px-4 py-2 bg-stone-950 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition cursor-pointer"
          >
            Konfirmasi Terima Tunai
          </button>
        </div>
      )}

      {/* Grid of Tables & QR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {Array.from({ length: tableCount }, (_, i) => {
          const num = (i + 1).toString().padStart(2, '0');
          const targetUrl = `${activeBaseUrl}/m/${storeSlug}/${num}`;
          const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
            targetUrl
          )}`;
          const currentOrder = ordersByTable[num];

          return (
            <div
              key={num}
              className={`bg-white dark:bg-card p-5 rounded-2xl border-2 transition-all space-y-3 relative ${
                currentOrder
                  ? currentOrder.paymentStatus === 'UNPAID_CASH'
                    ? 'border-amber-500 shadow-md ring-2 ring-amber-500/30'
                    : currentOrder.paymentStatus === 'PAID'
                    ? 'border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                    : 'border-amber-400 shadow-sm'
                  : 'border-stone-200 dark:border-border shadow-sm hover:shadow-md'
              }`}
            >
              {/* Status Badge */}
              <div className="no-print flex items-center justify-between gap-1 text-[11px]">
                {currentOrder ? (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full font-bold bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      {currentOrder.status === 'PENDING'
                        ? 'Pesanan Masuk'
                        : currentOrder.status === 'PREPARING'
                        ? 'Diracik'
                        : 'Disajikan'}
                    </span>
                    {/* Payment Status Badge */}
                    {currentOrder.paymentStatus === 'PAID' ? (
                      <span className="px-2 py-0.5 rounded-full font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-0.5 text-[10px]">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> LUNAS
                      </span>
                    ) : currentOrder.paymentStatus === 'UNPAID_CASH' ? (
                      <span className="px-2 py-0.5 rounded-full font-extrabold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5 text-[10px] animate-pulse">
                        <Wallet className="w-3 h-3 text-amber-700" /> Menunggu Kasir
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full font-bold bg-stone-100 text-stone-500 text-[10px]">
                        Belum Bayar
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Meja Tersedia
                  </span>
                )}

                <button
                  onClick={() => copyUrl(num)}
                  className="p-1 hover:bg-stone-100 dark:hover:bg-muted rounded-md text-stone-500 transition cursor-pointer"
                  title="Salin Link Meja"
                >
                  {copiedTable === num ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="text-xs font-extrabold uppercase text-amber-800 dark:text-amber-500 tracking-wider text-center">
                {storeName}
              </div>

              {/* QR Image Container */}
              <div className="p-2 bg-stone-50 dark:bg-muted rounded-xl border border-dashed border-stone-300 dark:border-border w-44 h-44 mx-auto flex items-center justify-center">
                <img
                  src={qrImg}
                  alt={`Meja ${num}`}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </div>

              <div className="text-center space-y-1">
                <div className="inline-block px-4 py-1 bg-stone-900 text-white font-black text-sm rounded-full">
                  MEJA {num}
                </div>
                <p className="text-[10px] text-stone-400 dark:text-muted-foreground">
                  Scan untuk pesan langsung ke bar
                </p>
              </div>

              {/* Order Info & Action buttons (no-print) */}
              <div className="no-print pt-2 border-t border-stone-100 dark:border-border space-y-2">
                {currentOrder ? (
                  <div className="bg-stone-50 dark:bg-muted/50 p-2.5 rounded-xl text-left space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="truncate">{currentOrder.customerName}</span>
                      <span className="text-amber-700 font-extrabold">
                        {formatCurrency(currentOrder.totalAmount)}
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-500 truncate">
                      {currentOrder.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                    </div>
                    <button
                      onClick={() => setSelectedOrder(currentOrder)}
                      className="w-full mt-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] transition cursor-pointer"
                    >
                      Buka Rincian &amp; Kasir
                    </button>
                  </div>
                ) : (
                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-muted dark:hover:bg-muted/80 text-stone-700 dark:text-stone-300 rounded-lg font-semibold text-[11px] flex items-center justify-center gap-1 transition"
                  >
                    Buka Menu Meja Ini <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Order Detail & Cashier Modal */}
      {selectedOrder && (
        <div className="no-print fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-card rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 dark:border-border space-y-4 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-stone-100 dark:border-border pb-3">
              <div>
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest">
                  {selectedOrder.id}
                </span>
                <h3 className="text-lg font-extrabold text-stone-900 dark:text-foreground">
                  Pesanan Meja {selectedOrder.tableNumber}
                </h3>
                <p className="text-xs text-stone-500">
                  Pemesan: <span className="font-bold text-stone-800 dark:text-foreground">{selectedOrder.customerName}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-full cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Payment Status Banner */}
            {selectedOrder.paymentStatus === 'PAID' ? (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between text-xs text-emerald-900 font-bold">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Pembayaran LUNAS
                </span>
                <button
                  onClick={() => handleManualPrint(selectedOrder)}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1"
                >
                  <Printer className="w-3 h-3" /> Cetak Tiket
                </button>
              </div>
            ) : selectedOrder.paymentStatus === 'UNPAID_CASH' ? (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-amber-950">
                  <Wallet className="w-4 h-4 text-amber-600" />
                  Menunggu Pembayaran Tunai di Kasir
                </div>
                <p className="text-[11px] text-amber-800">
                  Pelanggan memilih bayar tunai di meja kasir. Terima uang sejumlah <strong>{formatCurrency(selectedOrder.totalAmount)}</strong> lalu konfirmasi di bawah:
                </p>
                <button
                  onClick={() => updateOrderStatus(selectedOrder.id, undefined, 'PAID')}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow"
                >
                  <CheckCircle2 className="w-4 h-4" /> Konfirmasi Terima Tunai (Tandai Lunas)
                </button>
              </div>
            ) : (
              <div className="p-3 bg-stone-100 rounded-2xl flex items-center justify-between text-xs text-stone-700">
                <span>Status Pembayaran: <strong>Belum Bayar</strong></span>
                <button
                  onClick={() => updateOrderStatus(selectedOrder.id, undefined, 'PAID')}
                  className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold"
                >
                  Tandai Lunas
                </button>
              </div>
            )}

            {/* Items */}
            <div className="max-h-52 overflow-y-auto divide-y divide-stone-100 dark:divide-border text-xs">
              {selectedOrder.items.map((it, idx) => (
                <div key={idx} className="py-2.5 flex justify-between items-start">
                  <div>
                    <div className="font-bold text-stone-900 dark:text-foreground">
                      {it.quantity}x {it.productName}
                    </div>
                    {it.notes && (
                      <div className="text-[11px] text-amber-700 italic mt-0.5">
                        Catatan: &ldquo;{it.notes}&rdquo;
                      </div>
                    )}
                  </div>
                  <span className="font-bold">{formatCurrency(it.subtotal)}</span>
                </div>
              ))}
            </div>

            {selectedOrder.notes && (
              <div className="bg-amber-50 dark:bg-muted p-2.5 rounded-xl text-xs text-amber-900 dark:text-amber-200">
                <span className="font-bold">Catatan Meja:</span> {selectedOrder.notes}
              </div>
            )}

            <div className="flex justify-between items-center text-sm font-bold pt-2 border-t border-stone-100 dark:border-border">
              <span>Total Tagihan Meja:</span>
              <span className="text-amber-600 font-black text-base">
                {formatCurrency(selectedOrder.totalAmount)}
              </span>
            </div>

            {/* Status change actions */}
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => updateOrderStatus(selectedOrder.id, 'PREPARING')}
                  className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    selectedOrder.status === 'PREPARING'
                      ? 'bg-amber-600 text-white'
                      : 'bg-stone-100 dark:bg-muted hover:bg-stone-200'
                  }`}
                >
                  <ChefHat className="w-3.5 h-3.5" /> Sedang Diracik
                </button>
                <button
                  onClick={() => updateOrderStatus(selectedOrder.id, 'SERVED')}
                  className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    selectedOrder.status === 'SERVED'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-stone-100 dark:bg-muted hover:bg-stone-200'
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5" /> Sudah Diantar
                </button>
              </div>

              <button
                onClick={() => {
                  handleManualPrint(selectedOrder);
                }}
                className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition"
              >
                <Printer className="w-4 h-4" /> Cetak Tiket Thermal 58mm
              </button>

              <button
                onClick={() => {
                  updateOrderStatus(selectedOrder.id, 'COMPLETED');
                  setSelectedOrder(null);
                }}
                className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Selesai &amp; Kosongkan Meja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable 58mm POS thermal ticket (Rendered only during print) */}
      <div className="print-only hidden">
        {printingOrder && (
          <div className="thermal-ticket-container">
            <div className="text-center font-bold text-sm uppercase">{storeName}</div>
            <div className="text-center text-[10px]">{store?.address || 'Klangkapan 2'}</div>
            <div className="text-center text-[10px]">Telp: {store?.phone || '0895423491442'}</div>
            <div className="border-b border-dashed my-1"></div>

            <div className="flex justify-between text-[11px]">
              <span>MEJA: {printingOrder.tableNumber}</span>
              <span>{new Date(printingOrder.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="text-[10px] truncate">Pelanggan: {printingOrder.customerName}</div>
            <div className="text-[9px] text-gray-500">ID: {printingOrder.id}</div>
            <div className="border-b border-dashed my-1"></div>

            <div className="space-y-1 text-[10px]">
              {printingOrder.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{it.quantity}x {it.productName}</span>
                  <span>{it.subtotal.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
            <div className="border-b border-dashed my-1"></div>

            <div className="flex justify-between font-bold text-xs">
              <span>TOTAL</span>
              <span>Rp {printingOrder.totalAmount.toLocaleString('id-ID')}</span>
            </div>
            <div className="text-center text-[10px] font-bold mt-1">
              STATUS: {printingOrder.paymentStatus === 'PAID' ? 'LUNAS' : 'BELUM LUNAS'}
            </div>
            <div className="border-b border-dashed my-1"></div>
            <div className="text-center text-[9px] mt-2">
              Terima kasih atas pesanan Anda!<br />
              Powered by KasirFlow
            </div>
          </div>
        )}
      </div>

      {/* Print Styles for 58mm POS thermal printer */}
      <style>{`
        @media print {
          @page {
            size: 58mm auto;
            margin: 0;
          }
          body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print, header, aside, nav {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .thermal-ticket-container {
            width: 48mm !important;
            margin: 0 auto !important;
            padding: 2mm !important;
            font-family: monospace;
            font-size: 10px;
            color: black !important;
            line-height: 1.2;
          }
        }
      `}</style>
    </div>
  );
}
