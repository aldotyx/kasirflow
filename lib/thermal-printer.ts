'use client';

// Web Bluetooth & ESC/POS Thermal Printing Library (Zero Subscription / 100% Free)
// Supports 58mm (32 chars) and 80mm (48 chars) thermal printers (RPP02N, Panda, Iware, VSC, MPT-II, etc.)

export type PaperWidth = '58mm' | '80mm';

export interface PrinterDevice {
  name: string;
  id: string;
  connected: boolean;
}

export interface ReceiptPrintData {
  invoiceNumber: string;
  storeName: string;
  storeAddress?: string | null;
  storePhone?: string | null;
  date: string;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  subtotal: number;
  discount?: number;
  tax?: number;
  grandTotal: number;
  paidAmount?: number;
  changeAmount?: number;
  paymentMethod: string;
  customerName?: string;
  tableNumber?: string;
  cashierName?: string;
  footerNotes?: string;
}

// Common Bluetooth Printer Service & Characteristic UUIDs
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Posnet / Custom Chinese Thermal Printer Service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent Serial Service (widely used in MPT / Panda)
  '0000ff00-0000-1000-8000-00805f9b34fb', // Common ESC/POS BLE Service
];

let activeBluetoothDevice: any = null;
let activeCharacteristic: any = null;

// Check if Web Bluetooth is supported in current browser
export function isBluetoothSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'bluetooth' in navigator;
}

// Request and pair with Bluetooth Thermal Printer
export async function connectBluetoothPrinter(): Promise<PrinterDevice> {
  if (!isBluetoothSupported()) {
    throw new Error('Browser ini tidak mendukung Web Bluetooth API. Harap gunakan Google Chrome atau Microsoft Edge.');
  }

  try {
    const navAny = navigator as any;
    const device = await navAny.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });

    if (!device) {
      throw new Error('Tidak ada printer yang dipilih.');
    }

    const server = await device.gatt.connect();

    // Scan services to find writable characteristic
    let foundChar: any = null;
    const services = await server.getPrimaryServices().catch(() => []);

    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const c of characteristics) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            foundChar = c;
            break;
          }
        }
        if (foundChar) break;
      } catch {}
    }

    if (!foundChar) {
      // Fallback: search known service directly
      for (const serviceUuid of PRINTER_SERVICES) {
        try {
          const service = await server.getPrimaryService(serviceUuid);
          const chars = await service.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              foundChar = c;
              break;
            }
          }
          if (foundChar) break;
        } catch {}
      }
    }

    if (!foundChar) {
      throw new Error('Printer terhubung tetapi karakteristik cetak (write) tidak ditemukan.');
    }

    activeBluetoothDevice = device;
    activeCharacteristic = foundChar;

    // Listen for disconnection
    device.addEventListener('gattserverdisconnected', () => {
      activeBluetoothDevice = null;
      activeCharacteristic = null;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kasirflow_printer_status_changed'));
      }
    });

    const info: PrinterDevice = {
      name: device.name || 'Thermal Printer',
      id: device.id,
      connected: true,
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem('kasirflow_last_printer_name', info.name);
      window.dispatchEvent(new CustomEvent('kasirflow_printer_status_changed'));
    }

    return info;
  } catch (err: any) {
    activeBluetoothDevice = null;
    activeCharacteristic = null;
    throw err;
  }
}

// Disconnect active printer
export function disconnectBluetoothPrinter(): void {
  try {
    if (activeBluetoothDevice && activeBluetoothDevice.gatt.connected) {
      activeBluetoothDevice.gatt.disconnect();
    }
  } catch {}
  activeBluetoothDevice = null;
  activeCharacteristic = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kasirflow_printer_status_changed'));
  }
}

// Check current printer status
export function getPrinterStatus(): PrinterDevice | null {
  if (activeBluetoothDevice && activeBluetoothDevice.gatt && activeBluetoothDevice.gatt.connected) {
    return {
      name: activeBluetoothDevice.name || 'Thermal Printer',
      id: activeBluetoothDevice.id,
      connected: true,
    };
  }
  return null;
}

