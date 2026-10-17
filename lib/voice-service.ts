'use client';

import { terbilangRupiah } from './terbilang';

export type VoiceTemplateStyle = 'standard' | 'polite' | 'store_name' | 'short';

export interface VoiceNotificationConfig {
  enabled: boolean;
  volume: number; // 0.1 to 1.0
  rate: number; // 0.7 to 1.3
  pitch: number; // 0.8 to 1.2
  template: VoiceTemplateStyle;
  playChime: boolean;
  announcePaymentMethod: boolean;
  preferredVoiceURI: string;
}

export const DEFAULT_VOICE_CONFIG: VoiceNotificationConfig = {
  enabled: true,
  volume: 1.0,
  rate: 1.0,
  pitch: 1.0,
  template: 'polite',
  playChime: true,
  announcePaymentMethod: true,
  preferredVoiceURI: '',
};

const STORAGE_KEY = 'kasirflow_voice_config';
const EVENT_KEY = 'kasirflow_voice_settings_changed';

/**
 * Retrieve voice notification settings from LocalStorage
 */
export function getVoiceConfig(): VoiceNotificationConfig {
  if (typeof window === 'undefined') return DEFAULT_VOICE_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_VOICE_CONFIG, ...parsed };
  } catch {
    return DEFAULT_VOICE_CONFIG;
  }
}

/**
 * Save voice notification settings to LocalStorage and broadcast update
 */
export function saveVoiceConfig(partial: Partial<VoiceNotificationConfig>): VoiceNotificationConfig {
  if (typeof window === 'undefined') return DEFAULT_VOICE_CONFIG;
  const current = getVoiceConfig();
  const updated = { ...current, ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: updated }));
  } catch {
    // Ignore storage quota errors
  }
  return updated;
}

/**
 * Synthesize a modern, cheerful retail notification chime via Web Audio API.
 * No external sound files or network requests required.
 */
export async function playNotificationChime(volume = 0.5): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0.01, Math.min(1, volume * 0.45)), now);
    masterGain.connect(ctx.destination);

    // Note 1: E5 (659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.8, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.19);

    // Note 2: B5 (987.77 Hz) - crisp ascending chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.1);
    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(1.0, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.45);

    // Cleanup AudioContext after playback
    setTimeout(() => {
      try {
        ctx.close();
      } catch {
        // ignore
      }
    }, 600);
  } catch {
    // AudioContext blocked or not supported
  }
}

/**
 * Format the spoken sentence according to configuration and template style.
 */
export function formatPaymentAnnouncement(
  amount: number,
  options?: {
    storeName?: string;
    paymentMethod?: string;
    template?: VoiceTemplateStyle;
    announcePaymentMethod?: boolean;
  }
): string {
  const nominalWords = terbilangRupiah(amount);
  const template = options?.template ?? getVoiceConfig().template;
  const storeName = options?.storeName?.trim() || 'Toko';
  const shouldAnnounceMethod = options?.announcePaymentMethod ?? getVoiceConfig().announcePaymentMethod;

  let methodLabel = '';
  if (shouldAnnounceMethod && options?.paymentMethod) {
    const m = options.paymentMethod.toUpperCase();
    if (m === 'CASH') methodLabel = 'tunai ';
    else if (m === 'QRIS') methodLabel = 'Q-RIS ';
    else if (m === 'TRANSFER') methodLabel = 'transfer ';
    else if (m === 'DEBIT') methodLabel = 'kartu debit ';
    else if (m === 'CREDIT') methodLabel = 'kartu kredit ';
  }

  switch (template) {
    case 'store_name':
      return `Terima kasih telah berbelanja di ${storeName}. Pembayaran ${methodLabel}sebesar ${nominalWords} berhasil diterima.`;

    case 'polite':
      return `Terima kasih, pembayaran ${methodLabel}sebesar ${nominalWords} telah berhasil diterima.`;

    case 'short':
      return `Pembayaran ${methodLabel}${nominalWords} berhasil.`;

    case 'standard':
    default:
      return `Pembayaran ${methodLabel}berhasil, ${nominalWords}.`;
  }
}

/**
 * Find the most suitable speech voice, prioritizing Indonesian (id-ID)
 */
export function findBestIndonesianVoice(preferredURI?: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // 1. Explicitly preferred voice URI
  if (preferredURI) {
    const found = voices.find((v) => v.voiceURI === preferredURI);
    if (found) return found;
  }

  // 2. Exact 'id-ID' or 'id_ID'
  const idExact = voices.find((v) => v.lang.toLowerCase() === 'id-id' || v.lang.toLowerCase() === 'id_id');
  if (idExact) return idExact;

  // 3. Any Indonesian prefix
  const idPrefix = voices.find((v) => v.lang.toLowerCase().startsWith('id'));
  if (idPrefix) return idPrefix;

  // 4. Name containing 'indonesia'
  const idName = voices.find((v) => v.name.toLowerCase().includes('indonesia'));
  if (idName) return idName;

  // 5. Default natural voice fallback
  const defaultVoice = voices.find((v) => v.default) || voices[0];
  return defaultVoice || null;
}

/**
 * Get all available voices on client system
 */
export function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      resolve(voices);
      return;
    }

    const onVoicesChanged = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      resolve(window.speechSynthesis.getVoices());
    };

    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    // Timeout fallback in case voiceschanged doesn't trigger
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      resolve(window.speechSynthesis.getVoices());
    }, 600);
  });
}

/**
 * Cancel any ongoing speech synthesis immediately
 */
export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Speak arbitrary text using Web Speech API with custom or saved configuration
 */
export async function speakText(
  text: string,
  customConfig?: Partial<VoiceNotificationConfig>
): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const config = { ...getVoiceConfig(), ...customConfig };
  if (!config.enabled) return;

  stopSpeaking();

  if (config.playChime) {
    await playNotificationChime(config.volume);
    // Brief pause after chime so voice sounds crisp and distinct
    await new Promise((resolve) => setTimeout(resolve, 240));
  }

  return new Promise((resolve) => {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = Math.max(0.1, Math.min(1, config.volume));
      utterance.rate = Math.max(0.6, Math.min(1.5, config.rate));
      utterance.pitch = Math.max(0.6, Math.min(1.4, config.pitch));

      const voice = findBestIndonesianVoice(config.preferredVoiceURI);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || 'id-ID';
      } else {
        utterance.lang = 'id-ID';
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

/**
 * Trigger spoken announcement for a completed payment transaction.
 */
export async function speakPaymentSuccess(
  amount: number,
  options?: {
    storeName?: string;
    paymentMethod?: string;
    overrideConfig?: Partial<VoiceNotificationConfig>;
  }
): Promise<void> {
  const config = { ...getVoiceConfig(), ...options?.overrideConfig };
  if (!config.enabled) return;

  const announcement = formatPaymentAnnouncement(amount, {
    storeName: options?.storeName,
    paymentMethod: options?.paymentMethod,
    template: config.template,
    announcePaymentMethod: config.announcePaymentMethod,
  });

  return speakText(announcement, config);
}
