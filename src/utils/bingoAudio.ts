// ==============================================================================
// RASPANDO LA OLLA — SISTEMA DE AUDIO ROBUSTO PARA BINGO
// ==============================================================================
// Usa Web Audio API + Precarga + User Gesture Unlock
// ==============================================================================

class BingoAudioSystem {
  private audioContext: AudioContext | null = null;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private isInitialized = false;
  private isUnlocked = false;
  private volume = 0.8;
  private baseUrl: string;

  constructor() {
    // Detectar base path correctamente
    const base = import.meta.env.BASE_URL || '/';
    this.baseUrl = base.endsWith('/') ? base : `${base}/`;
    console.log('[BingoAudio] Base URL configurada:', this.baseUrl);
  }

  /**
   * Inicializa el AudioContext (debe llamarse después de interacción del usuario)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[BingoAudio] Ya inicializado');
      return;
    }

    try {
      console.log('[BingoAudio] Creando AudioContext...');
      
      // Crear AudioContext compatible con prefijos
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('[BingoAudio] Web Audio API no soportada en este navegador');
        return;
      }

      this.audioContext = new AudioContextClass();
      
      console.log('[BingoAudio] AudioContext estado:', this.audioContext.state);
      
      // Si está suspendido, resumir (requiere user gesture)
      if (this.audioContext.state === 'suspended') {
        console.log('[BingoAudio] AudioContext suspendido, intentando resumir...');
        await this.audioContext.resume();
        console.log('[BingoAudio] AudioContext resumido, estado:', this.audioContext.state);
      }

      // Precargar todos los audios
      await this.preloadAllAudios();
      
      this.isInitialized = true;
      console.log('[BingoAudio] ✓ Sistema de audio inicializado correctamente');
    } catch (error) {
      console.error('[BingoAudio] Error inicializando:', error);
      throw error;
    }
  }

  /**
   * Precarga todos los archivos de audio (letras B-I-N-G-O + números 1-90)
   */
  private async preloadAllAudios(): Promise<void> {
    if (!this.audioContext) return;

    console.log('[BingoAudio] Iniciando precarga de audios...');
    
    const filesToLoad: string[] = [];
    
    // Letras B-I-N-G-O
    ['b', 'i', 'n', 'g', 'o'].forEach(letter => {
      filesToLoad.push(`${letter}.mp3`);
    });

    // Números 1-90
    for (let i = 1; i <= 90; i++) {
      filesToLoad.push(`${i}.mp3`);
    }

    console.log(`[BingoAudio] Cargando ${filesToLoad.length} archivos de audio...`);

    let loaded = 0;
    let errors = 0;

    // Cargar en paralelo (máximo 10 simultáneos para no saturar la red)
    const batchSize = 10;
    for (let i = 0; i < filesToLoad.length; i += batchSize) {
      const batch = filesToLoad.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (filename) => {
        try {
          const buffer = await this.loadAudioFile(filename);
          const key = filename.replace('.mp3', '');
          this.audioBuffers.set(key, buffer);
          loaded++;
          
          if (loaded % 10 === 0) {
            console.log(`[BingoAudio] Progreso: ${loaded}/${filesToLoad.length} archivos cargados`);
          }
        } catch (error) {
          errors++;
          console.warn(`[BingoAudio] Error cargando ${filename}:`, error);
        }
      }));
    }

    console.log(`[BingoAudio] ✓ Precarga completada: ${loaded} exitosos, ${errors} errores`);
    
    if (errors > 10) {
      console.warn('[BingoAudio] ⚠️ Muchos errores de carga. Verifica que los archivos existan en public/bingo-audio/');
    }
  }

  /**
   * Carga y decodifica un archivo de audio
   */
  private async loadAudioFile(filename: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('AudioContext no inicializado');
    }

    const url = `${this.baseUrl}bingo-audio/${filename}`;

    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      
      // Verificar que no esté vacío
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Archivo vacío');
      }

      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      console.error(`[BingoAudio] Error cargando ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Desbloquea el audio (requiere interacción del usuario)
   */
  async unlock(): Promise<void> {
    if (this.isUnlocked && this.audioContext && this.audioContext.state === 'running') {
      console.log('[BingoAudio] Ya desbloqueado');
      return;
    }

    if (!this.audioContext) {
      await this.initialize();
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('[BingoAudio] ✓ Audio desbloqueado');
        this.isUnlocked = true;
      } catch (error) {
        console.error('[BingoAudio] Error desbloqueando:', error);
        throw error;
      }
    } else {
      this.isUnlocked = true;
    }
  }

  /**
   * Obtiene la letra B-I-N-G-O para un número (solo aplica a 75 bolas)
   */
  private getLetterForNumber(ball: number, variant: string): string | null {
    if (variant !== '75') return null;
    
    if (ball >= 1 && ball <= 15) return 'b';
    if (ball >= 16 && ball <= 30) return 'i';
    if (ball >= 31 && ball <= 45) return 'n';
    if (ball >= 46 && ball <= 60) return 'g';
    if (ball >= 61 && ball <= 75) return 'o';
    
    return null;
  }

  /**
   * Reproduce una balota con su letra (si aplica) y número
   */
  async playBall(ball: number, variant: string = '75', intervalMs: number = 5000): Promise<void> {
    console.log(`[BingoAudio] Intentando reproducir balota ${ball} (variante: ${variant})`);

    if (!this.isInitialized || !this.audioContext) {
      console.warn('[BingoAudio] Sistema no inicializado. Llama a initialize() primero.');
      return;
    }

    if (this.audioContext.state === 'suspended') {
      console.warn('[BingoAudio] AudioContext suspendido. Llama a unlock() primero.');
      await this.unlock();
    }

    const letter = this.getLetterForNumber(ball, variant);
    const maxDuration = Math.min(intervalMs * 0.75, 3000); // Máximo 3 segundos

    try {
      if (letter) {
        // Reproducir letra + número
        console.log(`[BingoAudio] Reproduciendo letra ${letter} + número ${ball}`);
        
        const letterBuffer = this.audioBuffers.get(letter);
        const numberBuffer = this.audioBuffers.get(String(ball));

        if (letterBuffer) {
          await this.playBuffer(letterBuffer, maxDuration * 0.4);
        } else {
          console.warn(`[BingoAudio] Buffer de letra ${letter} no encontrado`);
        }

        if (numberBuffer) {
          await this.playBuffer(numberBuffer, maxDuration * 0.6);
        } else {
          console.warn(`[BingoAudio] Buffer de número ${ball} no encontrado`);
        }
      } else {
        // Solo número (variantes 80 y 90)
        console.log(`[BingoAudio] Reproduciendo solo número ${ball}`);
        
        const numberBuffer = this.audioBuffers.get(String(ball));
        
        if (numberBuffer) {
          await this.playBuffer(numberBuffer, maxDuration);
        } else {
          console.warn(`[BingoAudio] Buffer de número ${ball} no encontrado`);
        }
      }

      console.log(`[BingoAudio] ✓ Balota ${ball} reproducida correctamente`);
    } catch (error) {
      console.error(`[BingoAudio] Error reproduciendo balota ${ball}:`, error);
    }
  }

  /**
   * Reproduce un AudioBuffer con timeout de seguridad
   */
  private playBuffer(buffer: AudioBuffer, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.audioContext) {
        console.warn('[BingoAudio] AudioContext no disponible');
        resolve();
        return;
      }

      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();

      source.buffer = buffer;
      gainNode.gain.value = this.volume;

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      let isFinished = false;

      const finish = () => {
        if (!isFinished) {
          isFinished = true;
          clearTimeout(timeout);
          resolve();
        }
      };

      const timeout = setTimeout(() => {
        try {
          source.stop();
        } catch {
          // Ignorar si ya terminó
        }
        console.warn('[BingoAudio] Audio interrumpido por timeout');
        finish();
      }, timeoutMs);

      source.onended = () => {
        finish();
      };

      source.start(0);
    });
  }

  /**
   * Actualiza el volumen (0.0 a 1.0)
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    console.log(`[BingoAudio] Volumen actualizado: ${this.volume}`);
  }

  /**
   * Obtiene el volumen actual
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Verifica si el sistema está listo
   */
  isReady(): boolean {
    return this.isInitialized && this.audioContext !== null && this.audioContext.state === 'running';
  }

  /**
   * Obtiene estadísticas del sistema
   */
  getStats() {
    return {
      initialized: this.isInitialized,
      unlocked: this.isUnlocked,
      buffersLoaded: this.audioBuffers.size,
      contextState: this.audioContext?.state || 'null',
      volume: this.volume,
    };
  }

  /**
   * Libera recursos
   */
  destroy(): void {
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (err) {
        console.warn('[BingoAudio] Error cerrando AudioContext:', err);
      }
      this.audioContext = null;
    }
    this.audioBuffers.clear();
    this.isInitialized = false;
    this.isUnlocked = false;
    console.log('[BingoAudio] Sistema destruido');
  }
}

// Instancia singleton
let instance: BingoAudioSystem | null = null;

export function getBingoAudio(): BingoAudioSystem {
  if (!instance) {
    instance = new BingoAudioSystem();
  }
  return instance;
}

export function destroyBingoAudio(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
