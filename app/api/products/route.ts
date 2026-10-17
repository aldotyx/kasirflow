import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';

const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());

const DEFAULT_STORE_ID = '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';
const PERM_PRODUCTS_FILE = path.join(process.cwd(), 'data', 'kasirflow_custom_products.json');
const TMP_PRODUCTS_FILE = path.join('/tmp', 'kasirflow_custom_products.json');
const PERM_LOGS_FILE = path.join(process.cwd(), 'data', 'kasirflow_inventory_logs.json');
const TMP_LOGS_FILE = path.join('/tmp', 'kasirflow_inventory_logs.json');

// In-memory cache to guarantee 0ms instant persistence across requests in same node instance
let inMemoryCustomProducts: any[] | null = null;

function getProductsFilePath(): string {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return PERM_PRODUCTS_FILE;
  } catch {
    return TMP_PRODUCTS_FILE;
  }
}

function readCustomProducts(): any[] {
  try {
    let permList: any[] = [];
    let tmpList: any[] = [];
    let permMtime = 0;
    let tmpMtime = 0;

    const perm = getProductsFilePath();
    if (fs.existsSync(perm)) {
      try {
        const stats = fs.statSync(perm);
        permMtime = stats.mtimeMs;
        permList = JSON.parse(fs.readFileSync(perm, 'utf-8'));
      } catch {}
    }

    if (fs.existsSync(TMP_PRODUCTS_FILE)) {
      try {
        const stats = fs.statSync(TMP_PRODUCTS_FILE);
        tmpMtime = stats.mtimeMs;
        tmpList = JSON.parse(fs.readFileSync(TMP_PRODUCTS_FILE, 'utf-8'));
      } catch {}
    }

    // Merge by ID choosing newest updated_at or newest file mtime
    const mergedMap = new Map<string, any>();
    const baseList = permMtime >= tmpMtime ? [...tmpList, ...permList] : [...permList, ...tmpList];
    for (const item of baseList) {
      if (item && item.id) {
        if (!mergedMap.has(item.id)) {
          mergedMap.set(item.id, item);
        } else {
          const prev = mergedMap.get(item.id);
          const prevTime = prev.updated_at ? new Date(prev.updated_at).getTime() : 0;
          const currTime = item.updated_at ? new Date(item.updated_at).getTime() : 0;
          if (currTime >= prevTime) {
            mergedMap.set(item.id, { ...prev, ...item });
          }
        }
      }
    }

    // Merge in-memory cache if present and newer
    if (inMemoryCustomProducts && Array.isArray(inMemoryCustomProducts)) {
      for (const item of inMemoryCustomProducts) {
        if (item && item.id) {
          const prev = mergedMap.get(item.id);
          if (!prev) {
            mergedMap.set(item.id, item);
          } else {
            const prevTime = prev.updated_at ? new Date(prev.updated_at).getTime() : 0;
            const currTime = item.updated_at ? new Date(item.updated_at).getTime() : 0;
            if (currTime >= prevTime) {
              mergedMap.set(item.id, { ...prev, ...item });
            }
          }
        }
      }
    }

    const result = Array.from(mergedMap.values());
    inMemoryCustomProducts = result;
    return result;
  } catch (err) {
    console.warn('Error reading custom products file:', err);
    return inMemoryCustomProducts || [];
  }
}

function writeCustomProducts(prods: any[]): void {
  inMemoryCustomProducts = prods;
  const json = JSON.stringify(prods, null, 2);
  try {
    const perm = getProductsFilePath();
    fs.writeFileSync(perm, json, 'utf-8');
  } catch {}
  try {
    fs.writeFileSync(TMP_PRODUCTS_FILE, json, 'utf-8');
  } catch {}
}

