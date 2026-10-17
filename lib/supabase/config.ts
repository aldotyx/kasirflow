import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const FALLBACK_SUPABASE_URL = 'https://rgtltgnfgjbntrgeavrx.supabase.co';
export const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_avfXd8dAWMY50sYfSvmMtg_ACwPtRt_';

export function getSupabaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (typeof envUrl === 'string') {
    const trimmed = envUrl.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
  }
  return FALLBACK_SUPABASE_URL;
}

export function getSupabaseAnonKey(): string {
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (typeof envKey === 'string') {
    const trimmed = envKey.trim();
    if (trimmed.length > 10 && trimmed !== 'undefined' && trimmed !== 'null') {
      return trimmed;
    }
  }
  return FALLBACK_SUPABASE_ANON_KEY;
}

export function getSupabaseServerClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (serviceKey && typeof serviceKey === 'string' && serviceKey.trim().length > 10) {
    return createClient(url, serviceKey.trim(), {
      auth: { persistSession: false },
    });
  }
  return createClient(url, getSupabaseAnonKey(), {
    auth: { persistSession: false },
  });
}
