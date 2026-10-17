'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <div className="max-w-md w-full p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <span className="inline-block px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold tracking-wide uppercase mb-4">
          404 - Halaman Tidak Ditemukan
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Halaman Tidak Tersedia</h1>
        <p className="text-sm text-slate-600 mb-6">
          Halaman yang Anda cari mungkin telah dipindahkan atau tautan yang dimasukkan salah.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex justify-center items-center px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Ke Dashboard
          </Link>
          <Link
            href="/pos"
            className="inline-flex justify-center items-center px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors"
          >
            Buka Kasir (POS)
          </Link>
        </div>
      </div>
    </div>
  );
}
