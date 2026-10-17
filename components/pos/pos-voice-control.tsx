'use client';

import { useState } from 'react';
import { useVoiceSettings } from '@/hooks/use-voice-settings';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Volume2, VolumeX, Settings2, Play, BellRing, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface PosVoiceControlProps {
  storeName?: string;
}

export function PosVoiceControl({ storeName }: PosVoiceControlProps) {
  const {
    config,
    isSpeaking,
    isSupported,
    updateConfig,
    toggleEnabled,
    testAnnouncement,
    stop,
  } = useVoiceSettings();

  const [open, setOpen] = useState(false);

  if (!isSupported) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={config.enabled ? 'outline' : 'ghost'}
          size="sm"
          className={`h-9 px-2.5 gap-1.5 transition-all ${
            config.enabled
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title={config.enabled ? 'Suara Kasir Aktif (Klik untuk atur)' : 'Suara Kasir Nonaktif (Klik untuk atur)'}
        >
          {config.enabled ? (
            <>
              <Volume2 className="h-4 w-4" />
              <span className="hidden md:inline text-xs font-medium">Suara: On</span>
            </>
          ) : (
            <>
              <VolumeX className="h-4 w-4 text-muted-foreground" />
              <span className="hidden md:inline text-xs text-muted-foreground">Suara: Off</span>
            </>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-4 space-y-4 shadow-lg border-primary/20" align="end">
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <Volume2 className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold">Suara Kasir (Soundbox)</h4>
              <p className="text-[11px] text-muted-foreground">Pengumuman nominal transaksi</p>
            </div>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(val) => {
              updateConfig({ enabled: val });
              toast.success(val ? 'Suara kasir diaktifkan' : 'Suara kasir dimatikan');
            }}
          />
        </div>

        {/* Quick Volume & Speed */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Volume</span>
              <span className="font-mono font-semibold">{Math.round(config.volume * 100)}%</span>
            </div>
            <Slider
              value={[config.volume]}
              min={0.1}
              max={1.0}
              step={0.05}
              disabled={!config.enabled}
              onValueChange={([val]) => updateConfig({ volume: val })}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Kecepatan Bicara</span>
              <span className="font-mono font-semibold">{config.rate.toFixed(1)}x</span>
            </div>
            <Slider
              value={[config.rate]}
              min={0.7}
              max={1.3}
              step={0.1}
              disabled={!config.enabled}
              onValueChange={([val]) => updateConfig({ rate: val })}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <BellRing className="h-3.5 w-3.5 text-primary" />
              Lonceng Chime
            </span>
            <Switch
              checked={config.playChime}
              disabled={!config.enabled}
              onCheckedChange={(val) => updateConfig({ playChime: val })}
            />
          </div>
        </div>

        {/* Quick Test Button */}
        <div className="pt-2 border-t flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="w-full text-xs h-8 gap-1.5"
            disabled={!config.enabled || isSpeaking}
            onClick={() => testAnnouncement(50000, storeName, 'QRIS')}
          >
            <Play className="h-3 w-3 fill-current" />
            {isSpeaking ? 'Memutar...' : 'Uji Suara (Rp 50.000)'}
          </Button>

          {isSpeaking && (
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={stop}>
              Stop
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
