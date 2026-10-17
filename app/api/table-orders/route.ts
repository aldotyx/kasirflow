import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSupabaseServerClient } from '@/lib/supabase/config';

export interface TableOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
  imageUrl?: string | null;
}

export type TableOrderStatus = 'PENDING' | 'PREPARING' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
export type TableOrderPaymentStatus = 'UNPAID' | 'PAID' | 'UNPAID_CASH';

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

const PERM_ORDERS_FILE = path.join(process.cwd(), 'data', 'kasirflow_table_orders.json');
const TMP_ORDERS_FILE = path.join('/tmp', 'kasirflow_table_orders.json');
const DEFAULT_STORE_ID = '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';

// In-memory cache for ultra-fast zero-latency response
let inMemoryOrders: TableOrder[] = [];

function getOrdersFilePath(): string {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return PERM_ORDERS_FILE;
  } catch {
    return TMP_ORDERS_FILE;
  }
}

function readLocalOrders(): TableOrder[] {
  try {
    let permList: TableOrder[] = [];
    let tmpList: TableOrder[] = [];
    let permMtime = 0;
    let tmpMtime = 0;

    const perm = getOrdersFilePath();
    if (fs.existsSync(perm)) {
      try {
        const stats = fs.statSync(perm);
        permMtime = stats.mtimeMs;
        permList = JSON.parse(fs.readFileSync(perm, 'utf-8'));
      } catch {}
    }

    if (fs.existsSync(TMP_ORDERS_FILE)) {
      try {
        const stats = fs.statSync(TMP_ORDERS_FILE);
        tmpMtime = stats.mtimeMs;
        tmpList = JSON.parse(fs.readFileSync(TMP_ORDERS_FILE, 'utf-8'));
      } catch {}
    }

    const mergedMap = new Map<string, TableOrder>();
    const baseList = permMtime >= tmpMtime ? [...tmpList, ...permList] : [...permList, ...tmpList];
    for (const item of baseList) {
      if (item && (item.id || item.orderCode)) {
        const key = item.id || item.orderCode!;
        mergedMap.set(key, item);
      }
    }

    if (inMemoryOrders && inMemoryOrders.length > 0) {
      for (const item of inMemoryOrders) {
        if (item && (item.id || item.orderCode)) {
          const key = item.id || item.orderCode!;
          if (!mergedMap.has(key)) {
            mergedMap.set(key, item);
          } else {
            const prev = mergedMap.get(key)!;
            const prevTime = new Date(prev.updatedAt || prev.createdAt).getTime();
            const currTime = new Date(item.updatedAt || item.createdAt).getTime();
            if (currTime >= prevTime) {
              mergedMap.set(key, { ...prev, ...item });
            }
          }
        }
      }
    }

    const result = Array.from(mergedMap.values());
    inMemoryOrders = result;
    return result;
  } catch (err) {
    console.warn('Error reading local orders:', err);
    return inMemoryOrders;
  }
}

function writeLocalOrders(orders: TableOrder[]): void {
  inMemoryOrders = orders;
  const json = JSON.stringify(orders, null, 2);
  try {
    const perm = getOrdersFilePath();
    fs.writeFileSync(perm, json, 'utf-8');
  } catch {}
  try {
    fs.writeFileSync(TMP_ORDERS_FILE, json, 'utf-8');
  } catch {}
}

