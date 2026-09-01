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
  | 'warning'
  | 'bingoCall'
  | 'scratch';

class AudioService {
  private sounds: Map<SoundType, HTMLAudioElement[]> = new Map();
  private volume: number = 0.7;
  private muted: boolean = false;
  private initialized: boolean = false;

  constructor() {
    this.loadSounds();
  }

  private loadSounds(): void {
    // Sonidos generales
    this.sounds.set('notification', [
      this.createAudio('/ve/sounds/notification.mp3'),
      this.createAudio('/ve/sounds/notification2.mp3')
    ]);

    this.sounds.set('win', [
      this.createAudio('/ve/sounds/win.mp3'),
      this.createAudio('/ve/sounds/win2.mp3'),
      this.createAudio('/ve/sounds/bigwin.mp3')
    ]);

    this.sounds.set('lose', [this.createAudio('/ve/sounds/lose.mp3')]);
    this.sounds.set('click', [this.createAudio('/ve/sounds/click.mp3')]);
    this.sounds.set('match', [this.createAudio('/ve/sounds/match.mp3')]);
    this.sounds.set('gameStart', [this.createAudio('/ve/sounds/game-start.mp3')]);
    this.sounds.set('gameEnd', [this.createAudio('/ve/sounds/game-end.mp3')]);
    this.sounds.set('deposit', [this.createAudio('/ve/sounds/deposit.mp3')]);
    this.sounds.set('withdraw', [this.createAudio('/ve/sounds/withdraw.mp3')]);
    this.sounds.set('message', [this.createAudio('/ve/sounds/message.mp3')]);
    this.sounds.set('achievement', [this.createAudio('/ve/sounds/achievement.mp3')]);
    this.sounds.set('warning', [this.createAudio('/ve/sounds/warning.mp3')]);
    this.sounds.set('scratch', [this.createAudio('/ve/sounds/scratch.mp3')]);

    // Sonidos de bingo (números)
    for (let i = 1; i <= 90; i++) {
      const key = `bingo_${i}` as SoundType;
      this.sounds.set(key, [this.createAudio(`/ve/bingo-audio/${i}.mp3`)]);
    }

    // Letras del bingo
    this.sounds.set('bingoCall', [
      this.createAudio('/ve/bingo-audio/b.mp3'),
      this.createAudio('/ve/bingo-audio/i.mp3'),
      this.createAudio('/ve/bingo-audio/n.mp3'),
      this.createAudio('/ve/bingo-audio/g.mp3'),
      this.createAudio('/ve/bingo-audio/o.mp3')
    ]);
  }

  private createAudio(src: string): HTMLAudioElement {
    const audio = new Audio();
    audio.src = src;
    audio.volume = this.volume;
    audio.preload = 'auto';
    return audio;
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
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn(`[AudioService] Error reproduciendo ${soundType}:`, error);
        });
      }
    } catch (error) {
      console.warn(`[AudioService] Excepción al reproducir ${soundType}:`, error);
    }
  }

  public playBingoNumber(number: number): void {
    if (number < 1 || number > 90) return;
    const key = `bingo_${number}` as SoundType;
    this.play(key);
  }

  public playWinSound(isBigWin: boolean = false): void {
    this.play('win', isBigWin ? 2 : Math.floor(Math.random() * 2));
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.sounds.forEach(audioArray => {
      audioArray.forEach(audio => {
        audio.volume = this.volume;
      });
    });
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

// Instancia singleton global
export const audioService = new AudioService();