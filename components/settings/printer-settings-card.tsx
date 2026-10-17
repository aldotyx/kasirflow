'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Printer,
  Bluetooth,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Power,
  FileText,
  Sparkles,
  ShieldCheck,
  Smartphone,
  Laptop,
} from 'lucide-react';
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

export function PrinterSettingsCard({ storeName = 'Aldo Coffe Street' }: { storeName?: string }) {
  const [device, setDevice] = useState<PrinterDevice | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [paperWidth, setPaperWidth] = useState<PaperWidth>('58mm');
  const [footerNotes, setFooterNotes] = useState('Password WiFi: aldocoffe2026');
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(isBluetoothSupported());
    setDevice(getPrinterStatus());

    if (typeof window !== 'undefined') {
      const savedWidth = localStorage.getItem('kasirflow_paper_width') as PaperWidth;
      if (savedWidth) setPaperWidth(savedWidth);

      const savedFooter = localStorage.getItem('kasirflow_receipt_footer');
      if (savedFooter) setFooterNotes(savedFooter);

      const handleStatus = () => setDevice(getPrinterStatus());
      window.addEventListener('kasirflow_printer_status_changed', handleStatus);
      return () => window.removeEventListener('kasirflow_printer_status_changed', handleStatus);
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const info = await connectBluetoothPrinter();
      setDevice(info);
      toast.success(`Printer "${info.name}" berhasil terhubung!`, {
        description: 'Anda dapat mencetak struk thermal secara langsung tanpa langganan.',
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

  const handleSaveWidth = (width: PaperWidth) => {
    setPaperWidth(width);
    if (typeof window !== 'undefined') {
      localStorage.setItem('kasirflow_paper_width', width);
      toast.success(`Ukuran kertas diatur ke ${width}`);
    }
  };

  const handleSaveFooter = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('kasirflow_receipt_footer', footerNotes);
      toast.success('Catatan kaki struk berhasil disimpan!');
    }
  };

  const handleTestPrint = async () => {
    if (!device) {
      toast.error('Printer belum terhubung.', {
        description: 'Silakan klik "Koneksikan Printer Bluetooth" terlebih dahulu.',
      });
      return;
    }

    setTesting(true);
    try {
      const testData = getTestReceiptData(storeName);
      testData.footerNotes = footerNotes;
      const bytes = buildEscPosReceipt(testData, paperWidth);
      await sendEscPosToPrinter(bytes);
      toast.success('Uji coba cetak berhasil dikirim ke printer!');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengirim perintah cetak ke printer.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border-amber-500/20 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Printer Thermal Bluetooth &amp; Struk</CardTitle>
              <CardDescription>
                Cetak struk fisik 58mm / 80mm via Bluetooth atau USB tanpa biaya langganan bulanan (Rp 0).
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={device ? 'default' : 'outline'}
            className={
              device
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5'
                : 'text-muted-foreground gap-1.5'
            }
          >
            {device ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                <span>Terhubung: {device.name}</span>
              </>
            ) : (
              <>
                <Bluetooth className="h-3.5 w-3.5" />
                <span>Belum Terhubung</span>
              </>
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Connection Box */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-sm">Status Sambungan Bluetooth ESC/POS</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mendukung printer thermal portabel RPP02N, Panda, Iware, VSC, MPT-II, dll.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {device ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestPrint}
                    disabled={testing}
                    className="h-9 text-xs font-bold gap-1.5 border-amber-500/40 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-300"
                  >
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    Test Print Struk
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnect}
                    className="h-9 text-xs text-destructive hover:bg-destructive/10 gap-1.5 font-semibold"
                  >
                    <Power className="h-3.5 w-3.5" />
                    Putuskan
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting || !supported}
                  className="h-9 text-xs font-bold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                >
                  {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bluetooth className="h-3.5 w-3.5" />}
                  Koneksikan Printer Bluetooth
                </Button>
              )}
            </div>
          </div>

          {!supported && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Browser ini tidak mengizinkan Web Bluetooth API. Gunakan <strong>Google Chrome</strong> atau <strong>Microsoft Edge</strong> pada Android atau PC untuk koneksi langsung. Untuk printer USB desktop, Anda tetap bisa mencetak dengan dialog cetak standar.
              </span>
            </div>
          )}
        </div>

        {/* Paper Width Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
            Ukuran Kertas Thermal Printer
          </label>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <button
              type="button"
              onClick={() => handleSaveWidth('58mm')}
              className={`p-3 rounded-xl border text-left transition-all ${
                paperWidth === '58mm'
                  ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100 ring-2 ring-amber-500/30 font-bold'
                  : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold">58 mm (32 Kolom)</span>
                {paperWidth === '58mm' && <CheckCircle2 className="h-4 w-4 text-amber-600" />}
              </div>
              <p className="text-[11px] font-normal text-muted-foreground">
                Ukuran standar printer Bluetooth portabel saku / kasir kafe kecil.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleSaveWidth('80mm')}
              className={`p-3 rounded-xl border text-left transition-all ${
                paperWidth === '80mm'
                  ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100 ring-2 ring-amber-500/30 font-bold'
                  : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold">80 mm (48 Kolom)</span>
                {paperWidth === '80mm' && <CheckCircle2 className="h-4 w-4 text-amber-600" />}
              </div>
              <p className="text-[11px] font-normal text-muted-foreground">
                Ukuran printer thermal desktop meja kasir besar / restoran.
              </p>
            </button>
          </div>
        </div>

        {/* Receipt Footer Notes */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
            Catatan Kaki Struk (Footer Message)
          </label>
          <div className="flex gap-2 max-w-lg">
            <Input
              value={footerNotes}
              onChange={(e) => setFooterNotes(e.target.value)}
              placeholder="Contoh: Password WiFi: aldocoffe2026 atau Terima kasih atas kunjungan Anda"
              className="text-sm"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveFooter}
              className="shrink-0 text-xs font-bold"
            >
              Simpan
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Teks ini akan otomatis dicetak di bagian paling bawah setiap struk fisik dan pesan WhatsApp pelanggan.
          </p>
        </div>

        {/* Zero-Subscription Info */}
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">100% Bebas Biaya Langganan (Rp 0)</p>
            <p className="leading-relaxed">
              KasirFlow menggunakan standar transmisi ESC/POS murni via Web Bluetooth API. Anda tidak perlu membayar lisensi aplikasi pihak ketiga (seperti RawBT License atau Cloud Print Service). Cukup aktifkan Bluetooth perangkat dan langsung cetak.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
