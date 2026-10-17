'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Profile, Store } from '@/types/database';

export interface ExtendedStore extends Store {
  slug?: string;
  logo_url?: string | null;
  user_id?: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  store: ExtendedStore | null;
  stores: ExtendedStore[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  loginDemoUser: () => Promise<void>;
  switchStore: (storeId: string) => Promise<void>;
  createBranch: (data: { name: string; address?: string; phone?: string }) => Promise<ExtendedStore>;
  updateStoreProfile: (data: {
    name: string;
    address?: string;
    phone?: string;
    tax_rate?: number;
    logo_url?: string | null;
  }) => Promise<ExtendedStore>;
}

// Valid RFC4122 UUID to prevent "invalid input syntax for type uuid" error in Supabase
const VALID_DEMO_UUID = '00000000-0000-4000-8000-000000000001';

const DEFAULT_DEMO_USER: User = {
  id: VALID_DEMO_UUID,
  app_metadata: {},
  user_metadata: { full_name: 'Aldo (Owner)' },
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
  email: 'aldotyx@gmail.com',
  phone: '0895423491442',
  role: 'authenticated',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const DEFAULT_DEMO_PROFILE: Profile = {
  id: VALID_DEMO_UUID,
  store_id: '2f2af344-ed08-43d2-8bdf-0f9aa412f57c',
  full_name: 'Aldo (Owner)',
  email: 'aldotyx@gmail.com',
  role: 'OWNER',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const DEFAULT_MAIN_STORE: ExtendedStore = {
  id: '2f2af344-ed08-43d2-8bdf-0f9aa412f57c',
  name: 'Aldo Coffe Street',
  slug: 'aldocoffestreet',
  phone: '0895423491442',
  address: 'Klangkapan 2',
  tax_rate: 11,
  created_at: '2026-09-14T15:25:32.517429+00:00',
  updated_at: '2026-10-07T18:14:21.489891+00:00',
};

const INITIAL_BRANCHES: ExtendedStore[] = [
  DEFAULT_MAIN_STORE,
  {
    id: 'c1111111-2222-3333-4444-555555555551',
    name: 'Aldo Coffe Street - Malioboro',
    slug: 'aldocoffestreet-malioboro',
    address: 'Jl. Malioboro No. 45, Yogyakarta',
    phone: '0895423491442',
    tax_rate: 11,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'c1111111-2222-3333-4444-555555555552',
    name: 'Aldo Coffe Street - Kulon Progo',
    slug: 'aldocoffestreet-kulonprogo',
    address: 'Jl. Wates Km 12, Kulon Progo',
    phone: '0895423491442',
    tax_rate: 11,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  },
];

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  store: null,
  stores: INITIAL_BRANCHES,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  loginDemoUser: async () => {},
  switchStore: async () => {},
  createBranch: async () => DEFAULT_MAIN_STORE,
  updateStoreProfile: async () => DEFAULT_MAIN_STORE,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [store, setStore] = useState<ExtendedStore | null>(null);
  const [stores, setStores] = useState<ExtendedStore[]>(INITIAL_BRANCHES);
  const [loading, setLoading] = useState(true);

  // Helper to load saved local profile
  const getSavedProfileOverride = (userId?: string, storeId?: string): Partial<ExtendedStore> | null => {
    if (typeof window === 'undefined') return null;
    try {
      if (userId) {
        const uSaved = localStorage.getItem(`kasirflow_store_profile_${userId}`);
        if (uSaved) return JSON.parse(uSaved);
      }
      if (storeId) {
        const sSaved = localStorage.getItem(`kasirflow_store_profile_${storeId}`);
        if (sSaved) return JSON.parse(sSaved);
      }
      const activeSaved = localStorage.getItem('kasirflow_active_store_profile');
      if (activeSaved) return JSON.parse(activeSaved);
    } catch {}
    return null;
  };

  // Fetch all branches from API
  const loadStores = useCallback(async (): Promise<ExtendedStore[]> => {
    try {
      const res = await fetch('/api/stores');
      if (res.ok) {
        const data = await res.json();
        if (data.stores && data.stores.length > 0) {
          setStores(data.stores);
          return data.stores;
        }
      }
    } catch (err) {
      console.warn('Failed to load stores from API:', err);
    }
    return INITIAL_BRANCHES;
  }, []);

  const applyDemoFallback = useCallback(async () => {
    setUser(DEFAULT_DEMO_USER);
    setProfile(DEFAULT_DEMO_PROFILE);

    const availableStores = await loadStores();
    const savedStoreId = typeof window !== 'undefined' ? localStorage.getItem('kasirflow_active_store_id') : null;
    let initialStore = availableStores.find((s) => s.id === savedStoreId) || availableStores[0] || DEFAULT_MAIN_STORE;

    const savedProfile = getSavedProfileOverride(VALID_DEMO_UUID, initialStore.id);
    if (savedProfile) {
      initialStore = { ...initialStore, ...savedProfile };
    }

    setStore(initialStore);
    setProfile((prev) => (prev ? { ...prev, store_id: initialStore.id } : DEFAULT_DEMO_PROFILE));
  }, [loadStores]);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const availableStores = await loadStores();
      const savedStoreId = typeof window !== 'undefined' ? localStorage.getItem('kasirflow_active_store_id') : null;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData as Profile);
        const targetStoreId = savedStoreId || profileData.store_id || DEFAULT_MAIN_STORE.id;
        let matchedStore = availableStores.find((s) => s.id === targetStoreId) || availableStores[0] || DEFAULT_MAIN_STORE;

        const savedProfile = getSavedProfileOverride(userId, matchedStore.id);
        if (savedProfile) {
          matchedStore = { ...matchedStore, ...savedProfile };
        }

        setStore(matchedStore);
        return;
      } else {
        // Automatically create and link profile for this user
        const targetStoreId = savedStoreId || DEFAULT_MAIN_STORE.id;
        let matchedStore = availableStores.find((s) => s.id === targetStoreId) || availableStores[0] || DEFAULT_MAIN_STORE;

        const savedProfile = getSavedProfileOverride(userId, matchedStore.id);
        if (savedProfile) {
          matchedStore = { ...matchedStore, ...savedProfile };
        }

        const newProfile: Profile = {
          id: userId,
          store_id: matchedStore.id,
          full_name: 'Aldo (Owner)',
          email: 'aldotyx@gmail.com',
          role: 'OWNER',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await supabase.from('profiles').upsert(newProfile).select().maybeSingle().catch(() => {});
        setProfile(newProfile);
        setStore(matchedStore);
        return;
      }
    } catch (err) {
      console.warn('Could not load profile from Supabase, applying default demo store:', err);
    }

