// ==============================================================================
// RASPANDO LA OLLA — HOOK PARA USAR SONIDOS EN COMPONENTES
// ==============================================================================

import { useEffect, useCallback } from 'react';
import { audioService } from '../services/AudioService';

export function useAudio() {
  useEffect(() => {
    // Cargar preferencias del usuario desde localStorage
    const savedVolume = localStorage.getItem('audio_volume');
    const savedMuted = localStorage.getItem('audio_muted');

    if (savedVolume !== null) {
      audioService.setVolume(parseFloat(savedVolume));
    }

    if (savedMuted !== null) {
      audioService.setMuted(savedMuted === 'true');
    }
  }, []);

  const playSound = useCallback((soundType: string, variation?: number) => {
    audioService.play(soundType as any, variation);
  }, []);

  const playBingoNumber = useCallback((number: number) => {
    audioService.playBingoNumber(number);
  }, []);

  const playWinSound = useCallback((isBigWin: boolean = false) => {
    audioService.playWinSound(isBigWin);
  }, []);

  const setVolume = useCallback((volume: number) => {
    audioService.setVolume(volume);
    localStorage.setItem('audio_volume', volume.toString());
  }, []);

  const toggleMute = useCallback(() => {
    const newMuted = audioService.toggleMute();
    localStorage.setItem('audio_muted', newMuted.toString());
    return newMuted;
  }, []);

  const getVolume = useCallback(() => {
    return audioService.getVolume();
  }, []);

  const isMuted = useCallback(() => {
    return audioService.isMuted();
  }, []);

  return {
    playSound,
    playBingoNumber,
    playWinSound,
    setVolume,
    toggleMute,
    getVolume,
    isMuted
  };
}