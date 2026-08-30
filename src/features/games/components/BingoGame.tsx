// ==============================================================================
// RASPANDO LA OLLA — JUEGO DE SORTEO DE BINGO VIRTUAL AUTOMÁTICO
// Modos 90, 80 y 75 Bolas — Realtime, Cartones Únicos, Cierre a 10s y Winner Modal
// ==============================================================================

import React, { useState, useEffect } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import type { BingoState, BingoCard75, BingoVariant } from '../../../types/games';
import { TableRepository } from '../../../services/repositories/TableRepository';
import { BcvRepository } from '../../../services/repositories/BcvRepository';
import { getSupabaseClient } from '../../../lib/supabase/client';
import { BingoBoard } from './BingoBoard';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, Sparkles, CheckCircle2, ShoppingBag, ShieldCheck, ArrowLeft, Radio, Lock } from 'lucide-react';

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
  } | null>(null);

  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [isSalesClosed, setIsSalesClosed] = useState<boolean>(false);
  const [isClaimingBingo, setIsClaimingBingo] = useState<boolean>(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Cargar Tasa BCV
  useEffect(() => {
    BcvRepository.getBcvRate().then((res) => {
      if (res?.rate) setBcvRate(res.rate);
    });
  }, []);

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

      // Actualizar estado local de cartones
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

  // Suscripción Realtime a game_sessions para balotas e inicio de sorteo
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
    });
  };

  // Reclamo atómico server-authoritative de Bingo (rpc_claim_bingo_secure)
  const handleClaimBingo = async () => {
    if (!currentUserId || isClaimingBingo || bingoState.winnerUserId) return;

    setIsClaimingBingo(true);
    setClaimError(null);

    try {
      // Buscar ID de sesión asociado a la mesa
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data: session } = await supabase
        .from('game_sessions')
        .select('id')
        .eq('table_id', table.id)
        .maybeSingle();

      const sessionId = session?.id;
      if (!sessionId) {
        setClaimError('No se encontró la sesión de juego activa.');
        return;
      }

      const res = await TableRepository.claimBingo(sessionId);
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

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-2xl mx-auto space-y-4">
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
      />

      {/* MODAL / OVERLAY DE GANADOR DE BINGO */}
      {isGameOver && winnerInfo && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 text-center space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="relative inline-block">
              <div className="w-20 h-20 rounded-full mx-auto border-4 border-amber-400 overflow-hidden shadow-2xl">
                {winnerInfo.winnerAvatar ? (
                  <img src={winnerInfo.winnerAvatar} alt={winnerInfo.winnerName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-amber-500 flex items-center justify-center text-slate-950 font-black text-2xl">
                    🏆
                  </div>
                )}
              </div>
              <div className="absolute -bottom-2 right-0 bg-amber-500 text-slate-950 font-black text-xs px-2 py-0.5 rounded-full uppercase shadow">
                ¡BINGO!
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-black text-amber-400 uppercase tracking-tight">
                {isWinner ? '¡FELICIDADES! ¡GANASTE!' : '¡TENEMOS UN GANADOR!'}
              </div>
              <p className="text-sm font-bold text-slate-100">{winnerInfo.winnerName}</p>
              <p className="text-xs text-slate-400 font-mono">
                Premio Acreditado: <strong className="text-emerald-400 font-bold">{winnerInfo.prizeBs.toFixed(2)} Bs</strong>
                <span className="text-slate-500 ml-1">({BcvRepository.formatUsdCompact(winnerInfo.prizeBs, bcvRate)})</span>
              </p>
            </div>

            <Button variant="primary" onClick={onLeave} className="w-full py-3.5 text-slate-950 font-black text-sm">
              Volver al Lobby de Sorteos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
