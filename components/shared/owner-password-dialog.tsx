'use client';

import { useState } from 'react';
import { Loader2, LockKeyhole, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface OwnerPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
  title?: string;
  description?: string;
}

export function OwnerPasswordDialog({
  open,
  onOpenChange,
  onVerified,
  title = 'Verifikasi Sandi Owner',
  description = 'Masukkan kata sandi akun owner atau PIN otorisasi toko untuk mengakses menu aksi.',
}: OwnerPasswordDialogProps) {
  const { profile } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const verifyPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanInput = password.trim();

    if (!cleanInput) {
      toast.error('Kata sandi atau PIN wajib diisi');
      return;
    }

    setSubmitting(true);

    // 1. Check against configurable Owner PIN in localStorage
    const savedPin = typeof window !== 'undefined' ? localStorage.getItem('kasirflow_owner_pin') : null;
    const activePin = savedPin || '123456';

    if (cleanInput === activePin) {
      setSubmitting(false);
      setPassword('');
      onOpenChange(false);
      toast.success('Otorisasi owner berhasil');
      onVerified();
      return;
    }

    // 2. Otherwise, check Supabase authentication password
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
          password: cleanInput,
        });

        if (!error) {
          setSubmitting(false);
          setPassword('');
          onOpenChange(false);
          toast.success('Otorisasi owner berhasil');
          onVerified();
          return;
        }
      }
    } catch {
      // Ignored, proceed to fail message
    }

    setSubmitting(false);
    toast.error('Kata sandi atau PIN salah. Pastikan PIN atau sandi owner benar.');
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !submitting && onOpenChange(value)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-lg">{title}</DialogTitle>
          <DialogDescription className="text-center text-sm">{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={verifyPassword} className="space-y-4 pt-2">
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Masukkan PIN toko atau password owner"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-10"
              autoFocus
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>
              Perlindungan aksi: Mencegah karyawan salah pencet. Masukkan PIN toko (Default: <strong className="font-mono text-foreground">123456</strong>, dapat diubah di menu Pengaturan) atau kata sandi login Owner.
            </span>
          </div>

          <DialogFooter className="flex sm:justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPassword('');
                onOpenChange(false);
              }}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Buka Akses
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

