import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';

const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());

const EXTRA_STORES_FILE = path.join('/tmp', 'kasirflow_custom_stores.json');
const STORE_PROFILES_FILE = path.join('/tmp', 'kasirflow_store_profiles.json');

export interface StoreItem {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  tax_rate: number;
  logo_url?: string | null;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_MAIN_STORE: StoreItem = {
  id: '2f2af344-ed08-43d2-8bdf-0f9aa412f57c',
  name: 'Aldo Coffe Street',
  slug: 'aldocoffestreet',
  address: 'Klangkapan 2',
  phone: '0895423491442',
  tax_rate: 11,
  logo_url: null,
  created_at: '2026-09-14T15:25:32.517429+00:00',
  updated_at: '2026-10-09T14:53:30.41399+00:00',
};

const DEFAULT_BRANCH_MALIOBORO: StoreItem = {
  id: 'c1111111-2222-3333-4444-555555555551',
  name: 'Aldo Coffe Street - Malioboro',
  slug: 'aldocoffestreet-malioboro',
  address: 'Jl. Malioboro No. 45, Yogyakarta',
  phone: '0895423491442',
  tax_rate: 11,
  logo_url: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

const DEFAULT_BRANCH_KULON_PROGO: StoreItem = {
  id: 'c1111111-2222-3333-4444-555555555552',
  name: 'Aldo Coffe Street - Kulon Progo',
  slug: 'aldocoffestreet-kulonprogo',
  address: 'Jl. Wates Km 12, Kulon Progo',
  phone: '0895423491442',
  tax_rate: 11,
  logo_url: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

function readCustomStores(): StoreItem[] {
  try {
    if (fs.existsSync(EXTRA_STORES_FILE)) {
      const raw = fs.readFileSync(EXTRA_STORES_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Error reading custom stores file:', err);
  }
  return [DEFAULT_BRANCH_MALIOBORO, DEFAULT_BRANCH_KULON_PROGO];
}

function writeCustomStores(stores: StoreItem[]): void {
  try {
    fs.writeFileSync(EXTRA_STORES_FILE, JSON.stringify(stores, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing custom stores file:', err);
  }
}

function readStoreProfiles(): Record<string, any> {
  try {
    if (fs.existsSync(STORE_PROFILES_FILE)) {
      const raw = fs.readFileSync(STORE_PROFILES_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Error reading store profiles file:', err);
  }
  return {};
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: List all branches / stores
export async function GET() {
  try {
    // 1. Fetch from Supabase
    const { data: dbStores } = await supabase.from('stores').select('*').order('created_at');
    const customStores = readCustomStores();
    const profiles = readStoreProfiles();

    const storeMap = new Map<string, StoreItem>();

    // Always include Main Store
    storeMap.set(DEFAULT_MAIN_STORE.id, { ...DEFAULT_MAIN_STORE });

    // Merge Supabase stores
    if (dbStores && dbStores.length > 0) {
      for (const s of dbStores) {
        storeMap.set(s.id, {
          id: s.id,
          name: s.name,
          slug: s.slug || s.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
          address: s.address || null,
          phone: s.phone || null,
          tax_rate: Number(s.tax_rate) || 11,
          logo_url: s.logo_url || null,
          created_at: s.created_at,
          updated_at: s.updated_at,
        });
      }
    }

    // Merge custom branches
    for (const s of customStores) {
      if (!storeMap.has(s.id)) {
        storeMap.set(s.id, s);
      }
    }

    // Overlay user saved profiles
    for (const [key, prof] of Object.entries(profiles)) {
      if (prof?.storeId && storeMap.has(prof.storeId)) {
        const existing = storeMap.get(prof.storeId)!;
        storeMap.set(prof.storeId, {
          ...existing,
          name: prof.name || existing.name,
          address: prof.address !== undefined ? prof.address : existing.address,
          phone: prof.phone !== undefined ? prof.phone : existing.phone,
          tax_rate: prof.tax_rate !== undefined ? prof.tax_rate : existing.tax_rate,
          logo_url: prof.logo_url !== undefined ? prof.logo_url : existing.logo_url,
          user_id: prof.userId || existing.user_id,
        });
      }
    }

    const allStores = Array.from(storeMap.values());

    return NextResponse.json(
      { stores: allStores },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: any) {
    console.error('Failed to list stores:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

// POST: Create a new branch / store
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, address = '', phone = '', taxRate = 11 } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nama cabang toko wajib diisi' }, { status: 400 });
    }

    const cleanName = name.trim();
    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Generate valid UUID
    const randomHex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    const newId = `${randomHex()}${randomHex()}-${randomHex()}-4${randomHex().substring(0, 3)}-8${randomHex().substring(0, 3)}-${randomHex()}${randomHex()}${randomHex()}`;

    const now = new Date().toISOString();
    const newStore: StoreItem = {
      id: newId,
      name: cleanName,
      slug: slug || `cabang-${Date.now().toString(36)}`,
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      tax_rate: Number(taxRate) || 11,
      created_at: now,
      updated_at: now,
    };

    // Save to custom stores
    const custom = readCustomStores();
    custom.push(newStore);
    writeCustomStores(custom);

    // Try saving to Supabase if possible
    try {
      await supabase.from('stores').insert({
        id: newStore.id,
        name: newStore.name,
        slug: newStore.slug,
        address: newStore.address,
        phone: newStore.phone,
        tax_rate: newStore.tax_rate,
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true, store: newStore }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to create store:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
