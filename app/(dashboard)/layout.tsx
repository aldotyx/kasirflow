'use client';

import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/shared/sidebar';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, ArrowRight, Menu, Store, Building2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, store, loading } = useAuth();
  const router = useRouter();
  const [showRedirectAction, setShowRedirectAction] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Load saved sidebar state preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kasirflow_sidebar_open');
      if (saved !== null) {
        setSidebarOpen(saved === 'true');
      } else {
        // Default: open on desktop & laptop (>= 768px), closed on mobile (< 768px)
        setSidebarOpen(window.innerWidth >= 768);
      }
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('kasirflow_sidebar_open', String(next));
      }
      return next;
    });
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('kasirflow_sidebar_open', 'false');
    }
  };

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }

    // Safety timeout: if after 1.2s still unauthenticated, trigger redirect and show button
    const timer = setTimeout(() => {
      if (!user) {
        router.replace('/login');
        setShowRedirectAction(true);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="text-sm font-medium text-muted-foreground">
          {loading ? 'Memverifikasi akun kasir...' : 'Mengarahkan ke halaman masuk...'}
        </p>

        {showRedirectAction && (
          <div className="mt-4">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Masuk ke Akun
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* UNIFIED TOP BAR (AKTIF DI LAPTOP, TABLET, DAN PONSEL) */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between bg-primary px-3 sm:px-4 text-primary-foreground shadow-sm shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* TOMBOL GARIS TIGA (HAMBURGER MENU) - KONSISTEN DI SEMUA PERANGKAT */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Toggle Menu Sidebar"
            className="p-2 rounded-xl text-primary-foreground hover:bg-primary-foreground/15 active:scale-95 transition-all cursor-pointer flex items-center justify-center border border-primary-foreground/10"
            title={sidebarOpen ? 'Tutup / Sembunyikan Sidebar' : 'Buka Sidebar'}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2.5">
            {store?.logo_url ? (
              <img
                src={store.logo_url}
                alt={store.name || 'Logo Toko'}
                className="h-8 w-8 rounded-lg object-cover border border-primary-foreground/20 bg-white shadow-xs flex-shrink-0"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-foreground/15 text-primary-foreground flex-shrink-0">
                <Store className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-extrabold text-sm tracking-tight leading-tight truncate max-w-[200px] sm:max-w-xs">
                {store?.name || 'KasirFlow'}
              </div>
              <p className="text-[10px] text-primary-foreground/70 hidden sm:block leading-none mt-0.5">
                Sistem Kasir POS &amp; Self-Order
              </p>
            </div>
          </div>
        </div>

        {/* Info Cabang & Role Akun di Kanan */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {store?.address && (
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] bg-primary-foreground/10 text-primary-foreground/90 px-2.5 py-1 rounded-full font-medium">
              <Building2 className="w-3 h-3 text-amber-300" />
              {store.address}
            </span>
          )}
          <span className="text-[11px] font-bold uppercase tracking-wider bg-primary-foreground/20 text-primary-foreground px-2.5 py-0.5 rounded-full border border-primary-foreground/15">
            {profile?.role || 'OWNER'}
          </span>
        </div>
      </header>

      {/* WORKSPACE FLEX CONTAINER: SIDEBAR & MAIN CONTENT BERDAMPINGAN SECARA ALAMI */}
      <div className="flex-1 flex min-h-[calc(100vh-3.5rem)] w-full overflow-hidden">
        {/* SIDEBAR NAVIGATION (DRAWER DI MOBILE, DOCKED FLEX COLUMN DI LAPTOP/TABLET) */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          onToggle={toggleSidebar}
        />

        {/* MAIN CONTENT AREA - TIDAK AKAN PERNAH TERTUTUP ATAU KEPOTONG */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
