// ==============================================================================
// RASPANDO LA OLLA — GESTOR DE PREFERENCIA DE AUDIO EN PUBLICIDAD EN VIDEO
// ==============================================================================

const STORAGE_KEY = 'webapp_ad_muted';

type Listener = (muted: boolean) => void;
const listeners = new Set<Listener>();

let currentMuted: boolean = (() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null ? saved === 'true' : true; // Por defecto Mute (sin sonido)
  } catch {
    return true;
  }
})();

export const adAudioPreference = {
  getMuted(): boolean {
    return currentMuted;
  },

  setMuted(muted: boolean): void {
    currentMuted = muted;
    try {
      localStorage.setItem(STORAGE_KEY, String(muted));
    } catch {
      // ignore storage errors
    }
    listeners.forEach((fn) => fn(currentMuted));
  },

  toggleMuted(): boolean {
    this.setMuted(!currentMuted);
    return currentMuted;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    // emitir estado inicial
    listener(currentMuted);
    return () => {
      listeners.delete(listener);
    };
  },
};
