'use client';

import { useState, useMemo } from 'react';
import { useVoiceSettings } from '@/hooks/use-voice-settings';
import { formatPaymentAnnouncement, VoiceTemplateStyle } from '@/lib/voice-service';
import { terbilangRupiah } from '@/lib/terbilang';
import { formatCurrency } from '@/lib/calculations';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Volume2,
  VolumeX,
  Play,
  Square,
  Sparkles,
  BellRing,
  Languages,
  CheckCircle2,
  Info,
  Radio,
} from 'lucide-react';
import { toast } from 'sonner';

interface VoiceSettingsCardProps {
  storeName?: string;
}

export function VoiceSettingsCard({ storeName = 'Toko Kami' }: VoiceSettingsCardProps) {
  const {
    config,
    voices,
    isSpeaking,
    isSupported,
    updateConfig,
    toggleEnabled,
    testAnnouncement,
    stop,
  } = useVoiceSettings();

  const [testAmount, setTestAmount] = useState<number>(125000);
  const [testMethod, setTestMethod] = useState<string>('QRIS');

  // Filter Indonesian voices or all voices
  const indonesianVoices = useMemo(() => {
    return voices.filter(
      (v) =>
        v.lang.toLowerCase().startsWith('id') ||
        v.name.toLowerCase().includes('indonesia')
    );
  }, [voices]);

  // Real-time preview of spoken sentence
  const previewSentence = useMemo(() => {
    return formatPaymentAnnouncement(testAmount, {
      storeName: storeName || 'Toko Kami',
      paymentMethod: testMethod,
      template: config.template,
      announcePaymentMethod: config.announcePaymentMethod,
    });
  }, [testAmount, storeName, testMethod, config.template, config.announcePaymentMethod]);

  const handlePlayTest = async () => {
    if (!isSupported) {
      toast.error('Browser ini tidak mendukung Web Speech API');
      return;
    }
    toast.info('Memutar suara notifikasi...');
    await testAnnouncement(testAmount, storeName, testMethod);
  };

  const quickAmounts = [25000, 50000, 100000, 250000, 1500000];

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Volume2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Suara Notifikasi Kasir (Soundbox Transaksi)</CardTitle>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    config.enabled
                      ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {config.enabled ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
              <CardDescription className="text-xs sm:text-sm">
                Mengucapkan nominal pembayaran otomatis dalam Bahasa Indonesia saat transaksi selesai layaknya mesin soundbox.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs text-muted-foreground">Aktifkan Suara</span>
            <Switch
              checked={config.enabled}
              onCheckedChange={(val) => {
                updateConfig({ enabled: val });
                toast.success(val ? 'Suara notifikasi kasir diaktifkan' : 'Suara notifikasi kasir dinonaktifkan');
              }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Main Settings Form */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Template Style */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Gaya Kalimat Pengumuman
            </label>
            <Select
              value={config.template}
              onValueChange={(val: VoiceTemplateStyle) => updateConfig({ template: val })}
              disabled={!config.enabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih gaya kalimat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="polite">
                  Sopan & Elegan (Terima kasih, pembayaran sebesar... telah diterima)
                </SelectItem>
                <SelectItem value="standard">
                  Standar POS (Pembayaran berhasil, ... rupiah)
                </SelectItem>
                <SelectItem value="store_name">
                  Identitas Toko (Terima kasih telah berbelanja di {storeName}...)
                </SelectItem>
                <SelectItem value="short">
                  Singkat & Cepat (Pembayaran ... berhasil)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Voice Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
              <Languages className="h-3.5 w-3.5 text-primary" />
              Pilihan Suara (Voice)
            </label>
            <Select
              value={config.preferredVoiceURI || 'auto'}
              onValueChange={(val) => updateConfig({ preferredVoiceURI: val === 'auto' ? '' : val })}
              disabled={!config.enabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih suara" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  ✨ Otomatis (Suara Bahasa Indonesia Terbaik)
                </SelectItem>
                {indonesianVoices.map((v) => (
                  <SelectItem key={v.voiceURI} value={v.voiceURI}>
                    🇮🇩 {v.name} ({v.lang})
                  </SelectItem>
                ))}
                {voices
                  .filter((v) => !indonesianVoices.includes(v))
                  .slice(0, 10)
                  .map((v) => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI}>
                      🌐 {v.name} ({v.lang})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Sliders for Volume & Speed */}
        <div className="grid gap-4 sm:grid-cols-2 pt-1">
          {/* Rate / Speed */}
          <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-foreground">Kecepatan Bicara</span>
              <span className="font-mono text-muted-foreground font-semibold">
                {config.rate.toFixed(1)}x {config.rate === 1.0 ? '(Normal)' : config.rate < 1.0 ? '(Santai)' : '(Cepat)'}
              </span>
            </div>
            <Slider
              value={[config.rate]}
              min={0.7}
              max={1.3}
              step={0.1}
              disabled={!config.enabled}
              onValueChange={([val]) => updateConfig({ rate: val })}
              className="py-1"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0.7x (Lambat)</span>
              <span>1.0x (Standar)</span>
              <span>1.3x (Cepat)</span>
            </div>
          </div>

          {/* Volume */}
          <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-foreground">Kekuatan Volume</span>
              <span className="font-mono text-muted-foreground font-semibold">
                {Math.round(config.volume * 100)}%
              </span>
            </div>
            <Slider
              value={[config.volume]}
              min={0.1}
              max={1.0}
              step={0.05}
              disabled={!config.enabled}
              onValueChange={([val]) => updateConfig({ volume: val })}
              className="py-1"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>10% (Pelan)</span>
              <span>50%</span>
              <span>100% (Maksimal)</span>
            </div>
          </div>
        </div>

        {/* Feature Switches */}
        <div className="grid gap-3 sm:grid-cols-2 pt-1">
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div className="space-y-0.5 pr-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <BellRing className="h-3.5 w-3.5 text-primary" />
                <span>Bunyi Lonceng (Chime Ding-Dong)</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Memutar nada bel retail yang jernih sebelum suara pengumuman berbicara.
              </p>
            </div>
            <Switch
              checked={config.playChime}
              onCheckedChange={(val) => updateConfig({ playChime: val })}
              disabled={!config.enabled}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div className="space-y-0.5 pr-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Radio className="h-3.5 w-3.5 text-primary" />
                <span>Sebut Metode Pembayaran</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Menyebutkan jenis transaksi secara spesifik (Tunai, QRIS, Transfer, Debit).
              </p>
            </div>
            <Switch
              checked={config.announcePaymentMethod}
              onCheckedChange={(val) => updateConfig({ announcePaymentMethod: val })}
              disabled={!config.enabled}
            />
          </div>
        </div>

        {/* Interactive Testing Sandbox */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Kotak Uji Coba Suara (Sandbox)</h4>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Tanpa memotong stok atau transaksi nyata
            </span>
          </div>

          {/* Test Amount & Method Selectors */}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Nominal Uji Coba (Rp)</label>
              <Input
                type="number"
                value={testAmount}
                onChange={(e) => setTestAmount(Math.max(0, Number(e.target.value) || 0))}
                className="bg-background text-sm font-semibold"
                placeholder="125000"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Metode</label>
              <Select value={testMethod} onValueChange={setTestMethod}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QRIS">QRIS</SelectItem>
                  <SelectItem value="CASH">Tunai</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                  <SelectItem value="DEBIT">Debit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick Amount Chips */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setTestAmount(amt)}
                className={`text-xs px-2.5 py-1 rounded-md border transition-all ${
                  testAmount === amt
                    ? 'bg-primary text-primary-foreground font-semibold border-primary'
                    : 'bg-background hover:bg-muted text-muted-foreground'
                }`}
              >
                {formatCurrency(amt)}
              </button>
            ))}
          </div>

          {/* Spoken Text Preview */}
          <div className="rounded-lg bg-background/80 border p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
              <span>Kalimat yang akan diucapkan:</span>
              <span className="font-mono text-primary font-semibold">
                Terbilang: {terbilangRupiah(testAmount)}
              </span>
            </div>
            <p className="text-sm italic text-foreground font-medium bg-muted/30 p-2 rounded border border-dashed">
              &quot;{previewSentence}&quot;
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              onClick={handlePlayTest}
              disabled={isSpeaking || !config.enabled}
              className="gap-2"
            >
              {isSpeaking ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  Sedang Berbicara...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  Putar Suara Pengumuman
                </>
              )}
            </Button>

            {isSpeaking && (
              <Button type="button" variant="outline" onClick={stop} className="gap-1.5">
                <Square className="h-3.5 w-3.5 fill-current" />
                Hentikan
              </Button>
            )}

            {!config.enabled && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <Info className="h-3.5 w-3.5" />
                Aktifkan tombol switch di atas untuk mendengarkan.
              </span>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2 border">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-foreground">💡 100% Offline & Tanpa Biaya Tambahan:</p>
            <p>
              Fitur suara KasirFlow menggunakan mesin sintetis suara browser bawaan (Web Speech API) & synthesizer lonceng digital mandiri. Tidak memerlukan langganan pihak ketiga, tidak memerlukan hardware soundbox fisik khusus, dan tetap dapat bersuara lancar di tablet, HP Android, iPad, maupun PC kasir Anda.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
