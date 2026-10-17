'use client';

import React, { useState, useEffect } from 'react';
import {
  Printer,
  Bluetooth,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Power,
  FileText,
  Info,
  Smartphone,
  Laptop,
  Check,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  isBluetoothSupported,
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  getPrinterStatus,
  sendEscPosToPrinter,
  buildEscPosReceipt,
  getTestReceiptData,
  type PaperWidth,
  type PrinterDevice,
} from '@/lib/thermal-printer';
import { toast } from 'sonner';

interface ThermalPrinterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName?: string;
}

export function ThermalPrinterDialog({
  open,
  onOpenChange,
  storeName = 'Aldo Coffe Street',
}: ThermalPrinterDialogProps) {
  const [device, setDevice] = useState<PrinterDevice | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [paperWidth, setPaperWidth] = useState<PaperWidth>('58mm');
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(isBluetoothSupported());
    const current = getPrinterStatus();
    setDevice(current);

    if (typeof window !== 'undefined') {
      const savedWidth = localStorage.getItem('kasirflow_paper_width') as PaperWidth;
      if (savedWidth) setPaperWidth(savedWidth);

      const handleStatusChange = () => {
        setDevice(getPrinterStatus());
      };
      window.addEventListener('kasirflow_printer_status_changed', handleStatusChange);
      return () => {
        window.removeEventListener('kasirflow_printer_status_changed', handleStatusChange);
      };
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const info = await connectBluetoothPrinter();
      setDevice(info);
      toast.success(`Printer "${info.name}" berhasil terhubung!`, {
        description: 'Anda sekarang dapat mencetak struk secara instan tanpa biaya langganan.',
      });
    } catch (err: any) {
      if (err?.name === 'NotFoundError') {
        toast.info('Pencarian printer dibatalkan.');
      } else {
        toast.error(err?.message || 'Gagal menyambungkan ke printer Bluetooth.');
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnectBluetoothPrinter();
    setDevice(null);
    toast.info('Koneksi printer thermal diputuskan.');
  };

  const handleTestPrint = async () => {
    if (!device) {
      toast.error('Hubungkan printer Bluetooth terlebih dahulu.');
      return;
    }
    setTesting(true);
    try {
      const testData = getTestReceiptData(storeName);
      const bytes = buildEscPosReceipt(testData, paperWidth);
      await sendEscPosToPrinter(bytes);
      toast.success('Struk uji coba berhasil dicetak!');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengirim perintah cetak ke printer.');
    } finally {
      setTesting(false);
    }
  };

  const handlePaperWidthChange = (width: PaperWidth) => {
    setPaperWidth(width);
    if (typeof window !== 'undefined') {
      localStorage.setItem('kasirflow_paper_width', width);
    }
    toast.info(`Lebar kertas diatur ke ${width}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="p-5 pb-4 border-b border-border/50 bg-neutral-50/70 dark:bg-neutral-800/40">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Printer className="h-4 w-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Hardware Kasir
              </span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              100% Bebas Langganan
            </span>
          </div>
          <DialogTitle className="text-base font-bold text-foreground">
            Printer Thermal Bluetooth &amp; USB
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Cetak struk kasir langsung ke printer thermal portabel 58mm atau 80mm tanpa driver berbayar.
          </DialogDescription>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Status Box */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              device?.connected
                ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300/80 dark:border-emerald-800/60'
                : 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200 dark:border-neutral-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                  device?.connected
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-muted-foreground'
                }`}
              >
                <Bluetooth className="h-5 w-5" />
              </div>
              <div>
                <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <span>{device?.connected ? device.name : 'Belum Ada Printer Terhubung'}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {device?.connected
                    ? 'Siap mencetak transaksi kasir secara instan'
                    : 'Aktifkan Bluetooth lalu tekan tombol Hubungkan'}
                </div>
              </div>
            </div>

            {device?.connected ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="h-8 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
              >
                Putuskan
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleConnect}
                disabled={connecting}
                className="h-8 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
              >
                {connecting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Mencari...
                  </>
                ) : (
                  <>
                    <Bluetooth className="mr-1.5 h-3.5 w-3.5" />
                    Hubungkan
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Paper Width Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
              Ukuran Kertas Thermal
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handlePaperWidthChange('58mm')}
                className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between cursor-pointer ${
                  paperWidth === '58mm'
                    ? 'border-amber-600 bg-amber-500/10 text-amber-950 dark:text-amber-100 font-bold'
                    : 'border-border bg-muted/40 hover:bg-muted text-muted-foreground'
                }`}
              >
                <div>
                  <div className="text-xs">58mm (Standar)</div>
                  <div className="text-[10px] text-muted-foreground font-normal">
                    Printer Bluetooth Mini / Kasir Saku
                  </div>
                </div>
                {paperWidth === '58mm' && <Check className="h-4 w-4 text-amber-600 shrink-0" />}
              </button>

              <button
                type="button"
                onClick={() => handlePaperWidthChange('80mm')}
                className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between cursor-pointer ${
                  paperWidth === '80mm'
                    ? 'border-amber-600 bg-amber-500/10 text-amber-950 dark:text-amber-100 font-bold'
                    : 'border-border bg-muted/40 hover:bg-muted text-muted-foreground'
                }`}
              >
                <div>
                  <div className="text-xs">80mm (Lebar)</div>
                  <div className="text-[10px] text-muted-foreground font-normal">
                    Printer Desktop / Auto-Cutter
                  </div>
                </div>
                {paperWidth === '80mm' && <Check className="h-4 w-4 text-amber-600 shrink-0" />}
              </button>
            </div>
          </div>

          {/* Test Print Action */}
          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestPrint}
              disabled={testing || !device?.connected}
              className="w-full h-9 text-xs font-semibold gap-2 border-primary/30 text-primary hover:bg-primary/5"
            >
              {testing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Mengirim data ke printer...
                </>
              ) : (
                <>
                  <FileText className="h-3.5 w-3.5" />
                  Cetak Struk Uji Coba (Test Print)
                </>
              )}
            </Button>
          </div>

          {/* Hardware Tips */}
          <div className="rounded-xl bg-muted/50 border border-neutral-200/60 dark:border-neutral-800 p-3 space-y-1.5 text-[11px] text-muted-foreground">
            <div className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
              <Info className="h-3.5 w-3.5 text-amber-600" />
              Petunjuk Printer Thermal Bluetooth:
            </div>
            <ul className="list-disc pl-4 space-y-1">
              <li>Nyalakan printer thermal dan pastikan lampu indikator Bluetooth berkedip/menyala.</li>
              <li>Dukung semua merek printer 58mm/80mm (RPP02N, Panda, Iware, VSC, MPT-II, Epson, dll).</li>
              <li>Jalankan di browser Google Chrome atau Edge (di Laptop, Tablet, atau HP Android).</li>
              <li>Tidak perlu instal aplikasi pihak ketiga berbayar (RawBT Pro, ESC POS Server, dll).</li>
            </ul>
          </div>
        </div>

        <div className="p-4 border-t border-border/50 bg-neutral-50/60 dark:bg-neutral-800/30 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="px-4 text-xs">
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