    const fallbackProfile: Profile = {
      id: userId || VALID_DEMO_UUID,
      store_id: DEFAULT_MAIN_STORE.id,
      full_name: 'Aldo (Owner)',
      email: 'aldotyx@gmail.com',
      role: 'OWNER',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setProfile(fallbackProfile);
    const savedProfile = getSavedProfileOverride(userId, DEFAULT_MAIN_STORE.id);
    setStore(savedProfile ? { ...DEFAULT_MAIN_STORE, ...savedProfile } : DEFAULT_MAIN_STORE);
  }, [loadStores]);

  // Branch Switcher function
  const switchStore = useCallback(async (storeId: string) => {
    const selected = stores.find((s) => s.id === storeId);
    if (!selected) return;

    if (typeof window !== 'undefined') {
      localStorage.setItem('kasirflow_active_store_id', storeId);
    }

    const savedProfile = getSavedProfileOverride(user?.id, storeId);
    const resolvedStore = savedProfile ? { ...selected, ...savedProfile } : selected;

    setStore(resolvedStore);
    setProfile((prev) => (prev ? { ...prev, store_id: storeId } : null));

    // Try updating profile in DB if user is authenticated
    if (user && user.id !== VALID_DEMO_UUID) {
      await supabase.from('profiles').update({ store_id: storeId }).eq('id', user.id).catch(() => {});
    }
  }, [stores, user]);

  // Create Branch function
  const createBranch = useCallback(async (data: { name: string; address?: string; phone?: string }): Promise<ExtendedStore> => {
    try {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Gagal menambahkan cabang');
      }

      const resData = await res.json();
      const newStore: ExtendedStore = resData.store;

      setStores((prev) => [...prev, newStore]);
      await switchStore(newStore.id);
      return newStore;
    } catch (err: any) {
      throw err;
    }
  }, [switchStore]);

  // Update Store Profile & Logo (Persistent by User ID & Store ID)
  const updateStoreProfile = useCallback(async (data: {
    name: string;
    address?: string;
    phone?: string;
    tax_rate?: number;
    logo_url?: string | null;
  }): Promise<ExtendedStore> => {
    const activeStoreId = store?.id || DEFAULT_MAIN_STORE.id;
    const userId = user?.id || VALID_DEMO_UUID;

    // Call server API for persistence
    try {
      await fetch('/api/stores/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: activeStoreId,
          userId,
          name: data.name,
          logo_url: data.logo_url,
          address: data.address,
          phone: data.phone,
          tax_rate: data.tax_rate,
        }),
      });
    } catch (err) {
      console.warn('API store profile save error:', err);
    }

    const updated: ExtendedStore = {
      ...(store || DEFAULT_MAIN_STORE),
      name: data.name,
      address: data.address !== undefined ? data.address : (store?.address || null),
      phone: data.phone !== undefined ? data.phone : (store?.phone || null),
      tax_rate: data.tax_rate !== undefined ? Number(data.tax_rate) : (store?.tax_rate ?? 11),
      logo_url: data.logo_url !== undefined ? data.logo_url : (store?.logo_url || null),
      updated_at: new Date().toISOString(),
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem(`kasirflow_store_profile_${userId}`, JSON.stringify(updated));
      localStorage.setItem(`kasirflow_store_profile_${activeStoreId}`, JSON.stringify(updated));
      localStorage.setItem('kasirflow_active_store_profile', JSON.stringify(updated));
    }

    setStore(updated);
    setStores((prev) => prev.map((s) => (s.id === activeStoreId ? { ...s, ...updated } : s)));
    return updated;
  }, [store, user]);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const isExplicitlySignedOut = typeof window !== 'undefined' && sessionStorage.getItem('kasirflow_signed_out') === 'true';

        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (session?.user) {
          setSession(session);
          setUser(session.user);
          await loadProfile(session.user.id);
        } else if (!isExplicitlySignedOut) {
          await applyDemoFallback();
        }
      } catch (err) {
        console.warn('Supabase auth getSession unavailable, falling back to demo user:', err);
        const isExplicitlySignedOut = typeof window !== 'undefined' && sessionStorage.getItem('kasirflow_signed_out') === 'true';
        if (!isExplicitlySignedOut && mounted) {
          await applyDemoFallback();
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        loadProfile(session.user.id);
        setLoading(false);
      } else {
        const isExplicitlySignedOut = typeof window !== 'undefined' && sessionStorage.getItem('kasirflow_signed_out') === 'true';
        if (isExplicitlySignedOut) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setStore(null);
        } else {
          applyDemoFallback();
        }
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, applyDemoFallback]);

  const signOut = useCallback(async () => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('kasirflow_signed_out', 'true');
        localStorage.removeItem('kasirflow_active_store_id');
      }
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setProfile(null);
    setStore(null);
    setUser(null);
    setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user && user.id !== VALID_DEMO_UUID) {
      await loadProfile(user.id);
    }
  }, [user, loadProfile]);

  const loginDemoUser = useCallback(async () => {
    setLoading(true);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('kasirflow_signed_out');
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'demo@kasirflow.id',
        password: 'kasirflow123',
      });
      if (!error && data?.user) {
        setSession(data.session);
        setUser(data.user);
        await loadProfile(data.user.id);
        return;
      }
    } catch (err) {
      console.warn('Real Supabase demo login failed, activating mock demo account:', err);
    }
    await applyDemoFallback();
    setLoading(false);
  }, [loadProfile, applyDemoFallback]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        store,
        stores,
        loading,
        signOut,
        refreshProfile,
        loginDemoUser,
        switchStore,
        createBranch,
        updateStoreProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