function normalizeStore(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/coffee/g, 'coffe');
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: fetch active table orders for store (24-hour expiration token logic)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const storeId = searchParams.get('storeId') || DEFAULT_STORE_ID;
    const storeSlug = searchParams.get('storeSlug');
    const tableNumber = searchParams.get('tableNumber');

    // 24 hours window timestamp: active orders expire after 24h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch from Supabase (Source of Truth across devices & deployments)
    let dbOrders: TableOrder[] = [];
    try {
      const supabase = getSupabaseServerClient();
      let query = supabase
        .from('table_orders')
        .select('*')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false });

      if (orderId) {
        query = query.or(`id.eq.${orderId},notes.ilike.%${orderId}%`);
      } else if (storeId) {
        query = query.or(`store_id.eq.${storeId},store_id.is.null`);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        dbOrders = data.map((row: any) => ({
          id: row.id,
          orderCode: row.notes?.match(/ORD-M\d+-[A-Z0-9]+/)?.[0] || `ORD-M${row.table_number}-${row.id.slice(0, 6).toUpperCase()}`,
          storeId: row.store_id || DEFAULT_STORE_ID,
          storeName: 'Aldo Coffe Street',
          storeSlug: row.store_slug || 'aldocoffestreet',
          tableNumber: String(row.table_number).padStart(2, '0'),
          customerName: row.customer_name || `Meja ${row.table_number}`,
          items: Array.isArray(row.items) ? row.items : [],
          totalAmount: Number(row.total_amount) || 0,
          status: row.status as TableOrderStatus,
          paymentStatus: row.payment_status as TableOrderPaymentStatus,
          paymentMethod: row.payment_method || 'CASH',
          notes: row.notes || '',
          createdAt: row.created_at,
          updatedAt: row.updated_at || row.created_at,
        }));
      }
    } catch (sbErr) {
      console.warn('Supabase fetch table_orders warning:', sbErr);
    }

    // 2. Fetch from Permanent Local Storage / In-Memory (resilient even if RLS blocks DB)
    const localOrders = readLocalOrders().filter((o) => {
      const time = new Date(o.createdAt).getTime();
      return Date.now() - time <= 24 * 60 * 60 * 1000;
    });

    // 3. Merge: deduplicate by ID or orderCode
    const mergedMap = new Map<string, TableOrder>();

    for (const ord of dbOrders) {
      const key = ord.orderCode || ord.id;
      mergedMap.set(key, ord);
    }

    for (const ord of localOrders) {
      const key = ord.orderCode || ord.id;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, ord);
      } else {
        const existing = mergedMap.get(key)!;
        const existingTime = new Date(existing.updatedAt || existing.createdAt).getTime();
        const localTime = new Date(ord.updatedAt || ord.createdAt).getTime();
        if (localTime >= existingTime) {
          mergedMap.set(key, { ...existing, ...ord });
        }
      }
    }

    let allOrders = Array.from(mergedMap.values());

    // Single order lookup by ID or orderCode
    if (orderId) {
      const found = allOrders.find((o) => o.id === orderId || o.orderCode === orderId);
      if (!found) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      return NextResponse.json(
        { order: found },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      );
    }

    let filtered = allOrders;

    if (storeSlug) {
      const slugNorm = normalizeStore(storeSlug);
      filtered = filtered.filter((o) => {
        const oSlug = normalizeStore(o.storeSlug || o.storeName || '');
        return (
          oSlug === slugNorm ||
          oSlug.includes(slugNorm) ||
          slugNorm.includes(oSlug) ||
          o.storeId === storeSlug
        );
      });
    }

    if (tableNumber) {
      filtered = filtered.filter((o) => o.tableNumber === String(tableNumber).padStart(2, '0'));
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json(
      { orders: filtered },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err: any) {
    console.error('Failed to get table orders:', err);
    return NextResponse.json({ orders: [] }, { status: 200 });
  }
}

