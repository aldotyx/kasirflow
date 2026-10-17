import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';

const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());

const DEFAULT_REAL_STORE_ID = '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';
const EXTRA_STORES_FILE = path.join('/tmp', 'kasirflow_custom_stores.json');

function getCustomStoreBySlug(slug: string) {
  try {
    if (fs.existsSync(EXTRA_STORES_FILE)) {
      const raw = fs.readFileSync(EXTRA_STORES_FILE, 'utf-8');
      const stores = JSON.parse(raw);
      const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
      return stores.find((s: any) => {
        const sSlug = (s.slug || s.name).toLowerCase().replace(/[^a-z0-9]/g, '');
        return sSlug === cleanSlug || s.id === slug;
      });
    }
  } catch {
    // ignore
  }
  return null;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: returns live synchronized product catalog for customer self-ordering & cashier
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeSlug = searchParams.get('storeSlug') || 'aldocoffestreet';
    const cleanSlug = storeSlug.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Fetch store matching slug or ID
    let store: any = null;

    // Check Supabase store by slug
    const { data: storeBySlug } = await supabase
      .from('stores')
      .select('*')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (storeBySlug) {
      store = storeBySlug;
    } else {
      // Check Supabase store by ID
      const { data: storeById } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeSlug)
        .maybeSingle();
      if (storeById) {
        store = storeById;
      }
    }

    // Check custom branches file if not found in Supabase
    if (!store) {
      const custom = getCustomStoreBySlug(cleanSlug);
      if (custom) {
        store = custom;
      }
    }

    // Fallback to default main store
    if (!store) {
      const { data: defaultStore } = await supabase
        .from('stores')
        .select('*')
        .eq('id', DEFAULT_REAL_STORE_ID)
        .maybeSingle();

      store = defaultStore || {
        id: DEFAULT_REAL_STORE_ID,
        name: 'Aldo Coffe Street',
        slug: 'aldocoffestreet',
        address: 'Klangkapan 2',
        phone: '0895423491442',
        logo_url: null,
      };
    }

    // Merge store profile if saved
    try {
      const STORE_PROFILES_FILE = path.join('/tmp', 'kasirflow_store_profiles.json');
      if (fs.existsSync(STORE_PROFILES_FILE)) {
        const raw = fs.readFileSync(STORE_PROFILES_FILE, 'utf-8');
        const profiles = JSON.parse(raw);
        const p = profiles[store.id] || profiles['default'];
        if (p) {
          store = {
            ...store,
            name: p.name || store.name,
            address: p.address !== undefined ? p.address : store.address,
            phone: p.phone !== undefined ? p.phone : store.phone,
            logo_url: p.logo_url || store.logo_url || null,
          };
        }
      }
    } catch {}

    // 2. Fetch products for this store
    let { data: dbProducts } = await supabase
      .from('products')
      .select('*, category:categories(*)')
      .eq('store_id', store.id)
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name');

    // If branch doesn't have unique products yet, inherit main store products catalog
    if (!dbProducts || dbProducts.length === 0) {
      const { data: mainProducts } = await supabase
        .from('products')
        .select('*, category:categories(*)')
        .eq('store_id', DEFAULT_REAL_STORE_ID)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name');
      dbProducts = mainProducts || [];
    }

    // Overlay custom products and stock with newest file / timestamp merge
    const PERM_PRODUCTS_FILE = path.join(process.cwd(), 'data', 'kasirflow_custom_products.json');
    const TMP_PRODUCTS_FILE = path.join('/tmp', 'kasirflow_custom_products.json');
    let customProducts: any[] = [];
    try {
      let permList: any[] = [];
      let tmpList: any[] = [];
      let permMtime = 0;
      let tmpMtime = 0;

      if (fs.existsSync(PERM_PRODUCTS_FILE)) {
        try {
          const stats = fs.statSync(PERM_PRODUCTS_FILE);
          permMtime = stats.mtimeMs;
          permList = JSON.parse(fs.readFileSync(PERM_PRODUCTS_FILE, 'utf-8'));
        } catch {}
      }
      if (fs.existsSync(TMP_PRODUCTS_FILE)) {
        try {
          const stats = fs.statSync(TMP_PRODUCTS_FILE);
          tmpMtime = stats.mtimeMs;
          tmpList = JSON.parse(fs.readFileSync(TMP_PRODUCTS_FILE, 'utf-8'));
        } catch {}
      }

      const mergedCustoms = new Map<string, any>();
      const combined = permMtime >= tmpMtime ? [...tmpList, ...permList] : [...permList, ...tmpList];
      for (const item of combined) {
        if (item && item.id) {
          if (!mergedCustoms.has(item.id)) {
            mergedCustoms.set(item.id, item);
          } else {
            const prev = mergedCustoms.get(item.id);
            const prevTime = prev.updated_at ? new Date(prev.updated_at).getTime() : 0;
            const currTime = item.updated_at ? new Date(item.updated_at).getTime() : 0;
            if (currTime >= prevTime) {
              mergedCustoms.set(item.id, { ...prev, ...item });
            }
          }
        }
      }
      customProducts = Array.from(mergedCustoms.values());
    } catch {}

    const productMap = new Map<string, any>();
    for (const p of dbProducts || []) {
      productMap.set(p.id, {
        id: p.id,
        name: p.name,
        category: p.category?.name || 'Kopi',
        category_id: p.category_id || null,
        sell_price: Number(p.sell_price) || 0,
        buy_price: Number(p.buy_price) || 0,
        stock: Number(p.stock) || 0,
        description: p.description || '',
        image_url: p.image_url || null,
        discount_percent: Number(p.discount_percent) || 0,
        sku: p.sku || null,
        is_active: p.is_active !== false,
      });
    }

    for (const cp of customProducts) {
      if (cp.deleted_at) {
        productMap.delete(cp.id);
        continue;
      }
      if (productMap.has(cp.id)) {
        const existing = productMap.get(cp.id);
        productMap.set(cp.id, {
          ...existing,
          name: cp.name || existing.name,
          sell_price: cp.sell_price !== undefined ? Number(cp.sell_price) : existing.sell_price,
          buy_price: cp.buy_price !== undefined ? Number(cp.buy_price) : existing.buy_price,
          stock: cp.stock !== undefined ? Number(cp.stock) : existing.stock,
          discount_percent: cp.discount_percent !== undefined ? Number(cp.discount_percent) : existing.discount_percent,
          image_url: cp.image_url !== undefined ? cp.image_url : existing.image_url,
        });
      } else if (!cp.store_id || cp.store_id === store.id || store.id === DEFAULT_REAL_STORE_ID) {
        productMap.set(cp.id, {
          id: cp.id,
          name: cp.name,
          category: cp.category?.name || 'Kopi',
          category_id: cp.category_id || null,
          sell_price: Number(cp.sell_price) || 0,
          buy_price: Number(cp.buy_price) || 0,
          stock: Number(cp.stock) || 0,
          description: cp.description || '',
          image_url: cp.image_url || null,
          discount_percent: Number(cp.discount_percent) || 0,
          sku: cp.sku || null,
          is_active: cp.is_active !== false,
        });
      }
    }

    const formattedProducts = Array.from(productMap.values());

    // Extract unique categories
    const categoriesSet = new Set<string>(['Semua']);
    formattedProducts.forEach((p) => {
      if (p.category) categoriesSet.add(p.category);
    });

    return NextResponse.json(
      {
        store: {
          id: store.id,
          name: store.name || 'Aldo Coffe Street',
          slug: store.slug || 'aldocoffestreet',
          address: store.address || 'Klangkapan 2',
          phone: store.phone || '0895423491442',
          logo_url: store.logo_url || null,
        },
        categories: Array.from(categoriesSet),
        products: formattedProducts,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (err: any) {
    console.error('Failed to get menu:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

// POST: sync or update products from manager to live menu catalog
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { products } = body;
    if (Array.isArray(products) && products.length > 0) {
      const PERM_PRODUCTS_FILE = path.join(process.cwd(), 'data', 'kasirflow_custom_products.json');
      const TMP_PRODUCTS_FILE = path.join('/tmp', 'kasirflow_custom_products.json');
      const json = JSON.stringify(products, null, 2);
      try {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(PERM_PRODUCTS_FILE, json, 'utf-8');
      } catch {}
      try {
        fs.writeFileSync(TMP_PRODUCTS_FILE, json, 'utf-8');
      } catch {}
    }
    return NextResponse.json({ success: true, count: products?.length || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
