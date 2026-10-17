import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export interface DraftOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  sellPrice: number;
  buyPrice: number;
  discountPercent: number;
  subtotal: number;
  imageUrl?: string | null;
  sku?: string;
  notes?: string;
}

export interface DraftOrder {
  id: string;
  storeId: string;
  name: string;
  customerName?: string;
  tableNumber?: string;
  notes?: string;
  items: DraftOrderItem[];
  subtotal: number;
  totalHpp: number;
  grandTotal: number;
  paymentMethod?: string;
  createdAt: string;
  updatedAt: string;
}

const DRAFTS_FILE_PATH = path.join('/tmp', 'kasirflow_pos_drafts.json');

function readDrafts(): DraftOrder[] {
  try {
    if (!fs.existsSync(DRAFTS_FILE_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(DRAFTS_FILE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading draft orders file:', err);
    return [];
  }
}

function writeDrafts(drafts: DraftOrder[]): void {
  try {
    fs.writeFileSync(DRAFTS_FILE_PATH, JSON.stringify(drafts, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing draft orders file:', err);
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: list drafts for store
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  const allDrafts = readDrafts();
  const filtered = storeId ? allDrafts.filter((d) => !d.storeId || d.storeId === storeId) : allDrafts;

  // Sort newest first
  filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  return NextResponse.json(
    { drafts: filtered },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  );
}

// POST: save or update a draft order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      storeId = '2f2af344-ed08-43d2-8bdf-0f9aa412f57c',
      name = 'Antrean Baru',
      customerName = '',
      tableNumber = '',
      notes = '',
      items = [],
      subtotal = 0,
      totalHpp = 0,
      grandTotal = 0,
      paymentMethod = 'CASH',
    } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Item keranjang tidak boleh kosong' }, { status: 400 });
    }

    const drafts = readDrafts();
    const now = new Date().toISOString();

    if (id) {
      const existingIndex = drafts.findIndex((d) => d.id === id);
      if (existingIndex !== -1) {
        drafts[existingIndex] = {
          ...drafts[existingIndex],
          name: name.trim() || drafts[existingIndex].name,
          customerName: customerName.trim() || drafts[existingIndex].customerName,
          tableNumber: tableNumber.trim() || drafts[existingIndex].tableNumber,
          notes: notes.trim(),
          items,
          subtotal: Number(subtotal),
          totalHpp: Number(totalHpp),
          grandTotal: Number(grandTotal),
          paymentMethod,
          updatedAt: now,
        };
        writeDrafts(drafts);
        return NextResponse.json({ success: true, draft: drafts[existingIndex] });
      }
    }

    const draftId = id || `DFT-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const newDraft: DraftOrder = {
      id: draftId,
      storeId,
      name: name.trim() || (tableNumber ? `Meja ${tableNumber}` : customerName ? `Pesanan ${customerName}` : `Antrean #${drafts.length + 1}`),
      customerName: customerName.trim(),
      tableNumber: tableNumber.trim(),
      notes: notes.trim(),
      items,
      subtotal: Number(subtotal),
      totalHpp: Number(totalHpp),
      grandTotal: Number(grandTotal),
      paymentMethod,
      createdAt: now,
      updatedAt: now,
    };

    drafts.unshift(newDraft);
    if (drafts.length > 50) {
      drafts.length = 50;
    }
    writeDrafts(drafts);

    return NextResponse.json({ success: true, draft: newDraft }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Gagal menyimpan draft pesanan' }, { status: 500 });
  }
}

// DELETE: remove draft by id
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id draft wajib diisi' }, { status: 400 });
    }

    const drafts = readDrafts();
    const remaining = drafts.filter((d) => d.id !== id);
    writeDrafts(remaining);

    return NextResponse.json({ success: true, message: 'Draft berhasil dihapus' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Gagal menghapus draft' }, { status: 500 });
  }
}
