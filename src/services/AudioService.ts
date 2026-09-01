// ==============================================================================
// RASPANDO LA OLLA — SERVICIO DE AUDIO UNIFICADO PARA TODOS LOS JUEGOS
// ==============================================================================

type SoundType = 
  | 'notification' 
  | 'win' 
  | 'lose' 
  | 'click' 
  | 'match' 
  | 'gameStart' 
  | 'gameEnd'
  | 'deposit'
  | 'withdraw'
  | 'message'
  | 'achievement'
  | 'warning';

class AudioService {
  private sounds: Map<SoundType, HTMLAudioElement[]> = new Map();
  private volume: number = 0.7;
  private muted: boolean = false;

  constructor() {
    this.loadSounds();
  }

  private loadSounds(): void {
    this.sounds.set('notification', [new Audio()]);
    this.sounds.set('win', [new Audio(), new Audio(), new Audio()]);
    this.sounds.set('lose', [new Audio()]);
    this.sounds.set('click', [new Audio()]);
    this.sounds.set('match', [new Audio()]);
    this.sounds.set('gameStart', [new Audio()]);
    this.sounds.set('gameEnd', [new Audio()]);
    this.sounds.set('deposit', [new Audio()]);
    this.sounds.set('withdraw', [new Audio()]);
    this.sounds.set('message', [new Audio()]);
    this.sounds.set('achievement', [new Audio()]);
    this.sounds.set('warning', [new Audio()]);
  }

  public play(soundType: SoundType, variation?: number): void {
    if (this.muted) return;

    const sounds = this.sounds.get(soundType);
    if (!sounds || sounds.length === 0) {
      console.warn(`[AudioService] Sonido no encontrado: ${soundType}`);
      return;
    }

    const index = variation !== undefined 
      ? variation % sounds.length 
      : Math.floor(Math.random() * sounds.length);

    const audio = sounds[index];
    
    try {
      audio.currentTime = 0;
      audio.volume = this.volume;
      audio.play().catch(() => {});
    } catch (error) {
      console.warn(`[AudioService] Error reproduciendo ${soundType}:`, error);
    }
  }

  public playBingoNumber(number: number): void {
    if (number < 1 || number > 90) return;
    try {
      const audio = new Audio(`/ve/bingo-audio/${number}.mp3`);
      audio.volume = this.volume;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  public playWinSound(isBigWin: boolean = false): void {
    this.play('win', isBigWin ? 2 : 0);
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }
}

export const audioService = new AudioService();
