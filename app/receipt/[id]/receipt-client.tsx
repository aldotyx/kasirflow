'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/calculations';
import {
  Printer,
  ArrowLeft,
  Loader2,
  Volume2,
  Bluetooth,
  Share2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { speakPaymentSuccess } from '@/lib/voice-service';
import {
  connectBluetoothPrinter,
  sendEscPosToPrinter,
  buildEscPosReceipt,
  shareReceiptViaWhatsApp,
  getPrinterStatus,
  type ReceiptPrintData,
  type PaperWidth,
} from '@/lib/thermal-printer';
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
  store_id: string;
};

type Item = {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type StoreInfo = {
  name: string;
  address: string | null;
  phone: string | null;
  logo_url?: string | null;
};

export default function ReceiptClient({ id }: { id?: string }) {
  const routeParams = useParams();
  const saleId = id || (routeParams?.id as string);

  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [printingBluetooth, setPrintingBluetooth] = useState(false);
  const [printerConnected, setPrinterConnected] = useState(false);

  useEffect(() => {
    setPrinterConnected(Boolean(getPrinterStatus()));
  }, []);

  useEffect(() => {
    async function fetchReceipt() {
      if (!saleId) return;
      setLoading(true);

      let loadedStore: StoreInfo | null = null;

      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .maybeSingle();

      if (saleErr || !saleData) {
        setErrorMsg('Data transaksi tidak ditemukan atau telah dihapus.');
        setLoading(false);
        return;
      }

      setSale(saleData as Sale);

      // Fetch items
      const { data: itemsData } = await supabase
        .from('sale_items')
        .select('product_name, quantity, unit_price, subtotal')
        .eq('sale_id', saleId);

      setItems((itemsData as Item[]) || []);

      // Fetch store
      if (saleData.store_id) {
        try {
          const profRes = await fetch(`/api/stores/profile?storeId=${saleData.store_id}`);
          if (profRes.ok) {
            const profData = await profRes.json();
            if (profData?.profile) {
              loadedStore = {
                name: profData.profile.name,
                address: profData.profile.address,
                phone: profData.profile.phone,
                logo_url: profData.profile.logo_url,
              };
              setStore(loadedStore);
            }
          }
        } catch {}

        if (!loadedStore) {
          const { data: storeData } = await supabase
            .from('stores')
            .select('name, address, phone')
            .eq('id', saleData.store_id)
            .maybeSingle();

          if (storeData) {
            setStore(storeData);
          }
        }
      }

      setLoading(false);
    }

    void fetchReceipt();
  }, [saleId]);

  const getReceiptPayload = (): ReceiptPrintData => {
    return {
      invoiceNumber: sale?.invoice_number || 'INV-000000',
      storeName: store?.name || 'Aldo Coffe Street',
      storeAddress: store?.address || 'Klangkapan 2, Sleman',
      storePhone: store?.phone || '0895-4234-91442',
      date: sale ? formatDateTime(sale.created_at) : new Date().toLocaleString('id-ID'),
      items: items.map((it) => ({
        productName: it.product_name,
        quantity: it.quantity,
        unitPrice: Number(it.unit_price),
        subtotal: Number(it.subtotal),
      })),
      subtotal: Number(sale?.subtotal || 0),
      discount: Number(sale?.discount_amount || 0),
      tax: Number(sale?.tax_amount || 0),
      grandTotal: Number(sale?.grand_total || 0),
      paidAmount: Number(sale?.paid_amount || 0),
      changeAmount: Number(sale?.change_amount || 0),
      paymentMethod: sale?.payment_method || 'CASH',
      footerNotes: (typeof window !== 'undefined' && localStorage.getItem('kasirflow_receipt_footer')) || 'Password WiFi: aldocoffe2026',
    };
  };

  const handlePrintBluetooth = async () => {
    if (!sale) return;
    setPrintingBluetooth(true);
    try {
      let status = getPrinterStatus();
      if (!status) {
        toast.info('Menghubungkan ke printer thermal Bluetooth...');
        status = await connectBluetoothPrinter();
        setPrinterConnected(true);
      }

      const paperWidth = (localStorage.getItem('kasirflow_paper_width') as PaperWidth) || '58mm';
      const payload = getReceiptPayload();
      const bytes = buildEscPosReceipt(payload, paperWidth);

      await sendEscPosToPrinter(bytes);
      toast.success('Struk berhasil dicetak ke printer Bluetooth!');
    } catch (err: any) {
      if (err?.name !== 'NotFoundError') {
        toast.error(err?.message || 'Gagal mencetak struk thermal Bluetooth');
      }
    } finally {
      setPrintingBluetooth(false);
    }
  };

  const handleShareWhatsApp = () => {
    if (!sale) return;
    const payload = getReceiptPayload();
    shareReceiptViaWhatsApp(payload);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/20 gap-3 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Menyiapkan struk transaksi...</p>
      </div>
    );
  }

  if (errorMsg || !sale) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <p className="text-destructive font-semibold mb-2">{errorMsg || 'Transaksi tidak ditemukan'}</p>
        <Button variant="outline" onClick={() => window.history.back()}>
          Tutup Halaman
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40 py-6 px-4">
      {/* Control Bar (Hidden on print) */}
      <div className="no-print max-w-sm mx-auto mb-4 bg-background p-3.5 rounded-2xl border shadow-sm space-y-2.5">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()} className="h-8 text-xs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Kembali
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              speakPaymentSuccess(Number(sale.grand_total), {
                storeName: store?.name,
                paymentMethod: sale.payment_method,
              });
            }}
            title="Dengarkan pengumuman suara transaksi"
            className="h-8 text-xs"
          >
            <Volume2 className="h-3.5 w-3.5 mr-1.5 text-primary" />
            Suara
          </Button>
        </div>

        {/* Action Buttons for Printing */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
          <Button
            size="sm"
            onClick={handlePrintBluetooth}
            disabled={printingBluetooth}
            className="h-9 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
            title="Cetak instan ke printer Bluetooth portabel tanpa langganan"
          >
            {printingBluetooth ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Bluetooth className="h-3.5 w-3.5 mr-1.5" />
            )}
            Cetak Bluetooth
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            className="h-9 text-xs font-semibold"
            title="Cetak via printer USB/Desktop dialog browser"
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Cetak Browser
          </Button>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleShareWhatsApp}
          className="w-full h-8 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800"
        >
          <Share2 className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
          Kirim Struk ke WhatsApp (0 Rupiah)
        </Button>
      </div>

      {/* Printable Paper Struk (58mm - 80mm POS Standard) */}
      <div
        id="printable-receipt"
        className="max-w-[320px] mx-auto bg-white text-black p-4 rounded-xl border shadow-sm text-xs font-mono leading-relaxed"
      >
        {/* Store Header */}
        <div className="text-center pb-2.5 border-b border-dashed border-gray-300">
          {store?.logo_url && (
            <div className="flex justify-center mb-1.5">
              <img
                src={store.logo_url}
                alt="Logo Toko"
                className="h-9 w-9 object-contain rounded"
              />
            </div>
          )}
          <h2 className="font-bold text-sm uppercase tracking-wider">{store?.name || 'ALDO COFFE STREET'}</h2>
          {store?.address && <p className="text-[10px] text-gray-600 mt-0.5">{store.address}</p>}
          {store?.phone && <p className="text-[10px] text-gray-600">Telp: {store.phone}</p>}
        </div>

        {/* Invoice Info */}
        <div className="py-2 space-y-0.5 text-[11px] border-b border-dashed border-gray-300">
          <div className="flex justify-between">
            <span className="text-gray-600">No. Nota:</span>
            <span className="font-bold">{sale.invoice_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Waktu:</span>
            <span>{formatDateTime(sale.created_at)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Metode:</span>
            <span className="font-semibold">{sale.payment_method}</span>
          </div>
        </div>

        {/* Item List */}
        <div className="py-2 space-y-1.5 border-b border-dashed border-gray-300">
          {items.map((item, index) => (
            <div key={index} className="space-y-0.5">
              <div className="font-bold">{item.product_name}</div>
              <div className="flex justify-between text-gray-700">
                <span>
                  {item.quantity} x {formatCurrency(Number(item.unit_price))}
                </span>
                <span className="font-semibold">{formatCurrency(Number(item.subtotal))}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="py-2 space-y-1 border-b border-dashed border-gray-300">
          <div className="flex justify-between text-gray-700">
            <span>Subtotal</span>
            <span>{formatCurrency(Number(sale.subtotal))}</span>
          </div>
          {Number(sale.discount_amount) > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>Diskon</span>
              <span>-{formatCurrency(Number(sale.discount_amount))}</span>
            </div>
          )}
          {Number(sale.tax_amount) > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>Pajak</span>
              <span>+{formatCurrency(Number(sale.tax_amount))}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold pt-1 border-t border-gray-200">
            <span>TOTAL</span>
            <span>{formatCurrency(Number(sale.grand_total))}</span>
          </div>
          {Number(sale.paid_amount) > 0 && (
            <div className="flex justify-between text-gray-700 pt-0.5">
              <span>Tunai</span>
              <span>{formatCurrency(Number(sale.paid_amount))}</span>
            </div>
          )}
          {Number(sale.change_amount) >= 0 && Number(sale.paid_amount) > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>Kembalian</span>
              <span>{formatCurrency(Number(sale.change_amount))}</span>
            </div>
          )}
        </div>

        {/* Footer Greetings */}
        <div className="text-center pt-2.5 text-[10px] text-gray-600 space-y-0.5">
          <p className="font-semibold">*** TERIMA KASIH ***</p>
          <p>Password WiFi: aldocoffe2026</p>
          <p className="pt-0.5 text-[9px] text-gray-400">KasirFlow POS · aldocoffestreet</p>
        </div>
      </div>
    </div>
  );
}
