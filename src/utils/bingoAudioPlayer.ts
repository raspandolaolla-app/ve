// ==============================================================================
// RASPANDO LA OLLA — REPRODUCTOR DE AUDIO OPTIMIZADO PARA BINGO
// ==============================================================================
// Sistema de audio con precarga, sincronización de velocidad y control de volumen
// ==============================================================================

export interface BingoAudioConfig {
  baseUrl: string;
  volume: number; // 0.0 a 1.0
  preload: boolean;
}

class BingoAudioPlayer {
  private config: BingoAudioConfig;
  private letterAudios: Map<string, HTMLAudioElement> = new Map();
  private numberAudios: Map<number, HTMLAudioElement> = new Map();
  private isPlaying: boolean = false;
  private currentAudio: HTMLAudioElement | null = null;

  constructor(config: BingoAudioConfig) {
    this.config = config;
    if (config.preload && typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      this.preloadAudios();
    }
  }

  /**
   * Precarga todos los audios de letras y números
   */
  private preloadAudios(): void {
    if (typeof Audio === 'undefined') return;

    const letters = ['b', 'i', 'n', 'g', 'o'];
    
    // Precargar letras
    letters.forEach(letter => {
      try {
        const audio = new Audio(`${this.config.baseUrl}${letter}.mp3`);
        audio.preload = 'auto';
        audio.volume = this.config.volume;
        this.letterAudios.set(letter, audio);
      } catch (err) {
        console.warn(`[BingoAudio] No se pudo precargar letra ${letter}:`, err);
      }
    });

    // Precargar números (1-90)
    for (let i = 1; i <= 90; i++) {
      try {
        const audio = new Audio(`${this.config.baseUrl}${i}.mp3`);
        audio.preload = 'auto';
        audio.volume = this.config.volume;
        this.numberAudios.set(i, audio);
      } catch (err) {
        console.warn(`[BingoAudio] No se pudo precargar número ${i}:`, err);
      }
    }

    console.log('[BingoAudio] Audios precargados:', {
      letters: this.letterAudios.size,
      numbers: this.numberAudios.size
    });
  }

  /**
   * Obtiene la letra correspondiente a un número de bingo (75 bolas)
   */
  private getLetterForNumber(ball: number, variant: '75' | '80' | '90'): string | null {
    if (variant !== '75') return null; // Solo aplica a 75 bolas
    
    if (ball >= 1 && ball <= 15) return 'b';
    if (ball >= 16 && ball <= 30) return 'i';
    if (ball >= 31 && ball <= 45) return 'n';
    if (ball >= 46 && ball <= 60) return 'g';
    if (ball >= 61 && ball <= 75) return 'o';
    return null;
  }

  /**
   * Reproduce el audio de una balota con sincronización
   * @param ball Número de la balota (1-90)
   * @param variant Variante del bingo ('75', '80', '90')
   * @param intervalMs Intervalo entre balotas en milisegundos
   * @returns Promesa que se resuelve cuando termina la reproducción
   */
  async playBall(ball: number, variant: '75' | '80' | '90', intervalMs: number): Promise<void> {
    if (this.isPlaying) {
      this.stop();
    }

    this.isPlaying = true;

    try {
      const letter = this.getLetterForNumber(ball, variant);
      
      // Calcular duración máxima basada en el intervalo
      const maxDuration = intervalMs * 0.8; // Usar 80% del intervalo para dejar margen

      if (letter) {
        // Reproducir letra primero
        await this.playAudioSequence([
          { type: 'letter', key: letter },
          { type: 'number', key: ball }
        ], maxDuration);
      } else {
        // Solo número (variantes 80 y 90)
        await this.playAudioSequence([
          { type: 'number', key: ball }
        ], maxDuration);
      }
    } catch (error) {
      console.error('[BingoAudio] Error reproduciendo audio:', error);
    } finally {
      this.isPlaying = false;
    }
  }

  /**
   * Reproduce una secuencia de audios con límite de tiempo
   */
  private async playAudioSequence(
    sequence: Array<{ type: 'letter' | 'number'; key: string | number }>,
    maxDurationMs: number
  ): Promise<void> {
    const startTime = Date.now();

    for (const item of sequence) {
      const elapsed = Date.now() - startTime;
      const remainingTime = maxDurationMs - elapsed;

      if (remainingTime <= 0) {
        console.warn('[BingoAudio] Tiempo máximo alcanzado, omitiendo audio restante');
        break;
      }

      let audio = item.type === 'letter' 
        ? this.letterAudios.get(item.key as string)
        : this.numberAudios.get(item.key as number);

      if (!audio && typeof Audio !== 'undefined') {
        const url = `${this.config.baseUrl}${item.key}.mp3`;
        audio = new Audio(url);
      }

      if (!audio) {
        console.warn(`[BingoAudio] Audio no encontrado: ${item.type} ${item.key}`);
        continue;
      }

      this.currentAudio = audio;
      audio.currentTime = 0;
      audio.volume = this.config.volume;

      try {
        await this.playWithTimeout(audio, remainingTime);
      } catch (error) {
        console.error(`[BingoAudio] Error reproduciendo ${item.type} ${item.key}:`, error);
      }
    }
  }

  /**
   * Reproduce un audio con timeout
   */
  private playWithTimeout(audio: HTMLAudioElement, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
        resolve();
      }, timeoutMs);

      audio.onended = () => {
        clearTimeout(timeout);
        resolve();
      };

      audio.onerror = (e) => {
        clearTimeout(timeout);
        reject(e);
      };

      audio.play().catch((error) => {
        clearTimeout(timeout);
        // Autoplay policy or interrupt
        resolve();
      });
    });
  }

  /**
   * Detiene la reproducción actual
   */
  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    this.isPlaying = false;
  }

  /**
   * Actualiza el volumen
   */
  setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
    
    // Actualizar volumen en todos los audios precargados
    this.letterAudios.forEach(audio => {
      audio.volume = this.config.volume;
    });
    this.numberAudios.forEach(audio => {
      audio.volume = this.config.volume;
    });
  }

  /**
   * Obtiene el volumen actual
   */
  getVolume(): number {
    return this.config.volume;
  }

  /**
   * Verifica si hay audio reproduciéndose
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Libera recursos
   */
  destroy(): void {
    this.stop();
    this.letterAudios.clear();
    this.numberAudios.clear();
  }
}

// Instancia singleton
let instance: BingoAudioPlayer | null = null;

export function getBingoAudioPlayer(config?: BingoAudioConfig): BingoAudioPlayer {
  if (!instance) {
    const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const defaultConfig: BingoAudioConfig = {
      baseUrl: `${cleanBaseUrl}bingo-audio/`,
      volume: 0.8,
      preload: true
    };
    instance = new BingoAudioPlayer(config || defaultConfig);
  }
  return instance;
}

export function destroyBingoAudioPlayer(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
