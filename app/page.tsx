'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    // If not loading, route immediately
    if (!loading) {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
      return;
    }

    // Safety timeout: if checking auth takes longer than 1 second, route to /login or show fallback
    const timer = setTimeout(() => {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
      setShowFallback(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-sm text-muted-foreground font-medium mb-2">
        Memuat KasirFlow...
      </p>

      {showFallback && (
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Buka Halaman Masuk
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
          <Link
            href="/pos"
            className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-xs font-semibold hover:bg-muted"
          >
            Buka Kasir (POS)
          </Link>
        </div>
      )}
    </div>
  );
}