// POST: create new table order from mobile customer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      storeId = DEFAULT_STORE_ID,
      storeName = 'Aldo Coffe Street',
      storeSlug = 'aldocoffestreet',
      tableNumber = '01',
      customerName = '',
      items = [],
      totalAmount = 0,
      notes = '',
      paymentStatus = 'UNPAID',
      paymentMethod = 'CASH',
    } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Items cannot be empty' }, { status: 400 });
    }

    // Generate valid UUID for Supabase
    const randomHex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    const orderUuid = `${randomHex()}${randomHex()}-${randomHex()}-4${randomHex().substring(0, 3)}-8${randomHex().substring(0, 3)}-${randomHex()}${randomHex()}${randomHex()}`;

    // Human-readable Order Code (e.g. ORD-M01-MVB5IHV0)
    const shortCode = Date.now().toString(36).toUpperCase();
    const orderCode = `ORD-M${String(tableNumber).padStart(2, '0')}-${shortCode}`;
    const now = new Date().toISOString();

    const formattedNotes = `[${orderCode}] ${notes}`.trim();

    const newOrder: TableOrder = {
      id: orderUuid,
      orderCode,
      storeId,
      storeName,
      storeSlug: storeSlug.toLowerCase().replace(/[^a-z0-9]/g, ''),
      tableNumber: String(tableNumber).padStart(2, '0'),
      customerName: customerName.trim() || `Pelanggan Meja ${tableNumber}`,
      items,
      totalAmount: Number(totalAmount) || 0,
      status: 'PENDING',
      paymentStatus: paymentStatus as TableOrderPaymentStatus,
      paymentMethod,
      notes: formattedNotes,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Save into resilient local file storage immediately
    const orders = readLocalOrders();
    orders.unshift(newOrder);
    if (orders.length > 200) orders.length = 200;
    writeLocalOrders(orders);

    // 2. Insert into Supabase table_orders (using server client which bypasses RLS if service key present)
    try {
      const supabase = getSupabaseServerClient();
      const { data: dbCreated, error: sbErr } = await supabase
        .from('table_orders')
        .insert({
          id: orderUuid,
          store_id: storeId,
          store_slug: storeSlug,
          table_number: newOrder.tableNumber,
          customer_name: newOrder.customerName,
          total_amount: newOrder.totalAmount,
          status: 'PENDING',
          payment_status: newOrder.paymentStatus,
          payment_method: newOrder.paymentMethod,
          items: newOrder.items,
          notes: newOrder.notes,
        })
        .select()
        .single();

      if (sbErr) {
        console.warn('Supabase table_orders insert warning (using resilient local store):', sbErr.message);
      } else if (dbCreated) {
        newOrder.id = dbCreated.id;
      }
    } catch (sbErr: any) {
      console.warn('Supabase table_orders exception:', sbErr?.message);
    }

    return NextResponse.json(
      { success: true, order: newOrder },
      {
        status: 201,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create order' }, { status: 500 });
  }
}

// PATCH: update order status (e.g. cashier marks PREPARING, SERVED, COMPLETED, or paymentStatus: PAID / UNPAID_CASH)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, status, paymentStatus, paymentMethod, invoiceNumber } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 1. Update in local cache
    const orders = readLocalOrders();
    const index = orders.findIndex((o) => o.id === orderId || o.orderCode === orderId);

    if (index !== -1) {
      if (status) orders[index].status = status;
      if (paymentStatus) orders[index].paymentStatus = paymentStatus;
      if (paymentMethod) orders[index].paymentMethod = paymentMethod;
      if (invoiceNumber) orders[index].invoiceNumber = invoiceNumber;
      orders[index].updatedAt = now;
      writeLocalOrders(orders);
    }

    // 2. Update in Supabase
    try {
      const supabase = getSupabaseServerClient();
      const updatePayload: any = { updated_at: now };
      if (status) updatePayload.status = status;
      if (paymentStatus) updatePayload.payment_status = paymentStatus;
      if (paymentMethod) updatePayload.payment_method = paymentMethod;

      await supabase
        .from('table_orders')
        .update(updatePayload)
        .or(`id.eq.${orderId},notes.ilike.%${orderId}%`);
    } catch (sbErr) {
      console.warn('Supabase table_orders update error:', sbErr);
    }

    return NextResponse.json(
      {
        success: true,
        order: index !== -1 ? orders[index] : { id: orderId, status, paymentStatus },
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update order' }, { status: 500 });
  }
}

// DELETE: cancel or delete order from queue
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let orderId = searchParams.get('id') || searchParams.get('orderId');

    if (!orderId) {
      try {
        const body = await request.json();
        orderId = body?.orderId || body?.id;
      } catch {}
    }

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    // 1. Delete from local cache
    const orders = readLocalOrders();
    const filtered = orders.filter((o) => o.id !== orderId && o.orderCode !== orderId);
    writeLocalOrders(filtered);

    // 2. Delete from Supabase
    try {
      const supabase = getSupabaseServerClient();
      await supabase
        .from('table_orders')
        .delete()
        .or(`id.eq.${orderId},notes.ilike.%${orderId}%`);
    } catch (sbErr) {
      console.warn('Supabase table_orders delete error:', sbErr);
    }

    return NextResponse.json(
      { success: true, deletedId: orderId },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete order' }, { status: 500 });
  }
}