// Format numbers into Indonesian Rupiah format without decimals
function formatRp(num: number): string {
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

// Generate ESC/POS Byte Stream for Receipt
export function buildEscPosReceipt(data: ReceiptPrintData, paperWidth: PaperWidth = '58mm'): Uint8Array {
  const maxChars = paperWidth === '80mm' ? 48 : 32;
  const separator = '-'.repeat(maxChars);
  const doubleSeparator = '='.repeat(maxChars);

  const bytes: number[] = [];

  // Helper to push string as ASCII / Code Page 437 bytes
  const writeStr = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      bytes.push(code < 128 ? code : 63); // 63 is '?'
    }
  };

  const writeLine = (str: string) => {
    writeStr(str);
    bytes.push(0x0a); // LF
  };

  // Helper for left-right aligned text on single line
  const writeLeftRight = (left: string, right: string) => {
    const totalLen = left.length + right.length;
    if (totalLen >= maxChars) {
      const availableLeft = Math.max(10, maxChars - right.length - 1);
      const truncatedLeft = left.substring(0, availableLeft);
      const spaceCount = Math.max(1, maxChars - truncatedLeft.length - right.length);
      writeLine(truncatedLeft + ' '.repeat(spaceCount) + right);
    } else {
      const spaces = ' '.repeat(maxChars - totalLen);
      writeLine(left + spaces + right);
    }
  };

  // 1. Initialize printer: ESC @
  bytes.push(0x1b, 0x40);

  // 2. Center Align: ESC a 1
  bytes.push(0x1b, 0x61, 0x01);

  // 3. Double Height & Width for Store Name: GS ! 0x11
  bytes.push(0x1d, 0x21, 0x11);
  bytes.push(0x1b, 0x45, 0x01); // Bold ON
  writeLine(data.storeName.toUpperCase());
  bytes.push(0x1d, 0x21, 0x00); // Normal text
  bytes.push(0x1b, 0x45, 0x00); // Bold OFF

  // 4. Store Address & Phone
  if (data.storeAddress) {
    writeLine(data.storeAddress);
  }
  if (data.storePhone) {
    writeLine(`Telp: ${data.storePhone}`);
  }
  writeLine(doubleSeparator);

  // 5. Left Align for Meta: ESC a 0
  bytes.push(0x1b, 0x61, 0x00);
  writeLeftRight('No. Invoice', data.invoiceNumber);
  writeLeftRight('Waktu', data.date);
  if (data.tableNumber) {
    writeLeftRight('Meja', `MEJA ${data.tableNumber}`);
  }
  if (data.customerName) {
    writeLeftRight('Pelanggan', data.customerName);
  }
  if (data.cashierName) {
    writeLeftRight('Kasir', data.cashierName);
  }
  writeLine(separator);

  // 6. Items Table
  bytes.push(0x1b, 0x45, 0x01); // Bold ON
  writeLeftRight('MENU', 'TOTAL');
  bytes.push(0x1b, 0x45, 0x00); // Bold OFF
  writeLine(separator);

  for (const item of data.items) {
    writeLine(item.productName);
    const qtyPrice = `  ${item.quantity} x ${formatRp(item.unitPrice)}`;
    const subtotal = formatRp(item.subtotal);
    writeLeftRight(qtyPrice, subtotal);
  }

  writeLine(separator);

  // 7. Totals & Payment
  writeLeftRight('Subtotal', formatRp(data.subtotal));
  if (data.discount && data.discount > 0) {
    writeLeftRight('Diskon Promo', `-${formatRp(data.discount)}`);
  }
  if (data.tax && data.tax > 0) {
    writeLeftRight('Pajak PPN', `+${formatRp(data.tax)}`);
  }

  bytes.push(0x1b, 0x45, 0x01); // Bold ON
  writeLeftRight('TOTAL BAYAR', formatRp(data.grandTotal));
  bytes.push(0x1b, 0x45, 0x00); // Bold OFF

  writeLeftRight('Metode Bayar', data.paymentMethod);

  if (data.paidAmount !== undefined && data.paidAmount > 0) {
    writeLeftRight('Bayar Tunai', formatRp(data.paidAmount));
    if (data.changeAmount !== undefined && data.changeAmount >= 0) {
      writeLeftRight('Kembalian', formatRp(data.changeAmount));
    }
  }

  writeLine(doubleSeparator);

  // 8. Footer Notes & Center Align: ESC a 1
  bytes.push(0x1b, 0x61, 0x01);
  writeLine(data.footerNotes || 'Terima kasih atas kunjungan Anda!');
  writeLine('KasirFlow POS · aldocoffestreet');
  writeLine('');
  writeLine('');

  // 9. Feed & Paper Cut (GS V 66 0)
  bytes.push(0x1d, 0x56, 0x42, 0x00);

  return new Uint8Array(bytes);
}

