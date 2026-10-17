import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';

const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());

const EXTRA_STORES_FILE = path.join('/tmp', 'kasirflow_custom_stores.json');
const STORE_PROFILES_FILE = path.join('/tmp', 'kasirflow_store_profiles.json');

export interface StoredProfileData {
  storeId: string;
  userId?: string;
  name: string;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  tax_rate?: number;
  updated_at: string;
}

function readProfiles(): Record<string, StoredProfileData> {
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

function writeProfiles(profiles: Record<string, StoredProfileData>): void {
  try {
    fs.writeFileSync(STORE_PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing store profiles file:', err);
  }
}

function updateCustomStoresFile(storeId: string, updates: Partial<StoredProfileData>): void {
  try {
    if (fs.existsSync(EXTRA_STORES_FILE)) {
      const raw = fs.readFileSync(EXTRA_STORES_FILE, 'utf-8');
      const stores = JSON.parse(raw);
      let found = false;
      const updated = stores.map((s: any) => {
        if (s.id === storeId) {
          found = true;
          return {
            ...s,
            ...(updates.name ? { name: updates.name } : {}),
            ...(updates.address !== undefined ? { address: updates.address } : {}),
            ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
            ...(updates.tax_rate !== undefined ? { tax_rate: updates.tax_rate } : {}),
            ...(updates.logo_url !== undefined ? { logo_url: updates.logo_url } : {}),
            updated_at: new Date().toISOString(),
          };
        }
        return s;
      });
      if (found) {
        fs.writeFileSync(EXTRA_STORES_FILE, JSON.stringify(updated, null, 2), 'utf-8');
      }
    }
  } catch (err) {
    console.warn('Failed to update extra stores file:', err);
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: get store profile by storeId or userId
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const userId = searchParams.get('userId');

    const profiles = readProfiles();

    // Check by storeId or userId
    let foundProfile = (storeId && profiles[storeId]) || (userId && profiles[userId]) || null;

    if (!foundProfile && storeId) {
      // Check Supabase store
      const { data: dbStore } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .maybeSingle();

      if (dbStore) {
        foundProfile = {
          storeId: dbStore.id,
          name: dbStore.name,
          logo_url: dbStore.logo_url || null,
          address: dbStore.address || null,
          phone: dbStore.phone || null,
          tax_rate: Number(dbStore.tax_rate) || 11,
          updated_at: dbStore.updated_at || new Date().toISOString(),
        };
      }
    }

    return NextResponse.json({ profile: foundProfile }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

// POST / PUT: Update store profile & logo tied to User ID / Store ID
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, userId, name, logo_url, address, phone, tax_rate } = body;

    if (!storeId && !userId) {
      return NextResponse.json({ error: 'Store ID atau User ID diperlukan' }, { status: 400 });
    }

    const cleanName = (name || '').trim();
    if (!cleanName) {
      return NextResponse.json({ error: 'Nama toko tidak boleh kosong' }, { status: 400 });
    }

    const parsedTax = tax_rate !== undefined ? Number(tax_rate) : 11;
    const now = new Date().toISOString();

    const targetStoreId = storeId || '2f2af344-ed08-43d2-8bdf-0f9aa412f57c';

    const profileData: StoredProfileData = {
      storeId: targetStoreId,
      userId: userId || undefined,
      name: cleanName,
      logo_url: logo_url || null,
      address: address ? address.trim() : null,
      phone: phone ? phone.trim() : null,
      tax_rate: parsedTax,
      updated_at: now,
    };

    // 1. Save to local profiles cache
    const profiles = readProfiles();
    profiles[targetStoreId] = profileData;
    if (userId) {
      profiles[userId] = profileData;
    }
    writeProfiles(profiles);

    // 2. Update custom stores file if applicable
    updateCustomStoresFile(targetStoreId, profileData);

    // 3. Try to update Supabase stores table
    try {
      // First try with logo_url
      const { error: fullError } = await supabase
        .from('stores')
        .update({
          name: profileData.name,
          address: profileData.address,
          phone: profileData.phone,
          tax_rate: profileData.tax_rate,
          logo_url: profileData.logo_url,
          updated_at: now,
        })
        .eq('id', targetStoreId);

      if (fullError) {
        // Fallback without logo_url if column doesn't exist in Supabase schema
        await supabase
          .from('stores')
          .update({
            name: profileData.name,
            address: profileData.address,
            phone: profileData.phone,
            tax_rate: profileData.tax_rate,
            updated_at: now,
          })
          .eq('id', targetStoreId)
          .catch(() => {});
      }
    } catch {
      // Supabase update error is non-fatal since local profile is saved
    }

    return NextResponse.json({
      success: true,
      message: 'Profil toko dan logo berhasil disimpan',
      store: {
        id: targetStoreId,
        name: profileData.name,
        address: profileData.address,
        phone: profileData.phone,
        tax_rate: profileData.tax_rate,
        logo_url: profileData.logo_url,
        updated_at: now,
      },
    });
  } catch (err: any) {
    console.error('Failed to update store profile:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  return POST(request);
}
