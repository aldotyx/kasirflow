'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ShieldCheck,
  LockKeyhole,
  Save,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
  Store,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Image as ImageIcon,
  Trash2,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { VoiceSettingsCard } from '@/components/settings/voice-settings-card';
import { PrinterSettingsCard } from '@/components/settings/printer-settings-card';

export default function SettingsPage() {
  const { store, profile, user, updateStoreProfile } = useAuth();

  // Authentication gate state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockInput, setUnlockInput] = useState('');
  const [showUnlockSecret, setShowUnlockSecret] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Store profile fields
  const [name, setName] = useState(store?.name ?? '');
  const [address, setAddress] = useState(store?.address ?? '');
  const [phone, setPhone] = useState(store?.phone ?? '');
  const [taxRate, setTaxRate] = useState(String(store?.tax_rate ?? 0));
  const [logoUrl, setLogoUrl] = useState(store?.logo_url ?? '');
  const [savingStore, setSavingStore] = useState(false);

  // PIN Management states
  const [currentActivePin, setCurrentActivePin] = useState('123456');
  const [verifyOldPin, setVerifyOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPinFields, setShowPinFields] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    if (store) {
      setName(store.name ?? '');
      setAddress(store.address ?? '');
      setPhone(store.phone ?? '');
      setTaxRate(String(store.tax_rate ?? 0));
      setLogoUrl(store.logo_url ?? '');
    }
  }, [store]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedPin = localStorage.getItem('kasirflow_owner_pin');
      if (storedPin) {
        setCurrentActivePin(storedPin);
      }
      // Check if unlocked during this browser session
      const sessionUnlocked = sessionStorage.getItem('kasirflow_settings_unlocked');
      if (sessionUnlocked === 'true') {
        setIsUnlocked(true);
      }
    }
  }, []);

  // Unlock gate verification
  const handleUnlockGate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSecret = unlockInput.trim();
    if (!cleanSecret) {
      toast.error('Masukkan PIN toko atau kata sandi owner');
      return;
    }

    setVerifying(true);

    // 1. Check current PIN
    const savedPin = typeof window !== 'undefined' ? localStorage.getItem('kasirflow_owner_pin') : null;
    const activePin = savedPin || '123456';

    if (cleanSecret === activePin) {
      setVerifying(false);
      setIsUnlocked(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('kasirflow_settings_unlocked', 'true');
      }
      setUnlockInput('');
      toast.success('Akses Pengaturan Terverifikasi sebagai Owner');
      return;
    }

    // 2. Check Supabase Owner Account Password
    try {
      let targetEmail = profile?.email;
      if (profile?.store_id && profile.role !== 'OWNER') {
        const { data: ownerProf } = await supabase
          .from('profiles')
          .select('email')
          .eq('store_id', profile.store_id)
          .eq('role', 'OWNER')
          .maybeSingle();
        if (ownerProf?.email) {
          targetEmail = ownerProf.email;
        }
      }

      if (targetEmail) {
        const { error } = await supabase.auth.signInWithPassword({
          email: targetEmail,
          password: cleanSecret,
        });

        if (!error) {
          setVerifying(false);
          setIsUnlocked(true);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('kasirflow_settings_unlocked', 'true');
          }
          setUnlockInput('');
          toast.success('Akses Pengaturan Terverifikasi sebagai Owner');
          return;
        }
      }
    } catch {
      // ignore
    }

    setVerifying(false);
    toast.error('PIN atau kata sandi salah. Hanya Owner yang dapat mengakses halaman ini.');
  };

  // Lock settings page again
  const handleLockSettings = () => {
    setIsUnlocked(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('kasirflow_settings_unlocked');
    }
    toast.info('Halaman Pengaturan telah dikunci kembali.');
  };

  // Upload or convert logo file to data URL
  const handleLogoUpload = (file: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ukuran file logo maksimal 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setLogoUrl(dataUrl);
        toast.success('Logo baru dipilih. Klik "Simpan Informasi Toko" untuk menerapkan.');
      }
    };
    reader.readAsDataURL(file);
  };

  // Save store profile & logo tied to User ID & Store ID
  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Nama toko wajib diisi');
      return;
    }
    setSavingStore(true);
    try {
      const parsedTax = parseFloat(taxRate) || 0;
      await updateStoreProfile({
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        tax_rate: parsedTax,
        logo_url: logoUrl.trim() || null,
      });
      toast.success('Informasi toko dan logo berhasil disimpan!');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan profil toko');
    } finally {
      setSavingStore(false);
    }
  };

  // Change security PIN (Requires old PIN verification)
  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOld = verifyOldPin.trim();
    const cleanNew = newPin.trim();
    const cleanConfirm = confirmPin.trim();

    // Verify current PIN first
    const savedPin = typeof window !== 'undefined' ? localStorage.getItem('kasirflow_owner_pin') : null;
    const activePin = savedPin || '123456';

    if (cleanOld !== activePin) {
      toast.error('PIN Lama / Saat ini yang Anda masukkan salah.');
      return;
    }

    if (cleanNew.length < 4) {
      toast.error('PIN Baru minimal 4 karakter / digit.');
      return;
    }

    if (cleanNew !== cleanConfirm) {
      toast.error('Konfirmasi PIN Baru tidak cocok.');
      return;
    }

    setSavingPin(true);
    localStorage.setItem('kasirflow_owner_pin', cleanNew);
    setCurrentActivePin(cleanNew);

    setTimeout(() => {
      setSavingPin(false);
      setVerifyOldPin('');
      setNewPin('');
      setConfirmPin('');
      toast.success('PIN Otorisasi Owner berhasil diperbarui!');
    }, 250);
  };

  // -------------------------------------------------------------
  // VIEW 1: LOCKED GATE SCREEN (When accessed by employee or locked)
  // -------------------------------------------------------------
  if (!isUnlocked) {
    return (
      <div className="p-4 lg:p-8 flex items-center justify-center min-h-[calc(100vh-5rem)]">
        <Card className="w-full max-w-md shadow-md border-primary/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
              <Lock className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl">Akses Khusus Pemilik Toko</CardTitle>
            <CardDescription className="text-sm">
              Menu Pengaturan berisi data rahasia toko dan sandi keamanan. Masukkan PIN otorisasi toko atau kata sandi Owner untuk membuka.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <form onSubmit={handleUnlockGate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                  PIN Otorisasi / Sandi Owner
                </label>
                <div className="relative">
                  <Input
                    type={showUnlockSecret ? 'text' : 'password'}
                    placeholder="Masukkan PIN atau password owner"
                    value={unlockInput}
                    onChange={(e) => setUnlockInput(e.target.value)}
                    className="pr-10 font-mono"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowUnlockSecret(!showUnlockSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showUnlockSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Default PIN awal: <span className="font-mono font-bold text-foreground">123456</span>. Karyawan yang tidak mengetahui PIN tidak dapat mengakses menu ini.
                </p>
              </div>

              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <span>
                  Proteksi aktif: Mencegah staf atau kasir mengubah profil usaha, tarif struk, atau memanipulasi PIN aksi.
                </span>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <Button type="submit" disabled={verifying} className="w-full">
                  <Unlock className="mr-2 h-4 w-4" />
                  {verifying ? 'Memverifikasi...' : 'Buka Pengaturan Toko'}
                </Button>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/pos" prefetch={false}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Kembali ke Kasir (POS)
                  </Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: UNLOCKED SETTINGS (Owner verified)
  // -------------------------------------------------------------
  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl">
      {/* Top Header with Lock Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-4 rounded-xl border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Pengaturan Toko & Keamanan</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 border border-emerald-500/20">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Akses Owner Terbuka
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Kelola identitas struk kasir, profil usaha, serta konfigurasi PIN otorisasi aksi.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={handleLockSettings}
          className="border-primary/40 text-primary hover:bg-primary/10"
        >
          <Lock className="mr-2 h-4 w-4" />
          Kunci Kembali Halaman Ini
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Store Profile & Logo Card */}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Identitas & Logo Toko</CardTitle>
                  <CardDescription>Nama &amp; logo dicetak di nota kasir, struk belanja, dan dashboard.</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* User ID & Owner Connection Banner */}
            <div className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
                <UserCheck className="h-4 w-4 text-amber-600" />
                <span>Terhubung ke Akun Owner (User ID):</span>
              </div>
              <p className="font-mono text-[11px] text-amber-800 dark:text-amber-300 break-all bg-background/50 px-2 py-1 rounded border border-amber-500/20">
                {user?.id || '00000000-0000-4000-8000-000000000001'}
              </p>
              <p className="text-[11px] text-muted-foreground pt-0.5">
                Email: <span className="font-semibold text-foreground">{user?.email || profile?.email || 'aldotyx@gmail.com'}</span> &bull; Semua perubahan nama toko dan logo langsung terikat permanen dengan akun ini.
              </p>
            </div>

            <form onSubmit={handleSaveStore} className="space-y-4">
              {/* Logo Preview & Customization */}
              <div className="rounded-xl border bg-muted/30 p-3.5 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Logo Toko
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="relative flex-shrink-0">
                    {logoUrl ? (
                      <div className="relative group">
                        <img
                          src={logoUrl}
                          alt="Logo Toko"
                          className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover border-2 border-primary/30 shadow-md bg-white"
                          onError={() => {
                            toast.error('URL gambar logo tidak valid');
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setLogoUrl('')}
                          className="absolute -top-2 -right-2 p-1 rounded-full bg-destructive text-white hover:bg-destructive/90 shadow transition"
                          title="Hapus Logo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl border-2 border-dashed border-muted-foreground/40 flex flex-col items-center justify-center bg-background text-muted-foreground">
                        <ImageIcon className="h-6 w-6 mb-1 opacity-50" />
                        <span className="text-[10px] font-medium">Belum ada</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 w-full space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-sm transition">
                        <Upload className="h-3.5 w-3.5" />
                        Pilih Gambar Logo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleLogoUpload(e.target.files?.[0] || null)}
                        />
                      </label>
                      {logoUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setLogoUrl('')}
                          className="text-xs text-destructive hover:bg-destructive/10 h-8 px-2.5"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Hapus Logo
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Format PNG, JPG, atau WebP (maks 2MB). Atau masukkan link URL gambar:
                    </p>
                    <Input
                      placeholder="https://... (URL gambar logo)"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>
                </div>

                {/* Preset Logos for Coffee, Food & Retail */}
                <div className="pt-1">
                  <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1 font-medium">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    Atau gunakan contoh logo siap pakai:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { name: 'Kopi Klasik', url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=160&auto=format&fit=crop&q=80' },
                      { name: 'Modern Cafe', url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=160&auto=format&fit=crop&q=80' },
                      { name: 'Retail Store', url: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=160&auto=format&fit=crop&q=80' },
                      { name: 'Bistro & Bakery', url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=160&auto=format&fit=crop&q=80' },
                    ].map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setLogoUrl(p.url);
                          toast.success(`Logo "${p.name}" dipilih`);
                        }}
                        className="text-[10px] font-medium px-2 py-1 rounded-md border bg-background hover:bg-accent text-foreground transition flex items-center gap-1"
                      >
                        <img src={p.url} alt={p.name} className="w-3.5 h-3.5 rounded object-cover" />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Nama Toko / Usaha</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Aldo Coffe Street"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Alamat Lengkap</label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Contoh: Jl. Malioboro No. 45, Yogyakarta"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">No. Telepon / WhatsApp</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Contoh: 0895423491442"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Tarif Pajak Penjualan (%)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  placeholder="Contoh: 0 atau 11"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Masukkan 0 jika harga produk sudah termasuk pajak atau tidak menerapkan pajak.
                </p>
              </div>
              <Button type="submit" disabled={savingStore} className="w-full sm:w-auto">
                <Save className="mr-2 h-4 w-4" />
                {savingStore ? 'Menyimpan...' : 'Simpan Informasi & Logo Toko'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Security & Owner PIN Card */}
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-md bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Ganti PIN Otorisasi Aksi</CardTitle>
                <CardDescription>Proteksi menu titik tiga pada Produk & Stok.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePin} className="space-y-4">
              <div className="rounded-lg bg-muted/60 p-3 text-xs space-y-1.5 border">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status Proteksi:</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Aktif
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">PIN Aktif Saat Ini:</span>
                  <span className="font-mono font-bold tracking-widest bg-background px-2 py-0.5 rounded border">
                    {currentActivePin.replace(/./g, '•')}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  1. Masukkan PIN Lama / Saat Ini <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Input
                    type={showPinFields ? 'text' : 'password'}
                    value={verifyOldPin}
                    onChange={(e) => setVerifyOldPin(e.target.value)}
                    placeholder="Masukkan PIN saat ini (default: 123456)"
                    className="font-mono tracking-widest pl-10"
                    required
                  />
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  2. Masukkan PIN Baru <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Input
                    type={showPinFields ? 'text' : 'password'}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="Minimal 4 digit angka/sandi"
                    className="font-mono tracking-widest pl-10"
                    maxLength={10}
                    required
                  />
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  3. Konfirmasi PIN Baru <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Input
                    type={showPinFields ? 'text' : 'password'}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    placeholder="Ketik ulang PIN baru"
                    className="font-mono tracking-widest pl-10"
                    maxLength={10}
                    required
                  />
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setShowPinFields(!showPinFields)}
                  className="text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  {showPinFields ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showPinFields ? 'Sembunyikan Digit PIN' : 'Tampilkan Digit PIN'}
                </button>
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1 border">
                <p className="font-semibold text-foreground">💡 Keamanan PIN Ganda:</p>
                <p>
                  Perubahan PIN mewajibkan verifikasi PIN lama terlebih dahulu, sehingga karyawan atau kasir tidak dapat mengganti PIN seenaknya meskipun layar sempat ditinggalkan.
                </p>
              </div>

              <Button type="submit" disabled={savingPin} variant="default" className="w-full">
                <Save className="mr-2 h-4 w-4" />
                {savingPin ? 'Menyimpan PIN...' : 'Simpan & Terapkan PIN Baru'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Bluetooth Thermal Printer Settings */}
      <div className="pt-2">
        <PrinterSettingsCard storeName={store?.name} />
      </div>

      {/* Voice Notification Soundbox Settings */}
      <div className="pt-2">
        <VoiceSettingsCard storeName={store?.name} />
      </div>
    </div>
  );
}
