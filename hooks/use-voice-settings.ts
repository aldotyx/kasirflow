'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getVoiceConfig,
  saveVoiceConfig,
  VoiceNotificationConfig,
  DEFAULT_VOICE_CONFIG,
  getAvailableVoices,
  speakPaymentSuccess,
  speakText,
  stopSpeaking,
} from '@/lib/voice-service';

export function useVoiceSettings() {
  const [config, setConfig] = useState<VoiceNotificationConfig>(DEFAULT_VOICE_CONFIG);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  // Sync state on mount and listen to changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsSupported('speechSynthesis' in window);
    setConfig(getVoiceConfig());

    getAvailableVoices().then((v) => {
      setVoices(v);
    });

    const handleCustomChange = (e: any) => {
      if (e?.detail) {
        setConfig(e.detail);
      } else {
        setConfig(getVoiceConfig());
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'kasirflow_voice_config') {
        setConfig(getVoiceConfig());
      }
    };

    window.addEventListener('kasirflow_voice_settings_changed', handleCustomChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('kasirflow_voice_settings_changed', handleCustomChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const updateConfig = useCallback((partial: Partial<VoiceNotificationConfig>) => {
    const updated = saveVoiceConfig(partial);
    setConfig(updated);
    return updated;
  }, []);

  const toggleEnabled = useCallback(() => {
    return updateConfig({ enabled: !config.enabled });
  }, [config.enabled, updateConfig]);

  const testAnnouncement = useCallback(
    async (amount: number, storeName?: string, paymentMethod?: string) => {
      setIsSpeaking(true);
      try {
        await speakPaymentSuccess(amount, {
          storeName,
          paymentMethod,
        });
      } finally {
        setIsSpeaking(false);
      }
    },
    []
  );

  const testDirectSpeech = useCallback(
    async (text: string) => {
      setIsSpeaking(true);
      try {
        await speakText(text);
      } finally {
        setIsSpeaking(false);
      }
    },
    []
  );

  const stop = useCallback(() => {
    stopSpeaking();
    setIsSpeaking(false);
  }, []);

  return {
    config,
    voices,
    isSpeaking,
    isSupported,
    updateConfig,
    toggleEnabled,
    testAnnouncement,
    testDirectSpeech,
    stop,
  };
}
