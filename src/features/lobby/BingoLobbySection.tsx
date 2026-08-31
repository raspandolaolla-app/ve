// ==============================================================================
// RASPANDO LA OLLA — SECCIÓN DESTACADA: SORTEO DE BINGO VIRTUAL AUTOMÁTICO
// Modos 90, 80 y 75 Bolas — Temporizador Server-Authoritative, Pozo 90/10 y Realtime
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Radio, Users, Trophy, Lock, Play, Timer, ArrowRight, ShieldCheck, Ticket } from 'lucide-react';
import { BcvRepository } from '../../services/repositories/BcvRepository';
import { TableRepository } from '../../services/repositories/TableRepository';
import { getSupabaseClient } from '../../lib/supabase/client';

interface BingoLobbySectionProps {
  onSelectBingoVariant: (variant: '75' | '80' | '90', tableId: string) => void;
  onlineCount: number;
}

interface AutomatedBingoTableInfo {
  variant: '75' | '80' | '90';
  tableId: string;
  status: string;
  currentPlayersCount: number;
  cardsSoldCount: number;
  totalPoolBs: number;
  winnerPoolBs: number;
  scheduledStartAt: string | null;
  secondsRemaining: number | null;
}

export const BingoLobbySection: React.FC<BingoLobbySectionProps> = ({
  onSelectBingoVariant,
  onlineCount,
}) => {
  const [bcvRate, setBcvRate] = useState<number>(50);
  const [loadingVariant, setLoadingVariant] = useState<string | null>(null);

  const [tablesInfo, setTablesInfo] = useState<Record<string, AutomatedBingoTableInfo>>({
    '90': {
      variant: '90',
      tableId: '',
      status: 'WAITING_FOR_PLAYERS',
      currentPlayersCount: 0,
      cardsSoldCount: 0,
      totalPoolBs: 0,
      winnerPoolBs: 0,
      scheduledStartAt: null,
      secondsRemaining: null,
    },
    '80': {
      variant: '80',
      tableId: '',
      status: 'WAITING_FOR_PLAYERS',
      currentPlayersCount: 0,
      cardsSoldCount: 0,
      totalPoolBs: 0,
      winnerPoolBs: 0,
      scheduledStartAt: null,
      secondsRemaining: null,
    },
    '75': {
      variant: '75',
      tableId: '',
      status: 'WAITING_FOR_PLAYERS',
      currentPlayersCount: 0,
      cardsSoldCount: 0,
      totalPoolBs: 0,
      winnerPoolBs: 0,
      scheduledStartAt: null,
      secondsRemaining: null,
    },
  });

  const [bingoWinnersHistory, setBingoWinnersHistory] = useState<any[]>([]);

  const loadBingoWinnersHistory = async () => {
    const data = await TableRepository.getBingoWinnerHistory();
    setBingoWinnersHistory(data);
  };

  // Cargar Tasa BCV y Historial
  useEffect(() => {
    BcvRepository.getBcvRate().then((res) => {
      if (res?.rate) setBcvRate(res.rate);
    });
    loadBingoWinnersHistory();
  }, []);

  // Suscripción Realtime para el historial de ganadores de Bingo
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel('bingo_winners_history_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bingo_winner_history' },
        () => {
          loadBingoWinnersHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Cargar/sincronizar mesas automáticas de Bingo
  const syncBingoTables = async () => {
    const variants: ('75' | '80' | '90')[] = ['90', '80', '75'];
    const updatedMap = { ...tablesInfo };

    for (const v of variants) {
      const res = await TableRepository.getOrCreateAutomatedBingoTable(v);
      if (res.success && res.tableId) {
        const table = await TableRepository.getTableById(res.tableId);
        if (table) {
          const config = table.config || {};
          const scheduledStartRaw = config.scheduled_start_at;
          const scheduledStart = scheduledStartRaw ? new Date(String(scheduledStartRaw)) : null;
          let secs: number | null = null;
          let statusText: string = String(table.status || 'WAITING_FOR_PLAYERS');

          if (scheduledStart) {
            const diffMs = scheduledStart.getTime() - Date.now();
            secs = Math.max(0, Math.floor(diffMs / 1000));
            if (secs <= 10 && secs > 0) {
              statusText = 'SALES_CLOSED';
            } else if (secs === 0) {
              statusText = 'DRAWING';
            } else {
              statusText = 'COUNTDOWN';
            }
          } else if (table.currentPlayersCount < 2) {
            statusText = 'WAITING_FOR_PLAYERS';
          }

          const cardCount = Number(config.cards_sold || (table.currentPlayersCount * 2));
          const totalBs = (table.entryFee || 25) * Math.max(1, cardCount);
          const winnerBs = Math.round(totalBs * 0.90 * 100) / 100;

          updatedMap[v] = {
            variant: v,
            tableId: table.id,
            status: statusText,
            currentPlayersCount: table.currentPlayersCount,
            cardsSoldCount: cardCount,
            totalPoolBs: totalBs,
            winnerPoolBs: winnerBs,
            scheduledStartAt: scheduledStartRaw ? String(scheduledStartRaw) : null,
            secondsRemaining: secs,
          };
        }
      }
    }

    setTablesInfo(updatedMap);
  };

  useEffect(() => {
    syncBingoTables();
    const timer = setInterval(() => {
      syncBingoTables();
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Suscripción Realtime a game_tables
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel('bingo_tables_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_tables' },
        () => {
          syncBingoTables();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleJoinVariant = async (variant: '75' | '80' | '90') => {
    setLoadingVariant(variant);
    try {
      const res = await TableRepository.getOrCreateAutomatedBingoTable(variant);
      if (res.success && res.tableId) {
        onSelectBingoVariant(variant, res.tableId);
      } else {
        alert(res.error || 'No fue posible ingresar a la mesa de Bingo.');
      }
    } catch (err: any) {
      alert(err.message || 'Error al conectar.');
    } finally {
      setLoadingVariant(null);
    }
  };

  const formatSeconds = (secs: number | null): string => {
    if (secs === null) return '02:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div id="section-bingo-virtual" className="space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-amber-400 animate-ping" />
            <h2 className="text-xl font-black text-slate-100 uppercase tracking-wide">
              🎱 Sorteo de Bingo Virtual Automático
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Mesas públicas server-authoritative con temporizador sincronizado y regla de premio 90/10
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>RNG Criptográfico Cero Mocks</span>
        </div>
      </div>

      {/* Grid con las 3 Modalidades: 90, 80 y 75 Bolas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            variant: '90' as const,
            title: 'BINGO 90 BOLAS',
            sub: '3 filas × 9 cols (15 núms)',
            color: 'from-amber-500/20 to-yellow-600/10 border-amber-500/40',
            badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          },
          {
            variant: '80' as const,
            title: 'BINGO 80 BOLAS',
            sub: '4 × 4 (16 números)',
            color: 'from-orange-500/20 to-amber-600/10 border-orange-500/40',
            badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
          },
          {
            variant: '75' as const,
            title: 'BINGO 75 BOLAS',
            sub: '5 × 5 (B-I-N-G-O con Libre)',
            color: 'from-emerald-500/20 to-teal-600/10 border-emerald-500/40',
            badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          },
        ].map((item) => {
          const info = tablesInfo[item.variant];
          const isClosed = info.status === 'SALES_CLOSED';
          const isDrawing = info.status === 'DRAWING';
          const isCountdown = info.status === 'COUNTDOWN';

          return (
            <div
              key={item.variant}
              id={`bingo-lobby-card-${item.variant}`}
              className={`relative overflow-hidden rounded-2xl border-2 bg-gradient-to-b ${item.color} bg-slate-950 p-5 shadow-xl flex flex-col justify-between space-y-4`}
            >
              {/* Badge de Modalidad */}
              <div className="flex items-start justify-between">
                <div>
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${item.badgeColor}`}>
                    <span>🎱 {item.title}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-1">
                    {item.sub}
                  </div>
                </div>

                {/* Tag de Estado */}
                {isClosed ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/50 text-red-400 text-[10px] font-bold uppercase animate-pulse">
                    <Lock className="w-3 h-3" /> VENTAS CERRADAS
                  </span>
                ) : isDrawing ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 text-[10px] font-bold uppercase animate-pulse">
                    <Radio className="w-3 h-3" /> EN SORTEO
                  </span>
                ) : isCountdown ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 text-[10px] font-bold font-mono">
                    <Timer className="w-3 h-3" /> {formatSeconds(info.secondsRemaining)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold uppercase">
                    🟢 ESPERANDO (2 min)
                  </span>
                )}
              </div>

              {/* Métricas: Premio & Jugadores */}
              <div className="space-y-2 py-2 border-y border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Premio Acumulado (90%):</span>
                  <div className="text-right">
                    <div className="text-base font-black text-emerald-400 font-mono">
                      {info.winnerPoolBs.toFixed(2)} Bs
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {BcvRepository.formatUsdCompact(info.winnerPoolBs, bcvRate)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{info.currentPlayersCount} Jugadores</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300 justify-end">
                    <Ticket className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{info.cardsSoldCount} Cartones</span>
                  </div>
                </div>
              </div>

              {/* Botón de Entrada o Visualización */}
              <div>
                <Button
                  id={`btn-join-bingo-${item.variant}`}
                  variant="primary"
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs py-2.5 rounded-xl shadow-md"
                  disabled={loadingVariant === item.variant}
                  onClick={() => handleJoinVariant(item.variant)}
                  leftIcon={isDrawing ? <Radio className="w-4 h-4 text-red-600 animate-spin" /> : <Play className="w-4 h-4" />}
                >
                  {loadingVariant === item.variant
                    ? 'Conectando...'
                    : isDrawing
                    ? 'Ver Sorteo en Vivo'
                    : isClosed
                    ? '🔒 Entrar a la Sala'
                    : 'UNIRSE Y COMPRAR CARTONES'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* SECCIÓN: HISTORIAL DE GANADORES BINGO LA OLLA */}
      <div id="bingo-la-olla-history" className="mt-8 pt-6 border-t border-slate-800/60">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400 animate-pulse" />
              <h3 className="text-lg font-black text-slate-100 uppercase tracking-wide">
                🏆 HISTORIAL DE GANADORES “BINGO LA OLLA”
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Fotos, nombres y premios en tiempo real de los últimos 7 días (máx. 100)
            </p>
          </div>
        </div>

        {bingoWinnersHistory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center text-slate-400 text-xs">
            <Trophy className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            No hay ganadores registrados en los últimos 7 días.<br />
            ¡Sé el primero en reclamar Bingo y tomar tu foto de victoria!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {bingoWinnersHistory.map((w) => (
              <div
                key={w.id}
                className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden"
              >
                {/* Visualizador de la foto o avatar del ganador */}
                <div className="w-full h-44 rounded-xl bg-slate-950 overflow-hidden relative border border-slate-800">
                  {w.photoUrl ? (
                    <img
                      src={w.photoUrl}
                      alt={w.winnerName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-600">
                      <Trophy className="w-12 h-12 text-slate-800 mb-1 animate-pulse" />
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Foto pendiente</span>
                    </div>
                  )}
                  {/* Badge de Premio en la foto */}
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-emerald-500/90 text-slate-950 text-xs font-black font-mono shadow-md">
                    +{w.prizeBs.toFixed(2)} Bs
                  </div>
                </div>

                {/* Info del Ganador */}
                <div className="mt-3 flex flex-col justify-between flex-1">
                  <div>
                    <div className="text-sm font-extrabold text-slate-100 truncate uppercase">
                      {w.winnerName}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {new Date(w.createdAt).toLocaleDateString('es-VE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