// Send Raw ESC/POS Bytes in Safe Bluetooth Chunks (BLE MTU Safe)
export async function sendEscPosToPrinter(dataBytes: Uint8Array): Promise<void> {
  if (!activeCharacteristic) {
    throw new Error('Printer thermal Bluetooth belum terhubung. Silakan klik "Koneksikan Printer" terlebih dahulu.');
  }

  // Split into 100-byte chunks to prevent BLE buffer overflow
  const CHUNK_SIZE = 100;
  for (let offset = 0; offset < dataBytes.length; offset += CHUNK_SIZE) {
    const chunk = dataBytes.slice(offset, offset + CHUNK_SIZE);
    if (activeCharacteristic.writeValueWithoutResponse) {
      await activeCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await activeCharacteristic.writeValue(chunk);
    }
    // Small pause between Bluetooth packets
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// Generate Struk Test Print for verification
export function getTestReceiptData(storeName = 'Aldo Coffe Street'): ReceiptPrintData {
  return {
    invoiceNumber: `TEST-${Date.now().toString().slice(-6)}`,
    storeName,
    storeAddress: 'Klangkapan 2, Sleman, Yogyakarta',
    storePhone: '0895-4234-91442',
    date: new Date().toLocaleString('id-ID'),
    items: [
      { productName: 'Kopi Susu Gula Aren', quantity: 2, unitPrice: 18000, subtotal: 36000 },
      { productName: 'Tempe Mendoan Hangat', quantity: 1, unitPrice: 8000, subtotal: 8000 },
    ],
    subtotal: 44000,
    grandTotal: 44000,
    paidAmount: 50000,
    changeAmount: 6000,
    paymentMethod: 'CASH',
    customerName: 'Pelanggan Meja 01',
    tableNumber: '01',
    cashierName: 'Aldo (Owner)',
    footerNotes: 'Password WiFi: aldocoffe2026',
  };
}

// Format Struk for Instant WhatsApp Share (100% Free / Zero Paper)
export function buildWhatsAppReceiptText(data: ReceiptPrintData): string {
  const line = '--------------------------------';
  let text = `*${data.storeName.toUpperCase()}*\n`;
  if (data.storeAddress) text += `${data.storeAddress}\n`;
  if (data.storePhone) text += `Telp: ${data.storePhone}\n`;
  text += `${line}\n`;
  text += `*No. Invoice:* ${data.invoiceNumber}\n`;
  text += `*Waktu:* ${data.date}\n`;
  if (data.tableNumber) text += `*Meja:* ${data.tableNumber}\n`;
  if (data.customerName) text += `*Nama:* ${data.customerName}\n`;
  text += `${line}\n`;
  text += `*RINCIAN PESANAN:*\n`;

  for (const it of data.items) {
    text += `• ${it.productName}\n`;
    text += `  ${it.quantity} x ${formatRp(it.unitPrice)} = *${formatRp(it.subtotal)}*\n`;
  }

  text += `${line}\n`;
  text += `*Total Tagihan:* *${formatRp(data.grandTotal)}*\n`;
  text += `*Metode Bayar:* ${data.paymentMethod}\n`;

  if (data.paidAmount && data.paidAmount > 0) {
    text += `*Tunai Diterima:* ${formatRp(data.paidAmount)}\n`;
    if (data.changeAmount !== undefined) {
      text += `*Kembalian:* ${formatRp(data.changeAmount)}\n`;
    }
  }

  text += `${line}\n`;
  text += `${data.footerNotes || 'Terima kasih telah berkunjung ke Aldo Coffe Street!'}\n`;

  return text;
}

// Open WhatsApp with pre-filled receipt
export function shareReceiptViaWhatsApp(data: ReceiptPrintData, phoneNumber = ''): void {
  const message = buildWhatsAppReceiptText(data);
  let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.substring(1);
  }
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  
  if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
}

// Get connected device alias for status
export function getConnectedDevice(): PrinterDevice | null {
  return getPrinterStatus();
}

// Print receipt directly via active Bluetooth connection
export async function printReceiptDirectly(
  data: ReceiptPrintData,
  paperWidth: PaperWidth = '58mm'
): Promise<{ success: boolean; error?: string }> {
  try {
    const status = getPrinterStatus();
    if (!status || !status.connected) {
      return { success: false, error: 'Printer Bluetooth belum terhubung' };
    }
    const escposBytes = buildEscPosReceipt(data, paperWidth);
    await sendEscPosToPrinter(escposBytes);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal mengirim data ke printer' };
  }
}