function appendInventoryLog(log: any): void {
  try {
    let logs: any[] = [];
    const logPath = fs.existsSync(PERM_LOGS_FILE) ? PERM_LOGS_FILE : TMP_LOGS_FILE;
    if (fs.existsSync(logPath)) {
      const raw = fs.readFileSync(logPath, 'utf-8');
      logs = JSON.parse(raw);
    }
    logs.unshift(log);
    if (logs.length > 200) logs = logs.slice(0, 200);
    const json = JSON.stringify(logs, null, 2);
    try {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(PERM_LOGS_FILE, json, 'utf-8');
    } catch {}
    try {
      fs.writeFileSync(TMP_LOGS_FILE, json, 'utf-8');
    } catch {}
  } catch (err) {
    console.error('Error writing inventory log file:', err);
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: List products for a store, merged with custom products & stock updates
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId') || DEFAULT_STORE_ID;

    // 1. Fetch from Supabase
    let { data: dbProducts } = await supabase
      .from('products')
      .select('*, category:categories(*)')
      .eq('store_id', storeId)
      .is('deleted_at', null)
      .order('name');

    // If empty for this store, try default store products
    if (!dbProducts || dbProducts.length === 0) {
      const { data: defaultProds } = await supabase
        .from('products')
        .select('*, category:categories(*)')
        .eq('store_id', DEFAULT_STORE_ID)
        .is('deleted_at', null)
        .order('name');
      dbProducts = defaultProds || [];
    }

    const customProducts = readCustomProducts();
    const productMap = new Map<string, any>();

    // Add DB products
    for (const p of dbProducts || []) {
      productMap.set(p.id, {
        ...p,
        sell_price: Number(p.sell_price) || 0,
        buy_price: Number(p.buy_price) || 0,
        stock: Number(p.stock) || 0,
        discount_percent: Number(p.discount_percent) || 0,
        min_stock: Number(p.min_stock) || 5,
      });
    }

    // Merge or overlay custom products & stock overrides
    for (const cp of customProducts) {
      if (cp.deleted_at) {
        productMap.delete(cp.id);
        continue;
      }
      if (productMap.has(cp.id)) {
        const existing = productMap.get(cp.id);
        productMap.set(cp.id, {
          ...existing,
          ...cp,
          stock: cp.stock !== undefined ? Number(cp.stock) : existing.stock,
          sell_price: cp.sell_price !== undefined ? Number(cp.sell_price) : existing.sell_price,
          buy_price: cp.buy_price !== undefined ? Number(cp.buy_price) : existing.buy_price,
          discount_percent: cp.discount_percent !== undefined ? Number(cp.discount_percent) : existing.discount_percent,
        });
      } else if (!cp.store_id || cp.store_id === storeId || storeId === DEFAULT_STORE_ID) {
        productMap.set(cp.id, cp);
      }
    }

    const allProducts = Array.from(productMap.values());

    return NextResponse.json({ products: allProducts }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    console.error('Failed to get products:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

// POST: Add new product
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      storeId = DEFAULT_STORE_ID,
      userId = '00000000-0000-4000-8000-000000000001',
      name,
      sku,
      category = 'Makanan & Camilan',
      buy_price = 0,
      sell_price = 0,
      stock = 0,
      min_stock = 5,
      image_url = null,
      category_id = null,
    } = body;

    const cleanName = (name || '').trim();
    if (!cleanName || !sell_price) {
      return NextResponse.json({ error: 'Nama produk dan harga jual wajib diisi' }, { status: 400 });
    }

    const parsedBuy = Number(buy_price) || 0;
    const parsedSell = Number(sell_price) || 0;
    const parsedStock = Math.max(0, parseInt(String(stock), 10) || 0);
    const parsedMinStock = Math.max(1, parseInt(String(min_stock), 10) || 5);

    // Generate valid UUID
    const randomHex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    const newId = `${randomHex()}${randomHex()}-${randomHex()}-4${randomHex().substring(0, 3)}-8${randomHex().substring(0, 3)}-${randomHex()}${randomHex()}${randomHex()}`;

    const now = new Date().toISOString();
    const newProduct = {
      id: newId,
      store_id: storeId,
      name: cleanName,
      sku: sku ? sku.trim() : null,
      category: category || 'Makanan & Camilan',
      buy_price: parsedBuy,
      sell_price: parsedSell,
      discount_percent: 0,
      stock: parsedStock,
      min_stock: parsedMinStock,
      image_url: image_url || null,
      category_id: category_id || null,
      is_active: true,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    // 1. Try Supabase insert
    try {
      const { data: dbCreated, error: dbErr } = await supabase
        .from('products')
        .insert({
          id: newProduct.id,
          store_id: newProduct.store_id,
          name: newProduct.name,
          sku: newProduct.sku,
          buy_price: newProduct.buy_price,
          sell_price: newProduct.sell_price,
          stock: newProduct.stock,
          min_stock: newProduct.min_stock,
          image_url: newProduct.image_url,
          is_active: true,
        })
        .select()
        .single();

      if (!dbErr && dbCreated) {
        newProduct.id = dbCreated.id;
        if (parsedStock > 0) {
          await supabase.from('inventory_logs').insert({
            store_id: storeId,
            product_id: dbCreated.id,
            user_id: userId,
            type: 'RESTOCK',
            quantity_change: parsedStock,
            stock_before: 0,
            stock_after: parsedStock,
            note: 'Stok awal produk baru',
          }).catch(() => {});
        }
      }
    } catch {
      // ignore
    }

    // 2. Save to local fallback cache
    const customs = readCustomProducts();
    customs.push(newProduct);
    writeCustomProducts(customs);

    if (parsedStock > 0) {
      appendInventoryLog({
        id: `log-${Date.now()}`,
        store_id: storeId,
        product_id: newProduct.id,
        user_id: userId,
        type: 'RESTOCK',
        quantity_change: parsedStock,
        stock_before: 0,
        stock_after: parsedStock,
        note: 'Stok awal produk baru',
        created_at: now,
        product: { name: newProduct.name, sku: newProduct.sku },
      });
    }

    return NextResponse.json({ success: true, product: newProduct }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to create product:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

// PUT / PATCH: Update product (price, discount, stock, restock_add, min_stock, etc.)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      storeId = DEFAULT_STORE_ID,
      userId = '00000000-0000-4000-8000-000000000001',
      name,
      sku,
      buy_price,
      sell_price,
      discount_percent,
      stock,
      restock_add,
      min_stock,
      image_url,
      note,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    // First find current state of product
    const customs = readCustomProducts();
    let currentProd = customs.find((p) => p.id === id);

    let currentStock = currentProd ? Number(currentProd.stock) || 0 : 0;

    // Check Supabase if not in custom
    if (!currentProd) {
      const { data: dbItem } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
      if (dbItem) {
        currentStock = Number(dbItem.stock) || 0;
        currentProd = { ...dbItem, stock: currentStock };
      }
    }

    let finalStock = currentStock;
    let qtyChange = 0;
    let logType = 'ADJUSTMENT';

    if (restock_add !== undefined && restock_add !== null) {
      const addQty = parseInt(String(restock_add), 10) || 0;
      if (addQty > 0) {
        finalStock = currentStock + addQty;
        qtyChange = addQty;
        logType = 'RESTOCK';
      }
    } else if (stock !== undefined && stock !== null) {
      finalStock = Math.max(0, parseInt(String(stock), 10) || 0);
      qtyChange = finalStock - currentStock;
      logType = qtyChange >= 0 ? 'RESTOCK' : 'ADJUSTMENT_OUT';
    }

    const now = new Date().toISOString();
    const updatePayload: any = {
      updated_at: now,
    };

    if (name !== undefined) updatePayload.name = name.trim();
    if (sku !== undefined) updatePayload.sku = sku ? sku.trim() : null;
    if (sell_price !== undefined) updatePayload.sell_price = Number(sell_price);
    if (buy_price !== undefined) updatePayload.buy_price = Number(buy_price);
    if (discount_percent !== undefined) updatePayload.discount_percent = Math.min(100, Math.max(0, Number(discount_percent) || 0));
    if (min_stock !== undefined) updatePayload.min_stock = Math.max(1, parseInt(String(min_stock), 10) || 5);
    if (image_url !== undefined) updatePayload.image_url = image_url;
    updatePayload.stock = finalStock;

    // 1. Try Supabase update with client or user bearer token if provided
    try {
      const authHeader = request.headers.get('Authorization');
      const clientToUse = authHeader
        ? createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
            global: { headers: { Authorization: authHeader } },
          })
        : supabase;

      await clientToUse
        .from('products')
        .update(updatePayload)
        .eq('id', id);

      if (qtyChange !== 0) {
        await clientToUse.from('inventory_logs').insert({
          store_id: storeId,
          product_id: id,
          user_id: userId,
          type: logType,
          quantity_change: Math.abs(qtyChange),
          stock_before: currentStock,
          stock_after: finalStock,
          note: note || (logType === 'RESTOCK' ? `Restock +${qtyChange} unit` : `Penyesuaian stok ke ${finalStock}`),
        }).catch(() => {});
      }
    } catch {
      // Supabase error non-fatal, fallback handles it
    }

    // 2. Update local custom products
    let existingIndex = customs.findIndex((p) => p.id === id);
    let updatedProduct: any;

    if (existingIndex >= 0) {
      customs[existingIndex] = {
        ...customs[existingIndex],
        ...updatePayload,
      };
      updatedProduct = customs[existingIndex];
    } else {
      updatedProduct = {
        ...(currentProd || {}),
        id,
        store_id: storeId,
        name: updatePayload.name || currentProd?.name || 'Produk',
        ...updatePayload,
      };
      customs.push(updatedProduct);
    }
    writeCustomProducts(customs);

    // 3. Log inventory change
    if (qtyChange !== 0) {
      appendInventoryLog({
        id: `log-${Date.now()}`,
        store_id: storeId,
        product_id: id,
        user_id: userId,
        type: logType,
        quantity_change: Math.abs(qtyChange),
        stock_before: currentStock,
        stock_after: finalStock,
        note: note || (logType === 'RESTOCK' ? `Restock +${qtyChange} unit` : `Penyesuaian stok ke ${finalStock}`),
        created_at: now,
        product: { name: updatedProduct.name, sku: updatedProduct.sku },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Produk dan stok berhasil diperbarui',
      product: updatedProduct,
      newStock: finalStock,
      stockChanged: qtyChange !== 0,
    });
  } catch (err: any) {
    console.error('Failed to update product:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  return PUT(request);
}

// DELETE: Delete product
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 1. Try Supabase soft delete
    try {
      await supabase
        .from('products')
        .update({ deleted_at: now })
        .eq('id', id);
    } catch {
      // ignore
    }

    // 2. Mark deleted in customs
    const customs = readCustomProducts();
    const idx = customs.findIndex((p) => p.id === id);
    if (idx >= 0) {
      customs[idx].deleted_at = now;
    } else {
      customs.push({ id, deleted_at: now });
    }
    writeCustomProducts(customs);

    return NextResponse.json({ success: true, message: 'Produk berhasil dihapus' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
