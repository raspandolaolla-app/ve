import { useEffect, useRef, useState, useCallback } from 'react';

export interface SoundConfig {
  enabled: boolean;
  volume: number;
}

export const useBingoSounds = (initialConfig: SoundConfig = { enabled: true, volume: 0.7 }) => {
  const [config, setConfig] = useState<SoundConfig>(() => {
    try {
      const savedMuted = localStorage.getItem('bingo_audio_muted');
      const savedVol = localStorage.getItem('bingo_audio_volume');
      return {
        enabled: savedMuted !== null ? savedMuted !== 'true' : initialConfig.enabled,
        volume: savedVol !== null ? parseFloat(savedVol) : initialConfig.volume,
      };
    } catch {
      return initialConfig;
    }
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const lastPlayedRef = useRef<{ [key: string]: number }>({}); // Para evitar spam de sonidos

  // Inicializar AudioContext
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioContextRef.current = new AudioContextClass();
      }
    }

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
        } catch {}
      }
    };
  }, []);

  // Función para generar tonos sintéticos (no necesita archivos externos)
  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine') => {
    if (!config.enabled || !audioContextRef.current) return;

    const context = audioContextRef.current;
    if (context.state === 'suspended') {
      context.resume().catch(() => {});
    }

    try {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.type = type;
      oscillator.frequency.value = frequency;

      const safeVol = Math.max(0.001, config.volume);
      gainNode.gain.setValueAtTime(safeVol, context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);

      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + duration);
    } catch (err) {
      console.warn('[useBingoSounds] Error al generar tono:', err);
    }
  }, [config.enabled, config.volume]);

  // Sonido de bola cantada (tono suave)
  const playBallDrawn = useCallback(() => {
    const now = Date.now();
    if (now - (lastPlayedRef.current['ball'] || 0) < 500) return; // Evitar spam
    
    playTone(523.25, 0.15, 'sine'); // Do medio
    lastPlayedRef.current['ball'] = now;
  }, [playTone]);

  // Sonido de "Cerca de ganar" (2-3 números)
  const playCloseToWin = useCallback(() => {
    const now = Date.now();
    if (now - (lastPlayedRef.current['close'] || 0) < 2000) return;
    
    // Secuencia ascendente de tonos
    playTone(523.25, 0.1, 'triangle'); // Do
    setTimeout(() => playTone(659.25, 0.1, 'triangle'), 100); // Mi
    setTimeout(() => playTone(783.99, 0.15, 'triangle'), 200); // Sol
    lastPlayedRef.current['close'] = now;
  }, [playTone]);

  // Sonido de "¡A UNO de ganar!" (alarma emocionante)
  const playVeryCloseToWin = useCallback(() => {
    const now = Date.now();
    if (now - (lastPlayedRef.current['veryClose'] || 0) < 1500) return;
    
    // Secuencia rápida y emocionante
    playTone(783.99, 0.08, 'square'); // Sol agudo
    setTimeout(() => playTone(987.77, 0.08, 'square'), 80); // Si
    setTimeout(() => playTone(1174.66, 0.08, 'square'), 160); // Re
    setTimeout(() => playTone(1318.51, 0.2, 'square'), 240); // Mi agudo
    lastPlayedRef.current['veryClose'] = now;
  }, [playTone]);

  // Sonido de ¡BINGO! (fanfarria de victoria)
  const playBingoWin = useCallback(() => {
    if (!config.enabled) return;
    
    // Fanfarria completa
    const notes = [523.25, 659.25, 783.99, 1046.50]; // Do, Mi, Sol, Do agudo
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.3, 'triangle'), i * 150);
    });
    
    // Acorde final sostenido
    setTimeout(() => {
      playTone(1046.50, 0.8, 'sine');
      playTone(1318.51, 0.8, 'sine');
      playTone(1567.98, 0.8, 'sine');
    }, 600);
  }, [config.enabled, playTone]);

  // Sonido de cuenta regresiva (últimos 5 segundos)
  const playCountdown = useCallback((secondsLeft: number) => {
    if (secondsLeft <= 5 && secondsLeft > 0) {
      playTone(440 + (5 - secondsLeft) * 100, 0.1, 'square');
    }
  }, [playTone]);

  // Función para activar/desactivar sonidos
  const toggleSounds = useCallback(() => {
    setConfig(prev => {
      const next = { ...prev, enabled: !prev.enabled };
      try {
        localStorage.setItem('bingo_audio_muted', String(!next.enabled));
      } catch {}
      return next;
    });
  }, []);

  // Función para ajustar volumen
  const setVolume = useCallback((volume: number) => {
    const validVol = Math.max(0, Math.min(1, volume));
    setConfig(prev => {
      const next = { ...prev, volume: validVol };
      try {
        localStorage.setItem('bingo_audio_volume', String(validVol));
      } catch {}
      return next;
    });
  }, []);

  return {
    playBallDrawn,
    playCloseToWin,
    playVeryCloseToWin,
    playBingoWin,
    playCountdown,
    toggleSounds,
    setVolume,
    isEnabled: config.enabled,
    volume: config.volume,
  };
};
