'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Store,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Receipt,
  Wallet,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Lock,
  QrCode,
  ChevronDown,
  Check,
  PlusCircle,
  MapPin,
  Building2,
  Phone,
  PanelLeftClose,
  ChefHat,
} from 'lucide-react';
import { toast } from 'sonner';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pos', label: 'Kasir', icon: ShoppingCart },
  { href: '/orders', label: 'Antrean & Dapur', icon: ChefHat },
  { href: '/sales', label: 'Penjualan', icon: Receipt },
  { href: '/products', label: 'Produk & Stok', icon: Package },
  { href: '/tables', label: 'Meja & QR', icon: QrCode },
  { href: '/inventory', label: 'Inventori', icon: Boxes },
  { href: '/expenses', label: 'Pengeluaran', icon: Wallet },
  { href: '/reports', label: 'Laporan', icon: FileText },
  { href: '/settings', label: 'Pengaturan', icon: Settings, isOwnerOnly: true },
];

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  onToggle?: () => void;
}

export function Sidebar({ isOpen = true, onClose, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { profile, store, stores, switchStore, createBranch, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Active queue count for Antrean & Dapur badge
  const [activeQueueCount, setActiveQueueCount] = useState<number>(0);

  useEffect(() => {
    const updateCountFromCache = () => {
      try {
        const cached = localStorage.getItem('kasirflow_table_orders_cache');
        if (cached) {
          const list = JSON.parse(cached);
          if (Array.isArray(list)) {
            const active = list.filter(
              (o: any) => o.status === 'PENDING' || o.status === 'PREPARING'
            ).length;
            setActiveQueueCount(active);
          }
        }
      } catch {}
    };

    updateCountFromCache();
    window.addEventListener('kasirflow:orders-updated', updateCountFromCache);

    const checkActiveOrders = async () => {
      try {
        const res = await fetch('/api/table-orders', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.orders)) {
            const active = data.orders.filter(
              (o: any) => o.status === 'PENDING' || o.status === 'PREPARING'
            ).length;
            setActiveQueueCount(active);
            try {
              localStorage.setItem('kasirflow_table_orders_cache', JSON.stringify(data.orders));
            } catch {}
          }
        }
      } catch {}
    };

    const interval = setInterval(checkActiveOrders, 10000);
    return () => {
      window.removeEventListener('kasirflow:orders-updated', updateCountFromCache);
      clearInterval(interval);
    };
  }, []);

  // New Branch Dialog State
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('');
  const [creatingBranch, setCreatingBranch] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

  const handleSwitchBranch = async (storeId: string) => {
    const selected = stores.find((s) => s.id === storeId);
    setDropdownOpen(false);
    if (selected && selected.id !== store?.id) {
      await switchStore(storeId);
      toast.success(`Beralih ke cabang: ${selected.name}`, {
        description: selected.address ? `Alamat: ${selected.address}` : undefined,
      });
    }
  };

  const handleCreateNewBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) {
      toast.error('Harap masukkan nama cabang');
      return;
    }

    setCreatingBranch(true);
    try {
      const created = await createBranch({
        name: newBranchName.trim(),
        address: newBranchAddress.trim(),
        phone: newBranchPhone.trim(),
      });
      toast.success(`Cabang baru berhasil dibuat!`, {
        description: `Sekarang aktif di: ${created.name}`,
      });
      setNewBranchName('');
      setNewBranchAddress('');
      setNewBranchPhone('');
      setNewBranchOpen(false);
      setDropdownOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Gagal menambahkan cabang');
    } finally {
      setCreatingBranch(false);
    }
  };

  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '??';

  const sidebarContent = (
    <div className="flex h-full flex-col bg-primary text-primary-foreground select-none">
      {/* Sidebar Header */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-primary-foreground/10">
        <div className="flex items-center gap-2.5">
          {store?.logo_url ? (
            <img
              src={store.logo_url}
              alt={store.name || 'Logo'}
              className="h-8 w-8 rounded-lg object-cover border border-primary-foreground/20 bg-white flex-shrink-0"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-foreground/15 text-primary-foreground">
              <Store className="h-4 w-4" />
            </div>
          )}
          <span className="text-base font-extrabold tracking-tight truncate max-w-[140px]" title={store?.name || 'KasirFlow'}>
            {store?.name || 'KasirFlow'}
          </span>
        </div>

        {/* Toggle / Close Button inside Sidebar */}
        <button
          type="button"
          onClick={onClose || onToggle}
          className="p-1.5 rounded-lg text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition cursor-pointer"
          title="Tutup / Sembunyikan Sidebar (Garis Tiga)"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Store Branch Switcher (Multi-Cabang) */}
      <div className="px-3.5 py-3 border-b border-primary-foreground/10 relative">
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <p className="text-[10px] text-primary-foreground/60 uppercase font-bold tracking-wider">
            Toko Aktif &bull; Cabang
          </p>
          <span className="text-[10px] bg-primary-foreground/15 text-primary-foreground px-1.5 py-0.5 rounded font-mono">
            {stores.length} Cabang
          </span>
        </div>

        {/* Dropdown Toggle Button */}
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full flex items-center justify-between gap-2 p-2 rounded-xl bg-primary-foreground/10 hover:bg-primary-foreground/15 transition border border-primary-foreground/10 text-left cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0">
            {store?.logo_url ? (
              <img
                src={store.logo_url}
                alt="Logo"
                className="w-7 h-7 rounded-lg object-cover bg-white border border-primary-foreground/20 flex-shrink-0"
              />
            ) : (
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 flex-shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-primary-foreground truncate">
                {store?.name || 'Aldo Coffe Street'}
              </p>
              {store?.address && (
                <p className="text-[10px] text-primary-foreground/60 truncate flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5 inline" /> {store.address}
                </p>
              )}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-primary-foreground/70 transition-transform flex-shrink-0',
              dropdownOpen && 'rotate-180'
            )}
          />
        </button>

        {/* Dropdown Menu Popup */}
        {dropdownOpen && (
          <div className="absolute left-3.5 right-3.5 top-full mt-1.5 z-50 bg-stone-900 border border-stone-700/80 rounded-2xl shadow-2xl p-2 text-stone-100 animate-in fade-in zoom-in-95 space-y-1">
            <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-stone-400">
              Pilih Cabang Aktif:
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1 scrollbar-thin">
              {stores.map((s) => {
                const isSelected = s.id === store?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSwitchBranch(s.id)}
                    className={cn(
                      'w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition cursor-pointer',
                      isSelected
                        ? 'bg-amber-600 text-white font-bold shadow-sm'
                        : 'hover:bg-stone-800 text-stone-200'
                    )}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate font-semibold">{s.name}</div>
                      {s.address && (
                        <div className="text-[10px] opacity-75 truncate">{s.address}</div>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 flex-shrink-0 text-white" />}
                  </button>
                );
              })}
            </div>

            <Separator className="bg-stone-800 my-1" />

            {/* Button Add New Branch */}
            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                setNewBranchOpen(true);
              }}
              className="w-full flex items-center gap-2 p-2 rounded-xl text-xs font-bold text-amber-400 hover:bg-stone-800/90 transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Tambah Cabang Baru</span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={() => {
                // On mobile screens, automatically close drawer on navigate
                if (typeof window !== 'undefined' && window.innerWidth < 768 && onClose) {
                  onClose();
                }
              }}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-foreground/15 text-primary-foreground font-bold shadow-xs'
                  : 'text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10'
              )}
            >
              <span className="flex-1">{item.label}</span>
              {item.href === '/orders' && activeQueueCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-black bg-amber-400 text-stone-950 shadow-sm animate-pulse">
                  {activeQueueCount}
                </span>
              )}
              {item.isOwnerOnly && (
                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary-foreground/15 text-primary-foreground/90">
                  <Lock className="h-2.5 w-2.5" />
                  Owner
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Info & Logout Footer */}
      <div className="border-t border-primary-foreground/10 p-3.5">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 bg-primary-foreground/10 text-primary-foreground">
            <AvatarFallback className="bg-primary-foreground/20 text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate leading-tight">
              {profile?.full_name || 'Aldo (Owner)'}
            </p>
            <p className="text-xs text-primary-foreground/60 capitalize mt-0.5">
              {profile?.role?.toLowerCase() || 'owner'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 h-8 w-8 cursor-pointer"
            title="Keluar"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Drawer (Layar ponsel < 768px): slide-over dengan backdrop */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={onClose}
          />
          <div className="relative flex w-72 max-w-[85vw] flex-col bg-primary shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop / Laptop / Tablet (Layar >= 768px): NORMAL FLEX COLUMN, TIDAK AKAN PERNAH MENUTUPI KONTEN */}
      <aside
        className={cn(
          'hidden md:flex flex-col shrink-0 bg-primary text-primary-foreground border-r border-primary-foreground/10 transition-all duration-200 select-none',
          isOpen
            ? 'w-64'
            : 'w-0 overflow-hidden border-r-0'
        )}
      >
        <div className="w-64 h-full flex flex-col">
          {sidebarContent}
        </div>
      </aside>

      {/* Dialog Modal: Tambah Cabang Baru */}
      <Dialog open={newBranchOpen} onOpenChange={setNewBranchOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-stone-900 dark:text-foreground">
              <Building2 className="w-5 h-5 text-amber-600" /> Tambah Cabang Baru
            </DialogTitle>
            <DialogDescription>
              Daftarkan cabang baru untuk toko Anda. Pesanan meja dan transaksi kasir akan terpisah secara otomatis.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateNewBranch} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                Nama Cabang <span className="text-rose-500">*</span>
              </label>
              <Input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="Contoh: Aldo Coffe Street - Malioboro"
                className="rounded-xl text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-stone-400" /> Alamat Cabang
              </label>
              <Input
                value={newBranchAddress}
                onChange={(e) => setNewBranchAddress(e.target.value)}
                placeholder="Contoh: Jl. Malioboro No. 45, Yogyakarta"
                className="rounded-xl text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-stone-400" /> No. Telepon / WhatsApp
              </label>
              <Input
                value={newBranchPhone}
                onChange={(e) => setNewBranchPhone(e.target.value)}
                placeholder="Contoh: 0895423491442"
                className="rounded-xl text-sm"
              />
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewBranchOpen(false)}
                className="rounded-xl text-xs"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={creatingBranch || !newBranchName.trim()}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
              >
                {creatingBranch ? 'Menyimpan...' : 'Simpan & Beralih ke Cabang Ini'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
