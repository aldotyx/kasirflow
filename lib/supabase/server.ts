import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getSupabaseUrl, getSupabaseAnonKey } from './config';

export function createServerClient(token?: string) {
  return createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
    },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}
