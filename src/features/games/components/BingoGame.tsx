// ==============================================================================
// RASPANDO LA OLLA — JUEGO DE SORTEO DE BINGO VIRTUAL AUTOMÁTICO
// Modos 90, 80 y 75 Bolas — Realtime, Cartones Únicos, Cierre a 10s y Winner Modal
// ==============================================================================

import React, { useState, useEffect } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import type { BingoState, BingoCard75, BingoCard80, BingoCard90, BingoVariant } from '../../../types/games';
import { TableRepository } from '../../../services/repositories/TableRepository';
import { BcvRepository } from '../../../services/repositories/BcvRepository';
import { getSupabaseClient } from '../../../lib/supabase/client';
import { getBingoAudio, destroyBingoAudio } from '../../../utils/bingoAudio';
import { BingoBoard } from './BingoBoard';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, Sparkles, CheckCircle2, ShoppingBag, ShieldCheck, ArrowLeft, Radio, Lock, Volume2, VolumeX } from 'lucide-react';

interface BingoGameProps {
  table: GameTable;
  players: TablePlayer[];
  currentUserId?: string;
  onLeave: () => void;
}

export function BingoGame({ table, players, currentUserId = '', onLeave }: BingoGameProps) {
  const variant: BingoVariant = (table.config?.variant as BingoVariant) || '75';
  const totalBalls = variant === '90' ? 90 : variant === '80' ? 80 : 75;

  const [bcvRate, setBcvRate] = useState<number>(50);
  const [buyingCards, setBuyingCards] = useState<boolean>(false);
  const [cardsPurchasedCount, setCardsPurchasedCount] = useState<number>(0);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // Estado del Bingo
  const [bingoState, setBingoState] = useState<BingoState>({
    variant,
    drawnBalls: [],
    currentBall: null,
    cards: {},
    cardsPurchased: {},
    playerNames: {},
    winnerUserId: null,
    status: 'in_progress',
    callIntervalMs: 3500,
    totalBalls,
    totalPoolBs: table.entryFee || 10,
    winnerPoolBs: Math.round((table.entryFee || 10) * 0.90 * 100) / 100,
    systemFeeBs: Math.round((table.entryFee || 10) * 0.10 * 100) / 100,
  });

  const [winnerInfo, setWinnerInfo] = useState<{
    winnerUserId: string;
    winnerName: string;
    winnerAvatar?: string;
    prizeBs: number;
    winnerPhotoUrl?: string;
  } | null>(null);

  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [isSalesClosed, setIsSalesClosed] = useState<boolean>(false);
  const [isClaimingBingo, setIsClaimingBingo] = useState<boolean>(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // ID de Sesión para sorteo automático y foto
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Sorteo automático del Host
  const [isAutoDrawing, setIsAutoDrawing] = useState<boolean>(false);
  const [drawIntervalMs, setDrawIntervalMs] = useState<number>(5000);

  // Estados de captura de fotografía del ganador
  const [photoCountdown, setPhotoCountdown] = useState<number | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [photoUploaded, setPhotoUploaded] = useState<boolean>(false);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Control de audio Web Audio API y silenciador persistente
  const [audioReady, setAudioReady] = useState<boolean>(false);
  const [audioLoading, setAudioLoading] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioVolume, setAudioVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem('bingo_audio_muted') === 'true';
  });
  const bingoAudio = getBingoAudio();
  const lastPlayedBallRef = React.useRef<number | null>(null);

  const toggleMute = () => {
    setIsMuted((prev) => {
      const newVal = !prev;
      localStorage.setItem('bingo_audio_muted', String(newVal));
      return newVal;
    });
  };

  // Activar sistema de audio (requiere interacción del usuario)
  const handleActivateAudio = async () => {
    console.log('[BingoGame] handleActivateAudio llamada');
    setAudioLoading(true);
    setAudioError(null);

    try {
      console.log('[BingoGame] Inicializando sistema de audio...');
      await bingoAudio.initialize();
      await bingoAudio.unlock();
      setAudioReady(true);
      
      const stats = bingoAudio.getStats();
      console.log('[BingoGame] ✓ Audio activado correctamente:', stats);
      
      // Probar reproducción con balota de prueba
      console.log('[BingoGame] Probando reproducción de balota 1...');
      await bingoAudio.playBall(1, variant, 5000);
      console.log('[BingoGame] ✓ Prueba de audio exitosa');
    } catch (error: any) {
      console.error('[BingoGame] Error activando audio:', error);
      setAudioError(error.message || 'Error al activar audio');
      setAudioReady(false);
    } finally {
      setAudioLoading(false);
    }
  };

  // Cleanup del reproductor de audio al desmontar
  useEffect(() => {
    return () => {
      console.log('[BingoGame] Destruyendo sistema de audio...');
      destroyBingoAudio();
    };
  }, []);

  const isHost = table.hostUserId === currentUserId;

  // Cargar Tasa BCV
  useEffect(() => {
    BcvRepository.getBcvRate().then((res) => {
      if (res?.rate) setBcvRate(res.rate);
    });
  }, []);

  // Obtener sessionId en mount
  useEffect(() => {
    const fetchSessionId = async () => {
      const supabase = getSupabaseClient();
      if (!supabase || !table.id) return;
      const { data } = await supabase
        .from('game_sessions')
        .select('id')
        .eq('table_id', table.id)
        .maybeSingle();
      if (data?.id) {
        setSessionId(data.id);
      }
    };
    fetchSessionId();
  }, [table.id]);

  // Sincronizar temporizador server-authoritative
  useEffect(() => {
    const scheduledStartStr = table.config?.scheduled_start_at;
    if (!scheduledStartStr) return;

    const interval = setInterval(() => {
      const scheduledStart = new Date(String(scheduledStartStr));
      const diffMs = scheduledStart.getTime() - Date.now();
      const secs = Math.max(0, Math.floor(diffMs / 1000));

      setCountdownSeconds(secs);
      if (secs <= 10 && secs > 0) {
        setIsSalesClosed(true);
      } else {
        setIsSalesClosed(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [table.config?.scheduled_start_at]);

  // Función auxiliar robusta para distribuir los 15 números del Bingo 90 en una grilla de 3x9
  const buildBingo90Rows = (numbers: number[]): (number | null)[][] => {
    const sorted = [...numbers].sort((a, b) => a - b);
    const finalGrid: (number | null)[][] = Array.from({ length: 3 }, () => Array(9).fill(null));

    const chunk1 = sorted.slice(0, 5);
    const chunk2 = sorted.slice(5, 10);
    const chunk3 = sorted.slice(10, 15);
    const chunks = [chunk1, chunk2, chunk3];

    chunks.forEach((chunk, r) => {
      chunk.forEach((n) => {
        let colIdx = Math.floor(n / 10);
        if (colIdx > 8) colIdx = 8;

        if (finalGrid[r][colIdx] !== null) {
          let placed = false;
          for (let offset = 1; offset < 9; offset++) {
            if (colIdx - offset >= 0 && finalGrid[r][colIdx - offset] === null) {
              finalGrid[r][colIdx - offset] = n;
              placed = true;
              break;
            }
            if (colIdx + offset < 9 && finalGrid[r][colIdx + offset] === null) {
              finalGrid[r][colIdx + offset] = n;
              placed = true;
              break;
            }
          }
          if (!placed) {
            for (let c = 0; c < 9; c++) {
              if (finalGrid[r][c] === null) {
                finalGrid[r][c] = n;
                break;
              }
            }
          }
        } else {
          finalGrid[r][colIdx] = n;
        }
      });
    });

    return finalGrid;
  };

  // Cargar/comprar cartones para el usuario si no los tiene aún
  const handleBuyCards = async (count: number) => {
    if (!currentUserId || !table.id) return;
    setBuyingCards(true);
    setPurchaseError(null);

    try {
      const res = await TableRepository.buyBingoCards(table.id, count, variant, table.entryFee || 10);
      if (!res.success) {
        setPurchaseError(res.error || 'Error al comprar cartones.');
        return;
      }

      setCardsPurchasedCount((prevCount) => prevCount + count);

      if (variant === '75') {
        const userCards75: BingoCard75[] = (res.cards || []).map((c: any) => ({
          b: c.b || [1, 2, 3, 4, 5],
          i: c.i || [16, 17, 18, 19, 20],
          n: c.n || [31, 32, 'FREE', 33, 34],
          g: c.g || [46, 47, 48, 49, 50],
          o: c.o || [61, 62, 63, 64, 65],
          marked: c.marked || [
            [false, false, false, false, false],
            [false, false, false, false, false],
            [false, false, true, false, false],
            [false, false, false, false, false],
            [false, false, false, false, false],
          ],
        }));

        setBingoState((prevState) => ({
          ...prevState,
          cards: {
            ...prevState.cards,
            [currentUserId]: [...(prevState.cards[currentUserId] || []), ...userCards75],
          },
        }));
      } else if (variant === '80') {
        const userCards80: BingoCard80[] = (res.cards || []).map((c: any) => ({
          grid: c.grid || [
            [1, 2, 3, 4],
            [21, 22, 23, 24],
            [41, 42, 43, 44],
            [61, 62, 63, 64]
          ],
          marked: c.marked || [
            [false, false, false, false],
            [false, false, false, false],
            [false, false, false, false],
            [false, false, false, false],
          ],
        }));

        setBingoState((prevState) => ({
          ...prevState,
          cards80: {
            ...prevState.cards80,
            [currentUserId]: [...(prevState.cards80?.[currentUserId] || []), ...userCards80],
          },
        }));
      } else if (variant === '90') {
        const userCards90: BingoCard90[] = (res.cards || []).map((c: any) => {
          const numbers = c.numbers || [1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 21, 22, 23, 24, 25];
          const rows = buildBingo90Rows(numbers);
          return {
            rows,
            marked: c.marked || [
              Array(9).fill(false),
              Array(9).fill(false),
              Array(9).fill(false),
            ],
          };
        });

        setBingoState((prevState) => ({
          ...prevState,
          cards90: {
            ...prevState.cards90,
            [currentUserId]: [...(prevState.cards90?.[currentUserId] || []), ...userCards90],
          },
        }));
      }
    } catch (err: any) {
      setPurchaseError(err.message || 'Error al procesar compra.');
    } finally {
      setBuyingCards(false);
    }
  };

  // Auto-comprar 1 cartón por defecto al ingresar a la mesa si aún no posee cartones
  useEffect(() => {
    if (currentUserId && cardsPurchasedCount === 0 && !isSalesClosed) {
      handleBuyCards(1);
    }
  }, [currentUserId]);

  // Función mejorada para reproducir audio de balota
  const playBallAudio = async (ball: number): Promise<void> => {
    console.log(`[BingoGame] playBallAudio llamada con ball=${ball}, isMuted=${isMuted}, audioReady=${audioReady}`);
    
    if (isMuted) {
      console.log('[BingoGame] Audio silenciado, saltando reproducción');
      return;
    }

    if (!audioReady) {
      console.warn('[BingoGame] Audio no está listo. Usuario debe activarlo primero.');
      return;
    }

    try {
      console.log(`[BingoGame] Reproduciendo balota ${ball}...`);
      await bingoAudio.playBall(ball, variant, drawIntervalMs);
      console.log(`[BingoGame] ✓ Balota ${ball} reproducida`);
    } catch (error) {
      console.error('[BingoGame] Error reproduciendo audio:', error);
    }
  };

  // Reproducir audio cuando cambie la balota actual
  useEffect(() => {
    const ball = bingoState.currentBall;
    
    console.log(`[BingoGame] useEffect detectó cambio de balota:`, {
      ball,
      lastPlayed: lastPlayedBallRef.current,
      audioReady,
      isMuted
    });

    if (ball !== null && ball !== undefined && ball !== lastPlayedBallRef.current) {
      lastPlayedBallRef.current = ball;
      
      console.log(`[BingoGame] Nueva balota detectada: ${ball}`);
      
      // Pequeño delay para asegurar que el estado se actualizó
      const timer = setTimeout(() => {
        playBallAudio(ball);
      }, 200);

      return () => clearTimeout(timer);
    }
  }, [bingoState.currentBall, isMuted, audioReady, drawIntervalMs, variant]);

  // Sorteo automático - Soporte Dual: Host Humano o Autónomo por Clientes en Mesas de Sistema
  useEffect(() => {
    if (bingoState.winnerUserId || bingoState.status === 'finished') {
      return;
    }

    const isAutomatedTable = Boolean(table.config?.automated);
    // Para mesas automatizadas, el sorteo lo maneja 100% el servidor en segundo plano de forma autónoma.
    // Solo permitimos el interval en el cliente si es un anfitrión humano en una mesa no automatizada.
    const shouldDraw = isHost && isAutoDrawing && !isAutomatedTable;

    if (!shouldDraw || !sessionId) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const { RngService } = await import('../../../services/rng/RngService');
        const res = await RngService.drawBingoBallSecure(sessionId);
        if (!res.success) {
          // El rate limit del servidor se maneja silenciosamente
          if (res.error?.includes('todas las balotas')) {
            if (isHost) {
              setIsAutoDrawing(false);
            }
          }
        }
      } catch (err) {
        console.error('[BingoGame] Error en sorteo automático:', err);
      }
    }, drawIntervalMs);

    return () => clearInterval(interval);
  }, [isAutoDrawing, drawIntervalMs, sessionId, isHost, table.config?.automated, countdownSeconds, bingoState.winnerUserId, bingoState.status]);

  // Suscripción Realtime a game_sessions para balotas, inicio de sorteo y fotos de ganadores
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !table.id) return;

    const channel = supabase
      .channel(`bingo_session_${table.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `table_id=eq.${table.id}` },
        (payload: any) => {
          const newState = payload.new?.current_state;
          if (newState) {
            setBingoState((prev) => ({
              ...prev,
              drawnBalls: newState.drawnBalls || prev.drawnBalls,
              currentBall: newState.currentBall ?? prev.currentBall,
              winnerUserId: newState.winnerUserId || prev.winnerUserId,
            }));

            if (newState.winnerUserId) {
              setWinnerInfo({
                winnerUserId: newState.winnerUserId,
                winnerName: newState.winnerName || 'Jugador Ganador',
                winnerAvatar: newState.winnerAvatar,
                prizeBs: newState.winnerPoolBs || 0,
                winnerPhotoUrl: newState.winnerPhotoUrl, // Sincronización Realtime instantánea de foto!
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table.id]);

  // Manejo de marcado interactivo de números en el cartón
  const handleMarkNumber = (row: number, col: number) => {
    if (!currentUserId || bingoState.winnerUserId) return;

    setBingoState((prev) => {
      if (variant === '75') {
        const userCards = prev.cards[currentUserId] || [];
        if (userCards.length === 0) return prev;

        const updatedCards = userCards.map((card) => {
          const newMarked = card.marked.map((rArr, rIdx) =>
            rArr.map((mVal, cIdx) => (rIdx === row && cIdx === col ? !mVal : mVal))
          );
          return { ...card, marked: newMarked };
        });

        return {
          ...prev,
          cards: { ...prev.cards, [currentUserId]: updatedCards },
        };
      } else if (variant === '80') {
        const userCards80 = prev.cards80?.[currentUserId] || [];
        if (userCards80.length === 0) return prev;

        const updatedCards = userCards80.map((card) => {
          const newMarked = card.marked.map((rArr, rIdx) =>
            rArr.map((mVal, cIdx) => (rIdx === row && cIdx === col ? !mVal : mVal))
          );
          return { ...card, marked: newMarked };
        });

        return {
          ...prev,
          cards80: { ...prev.cards80, [currentUserId]: updatedCards },
        };
      } else {
        const userCards90 = prev.cards90?.[currentUserId] || [];
        if (userCards90.length === 0) return prev;

        const updatedCards = userCards90.map((card) => {
          const newMarked = card.marked.map((rArr, rIdx) =>
            rArr.map((mVal, cIdx) => (rIdx === row && cIdx === col ? !mVal : mVal))
          );
          return { ...card, marked: newMarked };
        });

        return {
          ...prev,
          cards90: { ...prev.cards90, [currentUserId]: updatedCards },
        };
      }
    });
  };

  // Reclamo atómico server-authoritative de Bingo (rpc_claim_bingo_secure)
  const handleClaimBingo = async () => {
    if (!currentUserId || isClaimingBingo || bingoState.winnerUserId) return;

    setIsClaimingBingo(true);
    setClaimError(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data: session } = await supabase
        .from('game_sessions')
        .select('id')
        .eq('table_id', table.id)
        .maybeSingle();

      const sid = session?.id;
      if (!sid) {
        setClaimError('No se encontró la sesión de juego activa.');
        return;
      }

      const res = await TableRepository.claimBingo(sid);
      if (!res.success) {
        setClaimError(res.error || 'Canto de Bingo no válido.');
        return;
      }

      setWinnerInfo({
        winnerUserId: res.winnerUserId || currentUserId,
        winnerName: res.winnerName || 'Jugador Ganador',
        winnerAvatar: res.winnerAvatar,
        prizeBs: res.prizeBs || bingoState.winnerPoolBs,
      });

      setBingoState((prev) => ({
        ...prev,
        winnerUserId: res.winnerUserId || currentUserId,
        status: 'bingo_won',
      }));
    } catch (err: any) {
      setClaimError(err.message || 'Error al cantar Bingo.');
    } finally {
      setIsClaimingBingo(false);
    }
  };

  const isGameOver = Boolean(bingoState.winnerUserId || winnerInfo);
  const isWinner = (winnerInfo?.winnerUserId || bingoState.winnerUserId) === currentUserId;

  // Iniciar cuenta regresiva de 7 segundos si el usuario es el ganador
  useEffect(() => {
    if (isGameOver && isWinner && photoCountdown === null && !photoUploaded) {
      setPhotoCountdown(7);
    }
  }, [isGameOver, isWinner]);

  // Loop de cuenta regresiva de 7 segundos
  useEffect(() => {
    if (!isGameOver || !isWinner || photoCountdown === null) return;
    if (photoCountdown === 0) {
      triggerCameraCapture();
      setPhotoCountdown(null);
      return;
    }

    const t = setTimeout(() => {
      setPhotoCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(t);
  }, [isGameOver, isWinner, photoCountdown]);

  const triggerCameraCapture = () => {
    const input = document.getElementById('camera-input') as HTMLInputElement;
    if (input) {
      input.click();
    }
  };

  // Compresión de imagen y subida a Supabase Storage con registro transaccional
  const compressAndUploadPhoto = async (file: File) => {
    if (!sessionId || !currentUserId) return;
    setIsUploadingPhoto(true);
    setPhotoError(null);

    try {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };

      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 640;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No se pudo inicializar contexto Canvas.');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            setPhotoError('Fallo en la compresión de fotografía.');
            setIsUploadingPhoto(false);
            return;
          }

          try {
            const supabase = getSupabaseClient();
            if (!supabase) throw new Error('Servidor no disponible.');

            const filePath = `${table.id}/${currentUserId}/${Date.now()}.jpg`;

            const { data, error } = await supabase.storage
              .from('bingo-winners')
              .upload(filePath, blob, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: true,
              });

            if (error) {
              console.error('[BingoGame] Error al subir foto:', error);
              throw new Error(error.message || 'Error al guardar archivo en Storage.');
            }

            const { data: urlData } = supabase.storage
              .from('bingo-winners')
              .getPublicUrl(filePath);

            const photoUrl = urlData.publicUrl;

            // Registrar en base de datos de la sesión
            const dbRes = await TableRepository.registerWinnerPhoto(sessionId, photoUrl);
            if (!dbRes.success) {
              throw new Error(dbRes.error || 'Error al asociar foto al ganador.');
            }

            setUploadedPhotoUrl(photoUrl);
            setPhotoUploaded(true);
          } catch (err: any) {
            setPhotoError(err.message || 'Error al procesar subida.');
          } finally {
            setIsUploadingPhoto(false);
          }
        }, 'image/jpeg', 0.85);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setPhotoError(err.message || 'Error al abrir archivo.');
      setIsUploadingPhoto(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-2xl mx-auto space-y-4">
      {/* Input de cámara oculto */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        id="camera-input"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            compressAndUploadPhoto(file);
          }
        }}
      />

      {/* Botón de Salida y Encabezado de la Sala */}
      <div className="w-full flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-2xl p-3">
        <button
          onClick={onLeave}
          className="flex items-center space-x-1.5 text-xs font-bold text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-amber-400" />
          <span>Volver al Lobby</span>
        </button>

        <div className="text-right font-mono">
          <span className="text-[10px] text-slate-400 uppercase">MESA PÚBLICA DE BINGO</span>
          <div className="text-xs font-bold text-amber-400 uppercase">
            {variant} BOLAS (Bs. {table.entryFee || 10})
          </div>
        </div>
      </div>

      {/* PANEL DE CONTROL PARA EL HOST (ANFITRIÓN) */}
      {isHost && !isGameOver && (
        <div id="host-draw-panel" className="w-full bg-slate-950 border-2 border-amber-500/40 rounded-2xl p-4 flex flex-col space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Radio className={`w-4 h-4 ${isAutoDrawing ? 'text-red-500 animate-ping' : 'text-slate-500'}`} />
              <span className="text-xs font-black text-slate-100 uppercase tracking-wider font-mono">
                Panel de Sorteo del Anfitrión
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-bold border border-amber-500/30">
              Host
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400">Velocidad:</span>
              <select
                value={drawIntervalMs}
                onChange={(e) => setDrawIntervalMs(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-slate-100 text-xs rounded-lg p-1.5 focus:ring-1 focus:ring-amber-500 font-mono focus:outline-none"
              >
                <option value={3000}>3 Segundos</option>
                <option value={5000}>5 Segundos (Recomendado)</option>
                <option value={7000}>7 Segundos</option>
                <option value={10000}>10 Segundos</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant={isAutoDrawing ? 'danger' : 'primary'}
                className="font-black text-[11px] py-2 px-4 rounded-xl shadow-md"
                onClick={() => setIsAutoDrawing(!isAutoDrawing)}
              >
                {isAutoDrawing ? '⏹️ Detener Sorteo' : '▶️ Iniciar Sorteo'}
              </Button>

              <Button
                variant="secondary"
                disabled={isAutoDrawing}
                className="font-black text-[11px] py-2 px-4 rounded-xl border border-slate-700 hover:bg-slate-800"
                onClick={async () => {
                  const { RngService } = await import('../../../services/rng/RngService');
                  if (sessionId) {
                    await RngService.drawBingoBallSecure(sessionId);
                  }
                }}
              >
                🔮 Extraer 1 Bola
              </Button>
            </div>
          </div>

          {/* Panel de Control de Audio */}
          <div className="mt-4 border-t border-slate-800 pt-4">
            <h4 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2">
              <span>🔊</span>
              <span>Control de Audio</span>
            </h4>

            {!audioReady && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
                <p className="text-xs text-amber-200">
                  <strong>⚠️ Audio no activado</strong>
                  <br />
                  Los navegadores requieren interacción del usuario para reproducir audio automáticamente.
                </p>
                
                <button
                  onClick={handleActivateAudio}
                  disabled={audioLoading}
                  className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 disabled:cursor-not-allowed text-slate-950 font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {audioLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Cargando audios...</span>
                    </>
                  ) : (
                    <>
                      <span>🔊</span>
                      <span>Activar Audio del Bingo</span>
                    </>
                  )}
                </button>

                {audioError && (
                  <div className="p-2 bg-red-500/20 border border-red-500/40 rounded-lg">
                    <p className="text-xs text-red-300">
                      <strong>Error:</strong> {audioError}
                    </p>
                  </div>
                )}
              </div>
            )}

            {audioReady && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="font-bold">Audio activado y listo</span>
                </div>

                {/* Control de Volumen */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 min-w-[60px]">Volumen:</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(audioVolume * 100)}
                    onChange={(e) => {
                      const volume = Number(e.target.value) / 100;
                      bingoAudio.setVolume(volume);
                      setAudioVolume(volume);
                    }}
                    disabled={isMuted}
                    className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-xs text-slate-300 font-mono min-w-[35px]">{Math.round(audioVolume * 100)}%</span>
                </div>

                {/* Botón Mute */}
                <button
                  onClick={toggleMute}
                  className={`w-full px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                    isMuted
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                  }`}
                >
                  {isMuted ? '🔇 Audio Silenciado' : '🔊 Audio Activado'}
                </button>

                {/* Botón de Prueba */}
                <button
                  onClick={() => bingoAudio.playBall(42, variant, 5000)}
                  disabled={isMuted}
                  className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/50 disabled:cursor-not-allowed text-slate-200 text-xs font-bold rounded-lg transition-colors"
                >
                  🎵 Probar Audio (Balota 42)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Control de Audio para Jugadores (No Host) */}
      {!isHost && !isGameOver && (
        <div className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3">
          {!audioReady ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-xs text-amber-300">
                <span>🔊</span>
                <span>Activa el audio para escuchar las balotas cantadas:</span>
              </div>
              <button
                onClick={handleActivateAudio}
                disabled={audioLoading}
                className="w-full sm:w-auto px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-md"
              >
                {audioLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{audioLoading ? 'Cargando...' : 'Activar Audio'}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-emerald-400 font-bold">Audio activo</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(audioVolume * 100)}
                  onChange={(e) => {
                    const volume = Number(e.target.value) / 100;
                    bingoAudio.setVolume(volume);
                    setAudioVolume(volume);
                  }}
                  disabled={isMuted}
                  className="w-20 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                    isMuted
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {isMuted ? '🔇 Mudo' : '🔊 ON'}
                </button>
                <button
                  onClick={() => bingoAudio.playBall(42, variant, 5000)}
                  disabled={isMuted}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold"
                >
                  🎵 Probar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comprar Cartones Adicionales si las ventas siguen abiertas */}
      {!isSalesClosed && !isGameOver && (
        <div className="w-full bg-slate-950 border border-amber-500/30 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-slate-300 font-mono">
            <ShoppingBag className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Mis Cartones: <strong>{cardsPurchasedCount}</strong> (Máx. 20)</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleBuyCards(1)}
              disabled={buyingCards || cardsPurchasedCount >= 20}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all disabled:opacity-50"
            >
              +1 Cartón ({table.entryFee || 10} Bs)
            </button>
            <button
              onClick={() => handleBuyCards(3)}
              disabled={buyingCards || cardsPurchasedCount >= 18}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow-md transition-all disabled:opacity-50"
            >
              +3 Cartones
            </button>
          </div>
        </div>
      )}

      {purchaseError && (
        <div className="w-full p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center font-mono">
          {purchaseError}
        </div>
      )}

      {claimError && (
        <div className="w-full p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center font-mono animate-bounce">
          {claimError}
        </div>
      )}

      {/* Tablero de Bingo Multimodal */}
      <BingoBoard
        state={bingoState}
        currentUserId={currentUserId}
        onMarkNumber={handleMarkNumber}
        onClaimBingo={handleClaimBingo}
        isSalesClosed={isSalesClosed}
        countdownSeconds={countdownSeconds}
        bcvRate={bcvRate}
        isMuted={isMuted}
        onToggleMute={toggleMute}
      />

      {/* MODAL / OVERLAY DE GANADOR DE BINGO */}
      {isGameOver && winnerInfo && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 text-center space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="relative inline-block">
              {/* Contenedor de Foto Real del Ganador o Avatar */}
              <div className="w-40 h-40 rounded-full mx-auto border-4 border-amber-400 overflow-hidden shadow-2xl bg-slate-950 relative flex items-center justify-center">
                {winnerInfo.winnerPhotoUrl ? (
                  <img
                    src={winnerInfo.winnerPhotoUrl}
                    alt={winnerInfo.winnerName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : winnerInfo.winnerAvatar ? (
                  <img src={winnerInfo.winnerAvatar} alt={winnerInfo.winnerName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-slate-900 flex items-center justify-center text-slate-500 font-black text-4xl">
                    🏆
                  </div>
                )}

                {/* Overlay de Carga */}
                {isUploadingPhoto && (
                  <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-amber-400 text-xs space-y-1">
                    <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
                    <span>Guardando foto...</span>
                  </div>
                )}
              </div>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 font-black text-xs px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
                ¡BINGO!
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-black text-amber-400 uppercase tracking-tight">
                {isWinner ? '¡FELICIDADES! ¡GANASTE!' : '¡TENEMOS UN GANADOR!'}
              </div>
              <p className="text-sm font-extrabold text-slate-100">{winnerInfo.winnerName}</p>
              <p className="text-xs text-slate-400 font-mono">
                Premio Acreditado: <strong className="text-emerald-400 font-black">{winnerInfo.prizeBs.toFixed(2)} Bs</strong>
                <span className="text-slate-500 ml-1">({BcvRepository.formatUsdCompact(winnerInfo.prizeBs, bcvRate)})</span>
              </p>
            </div>

            {/* Bloque de Captura de Fotografía para el Ganador */}
            {isWinner && (
              <div className="border border-slate-800 bg-slate-950/50 rounded-2xl p-4 space-y-3">
                {photoCountdown !== null && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-300 uppercase tracking-wider animate-pulse">
                      ¡Prepárate para tu foto de victoria!
                    </p>
                    <div className="text-4xl font-black text-amber-400 font-mono">
                      {photoCountdown}
                    </div>
                  </div>
                )}

                {photoError && (
                  <p className="text-[11px] text-red-400 font-mono">{photoError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={triggerCameraCapture}
                    disabled={isUploadingPhoto}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-all"
                  >
                    📸 TOMAR FOTO DE VICTORIA
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  La foto será visible públicamente en el Historial de Ganadores de Bingo.
                </p>
              </div>
            )}

            <Button variant="primary" onClick={onLeave} className="w-full py-3.5 text-slate-950 font-black text-sm">
              Volver al Lobby de Sorteos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
