'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Clock, QrCode, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';
import { playNotificationChime, speakText } from '@/lib/voice-service';
import { toast } from 'sonner';

interface PakasirQrisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  amount: number;
  title?: string;
  description?: string;
  onPaymentSuccess: () => void;
}

export function PakasirQrisDialog({
  open,
  onOpenChange,
  orderId,
  amount,
  title = 'Pembayaran QRIS Dinamis',
  description = 'Scan QRIS menggunakan BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, atau ShopeePay.',
  onPaymentSuccess,
}: PakasirQrisDialogProps) {
  const [loading, setLoading] = useState(false);
  const [qrisData, setQrisData] = useState<any>(null);
  const [status, setStatus] = useState<'pending' | 'completed' | 'expired'>('pending');
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes
  const [simulating, setSimulating] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch QRIS on open
  useEffect(() => {
    if (!open || !orderId || amount <= 0) {
      setQrisData(null);
      setStatus('pending');
      return;
    }

    let isMounted = true;

    async function initQris() {
      setLoading(true);
      try {
        const res = await fetch('/api/payments/pakasir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Gagal membuat QRIS');
        }

        const data = await res.json();
        if (isMounted && data.transaction) {
          setQrisData(data.transaction);
          setStatus('pending');
          setTimeLeft(900);
        }
      } catch (err: any) {
        toast.error(err.message || 'Gagal memuat QRIS Pakasir');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initQris();

    return () => {
      isMounted = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [open, orderId, amount]);

  // 2. Poll transaction status
  useEffect(() => {
    if (!open || !qrisData?.txn_id || status === 'completed') {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/pakasir?txnId=${encodeURIComponent(qrisData.txn_id)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status?.status === 'completed') {
            setStatus('completed');
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            playNotificationChime(0.8);
            speakText(`Pembayaran QRIS sebesar ${formatCurrency(amount)} rupiah berhasil diterima.`);
            toast.success('Pembayaran QRIS Berhasil Diterima!');
            setTimeout(() => {
              onPaymentSuccess();
              onOpenChange(false);
            }, 1800);
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [open, qrisData?.txn_id, status, amount, onPaymentSuccess, onOpenChange]);

  // 3. Countdown timer
  useEffect(() => {
    if (!open || status === 'completed' || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [open, status, timeLeft]);

  // Sandbox simulation trigger
  const handleSimulatePayment = async () => {
    setSimulating(true);
    try {
      const res = await fetch('/api/payments/pakasir/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount }),
      });

      if (!res.ok) {
        throw new Error('Gagal melakukan simulasi pembayaran');
      }

      toast.info('Simulasi pembayaran terkirim! Memverifikasi status...');
    } catch (err: any) {
      toast.error(err.message || 'Gagal simulasi');
    } finally {
      setSimulating(false);
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md p-6 rounded-3xl">
        <DialogHeader className="text-center space-y-1.5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 mb-1">
            <QrCode className="h-6 w-6" />
          </div>
          <DialogTitle className="text-xl font-black">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-xs font-semibold text-muted-foreground">Menghubungkan ke Pakasir Gateway...</p>
          </div>
        ) : status === 'completed' ? (
          <div className="py-10 text-center space-y-4">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div>
              <h3 className="text-xl font-black text-emerald-600">Pembayaran Berhasil!</h3>
              <p className="text-sm font-semibold text-stone-700 dark:text-stone-300 mt-1">
                Total {formatCurrency(qrisData?.total_payment || amount)} LUNAS
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Memproses dan mencetak transaksi...</p>
            </div>
          </div>
        ) : qrisData ? (
          <div className="space-y-4 py-2">
            {/* Amount card */}
            <div className="bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-3.5 text-center space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Tagihan QRIS
              </span>
              <div className="text-2xl font-black text-stone-950 dark:text-white">
                {formatCurrency(qrisData.total_payment || amount)}
              </div>
              {qrisData.fee > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  (Termasuk biaya layanan PG: {formatCurrency(qrisData.fee)})
                </p>
              )}
            </div>

            {/* QR Code Container */}
            <div className="relative mx-auto bg-white p-4 rounded-2xl border-2 border-stone-900 shadow-md w-60 h-60 flex flex-col items-center justify-center">
              {qrisData.qr_data_url ? (
                <img
                  src={qrisData.qr_data_url}
                  alt="QRIS Pakasir"
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                    qrisData.qr_string || 'QRIS'
                  )}`}
                  alt="QRIS Pakasir"
                  className="w-full h-full object-contain"
                />
              )}

              {/* Supported payment badges in footer */}
              <div className="absolute -bottom-3 bg-stone-950 text-white px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow">
                QRIS NASIONAL
              </div>
            </div>

            {/* Timer and status indicator */}
            <div className="flex items-center justify-between text-xs px-2 pt-1">
              <span className="flex items-center gap-1.5 text-stone-500">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Kedaluwarsa: <strong className="font-mono text-stone-900 dark:text-stone-100">{timeFormatted}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold">
                <RefreshCw className="h-3 w-3 animate-spin" /> Menunggu Pembayaran...
              </span>
            </div>

            {/* Sandbox Simulation Helper */}
            {qrisData.is_sandbox && (
              <div className="pt-2 border-t border-dashed">
                <Button
                  type="button"
                  onClick={handleSimulatePayment}
                  disabled={simulating}
                  variant="outline"
                  className="w-full h-9 rounded-xl text-xs font-bold border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 gap-1.5 cursor-pointer"
                >
                  {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
                  ⚡ Tes Pembayaran Sukses (Sandbox Mode)
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground space-y-2">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm">Gagal menghubungkan QRIS</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
