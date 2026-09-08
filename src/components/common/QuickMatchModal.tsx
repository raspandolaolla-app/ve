// ==============================================================================
// RASPANDO LA OLLA — MODAL MAESTRO "JUEGA YA" / EMPAREJAMIENTO RÁPIDO
// ==============================================================================
// - Filtro centralizado: solo muestra juegos 100% habilitados en game_configurations
// - Emparejamiento server-authoritative real (TableRepository.findOrCreateMatchmakingTable)
// - Sin temporizadores falsos ni bots simulados en partidas con dinero real
// - Cronómetro de búsqueda en vivo con botón de cancelación
// - Adaptable a Mobile (PWA/Touch) y Desktop
// ==============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Zap,
  Users,
  Banknote,
  ArrowLeft,
  Loader2,
  Trophy,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Clock,
  RotateCcw,
  CheckCircle2,
  Bot,
} from 'lucide-react';
import { useGameAvailability } from '../../context/GameAvailabilityContext';
import { useAuth } from '../../features/auth/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useAudio } from '../../hooks/useAudio';
import { TableRepository } from '../../services/repositories/TableRepository';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
import type { GameType, GameMode } from '../../types/games';

interface QuickMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTable?: (tableId: string) => void;
  initialGameType?: string;
}

type Step = 'SELECT_GAME' | 'SELECT_AMOUNT';

const FEE_OPTIONS = [
  { value: 0, label: '0 Bs (Práctica)', isFree: true },
  { value: 25, label: '25 Bs' },
  { value: 50, label: '50 Bs' },
  { value: 100, label: '100 Bs' },
  { value: 250, label: '250 Bs' },
  { value: 500, label: '500 Bs' },
  { value: 1000, label: '1.000 Bs' },
];

export const QuickMatchModal: React.FC<QuickMatchModalProps> = ({
  isOpen,
  onClose,
  onNavigateToTable,
  initialGameType,
}) => {
  const { user, profile, state } = useAuth();
  const isAuthenticated = state === 'authenticated' && user !== null;
  const { balance } = useWallet();
  const availableBalance = balance?.availableBalance ?? 0;
  const { playSound } = useAudio();
  const {
    isGameEnabled,
    getAvailableMatchmakingGames,
    getGameDisabledReason,
    loading: loadingAvailability,
  } = useGameAvailability();

  // Juegos habilitados exclusivamente para emparejamiento
  const availableMatchmakingGames = useMemo(() => {
    return getAvailableMatchmakingGames();
  }, [getAvailableMatchmakingGames]);

  // Estados del flujo
  const [currentStep, setCurrentStep] = useState<Step>('SELECT_GAME');
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [selectedFee, setSelectedFee] = useState<number>(50);
  const [error, setError] = useState<string | null>(null);

  // Estados de búsqueda / emparejamiento activo
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchStatus, setSearchStatus] = useState<string>('Buscando mesa pública abierta...');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const searchTimerRef = useRef<any>(null);
  const isCancelledRef = useRef<boolean>(false);

  // Inicializar o sincronizar juego seleccionado al abrir o cambiar disponibilidad
  useEffect(() => {
    if (!isOpen) {
      setIsSearching(false);
      setElapsedSeconds(0);
      setError(null);
      if (searchTimerRef.current) clearInterval(searchTimerRef.current);
      return;
    }

    // Si viene un juego inicial y está habilitado, seleccionarlo
    if (initialGameType && isGameEnabled(initialGameType)) {
      setSelectedGameId(initialGameType);
      setCurrentStep('SELECT_AMOUNT');
    } else if (availableMatchmakingGames.length > 0) {
      // Verificar si el actual sigue disponible
      const currentStillValid = availableMatchmakingGames.some((g) => g.id === selectedGameId);
      if (!currentStillValid) {
        setSelectedGameId(availableMatchmakingGames[0].id);
      }
    } else {
      setSelectedGameId('');
    }
  }, [isOpen, initialGameType, availableMatchmakingGames, isGameEnabled, selectedGameId]);

  // Protección en tiempo real: Si el juego seleccionado se deshabilita mientras el modal está abierto
  useEffect(() => {
    if (isOpen && selectedGameId && !isGameEnabled(selectedGameId)) {
      const reason = getGameDisabledReason(selectedGameId);
      setError(`El juego seleccionado fue puesto en mantenimiento${reason ? `: "${reason}"` : '.'}`);
      if (isSearching) {
        handleCancelSearch();
      }
      // Reubicar a un juego disponible o volver al paso 1
      const fallback = availableMatchmakingGames[0];
      if (fallback) {
        setSelectedGameId(fallback.id);
      } else {
        setSelectedGameId('');
        setCurrentStep('SELECT_GAME');
      }
    }
  }, [availableMatchmakingGames, isGameEnabled, selectedGameId, isOpen, isSearching, getGameDisabledReason]);

  // Manejo del temporizador de búsqueda
  useEffect(() => {
    if (isSearching) {
      setElapsedSeconds(0);
      searchTimerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (searchTimerRef.current) clearInterval(searchTimerRef.current);
    }
    return () => {
      if (searchTimerRef.current) clearInterval(searchTimerRef.current);
    };
  }, [isSearching]);

  // Metadata del juego seleccionado
  const selectedGameMeta = useMemo(() => {
    return availableMatchmakingGames.find((g) => g.id === selectedGameId);
  }, [availableMatchmakingGames, selectedGameId]);

  // Saldo insuficiente
  const hasInsufficientBalance = isAuthenticated && selectedFee > 0 && availableBalance < selectedFee;

  // Iniciar Emparejamiento Real (Server-Authoritative)
  const handleStartMatchmaking = async () => {
    console.info('[MATCHMAKING_START]', {
      gameId: selectedGameMeta?.id,
      gameName: selectedGameMeta?.name,
      fee: selectedFee,
      isAuthenticated,
      availableBalance,
      timestamp: new Date().toISOString(),
    });

    if (!selectedGameMeta) {
      setError('Por favor selecciona un juego válido.');
      return;
    }

    // Si requiere saldo y no está autenticado
    if (!isAuthenticated && selectedFee > 0) {
      setError('Debes iniciar sesión para jugar por saldo real. Puedes jugar en Modo Práctica (0 Bs).');
      return;
    }

    // Saldo insuficiente
    if (hasInsufficientBalance) {
      setError(`Saldo insuficiente (${availableBalance.toFixed(2)} Bs). Recarga en tu billetera o juega en Modo Práctica.`);
      return;
    }

    setError(null);
    setIsSearching(true);
    isCancelledRef.current = false;
    setSearchStatus('Buscando mesa pública abierta...');

    try {
      const userDisplayName = profile
        ? `${profile.firstName} ${profile.lastName}`.trim()
        : (user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Jugador');
      const userAvatarUrl = profile?.avatarUrl || user?.user_metadata?.avatar_url;

      const gameType = selectedGameMeta.id as GameType;
      const mode = (selectedGameMeta.allowedModes[0] || '1v1') as GameMode;

      // Llamada atómica al backend/repositorio
      const res = await TableRepository.findOrCreateMatchmakingTable({
        gameType,
        entryFee: selectedFee,
        maxPlayers: selectedGameMeta.maxPlayers,
        mode,
        currentUserId: user?.id || `anon_${Date.now()}`,
        userDisplayName,
        userAvatarUrl,
      });

      console.info('[MATCHMAKING_COMPLETE]', {
        action: res.action,
        tableId: res.table?.id,
        tableName: res.table?.name,
        message: res.message,
      });

      if (isCancelledRef.current) {
        return;
      }

      if (res.action === 'practice') {
        try { playSound('match'); } catch {}
        setSearchStatus('¡Mesa de práctica lista!');
        setTimeout(() => {
          setIsSearching(false);
          onClose();
          if (res.table?.id && onNavigateToTable) {
            console.info('[MATCHMAKING_NAVIGATING_TABLE]', { tableId: res.table.id, action: 'practice' });
            onNavigateToTable(res.table.id);
          }
        }, 400);
      } else if (res.action === 'joined') {
        try { playSound('match'); } catch {}
        setSearchStatus('¡Rival encontrado! Ingresando a la mesa...');
        setTimeout(() => {
          setIsSearching(false);
          onClose();
          if (res.table?.id) {
            console.info('[MATCHMAKING_NAVIGATING_TABLE]', { tableId: res.table.id, action: 'joined' });
            sessionStorage.setItem('pending_open_table_id', res.table.id);
            if (onNavigateToTable) onNavigateToTable(res.table.id);
            window.dispatchEvent(new CustomEvent('open-table', { detail: { tableId: res.table.id } }));
          }
        }, 500);
      } else if (res.action === 'created') {
        try { playSound('deal'); } catch {}
        setSearchStatus('Mesa creada. Esperando rival en la sala...');
        setTimeout(() => {
          setIsSearching(false);
          onClose();
          if (res.table?.id) {
            console.info('[MATCHMAKING_NAVIGATING_TABLE]', { tableId: res.table.id, action: 'created' });
            sessionStorage.setItem('pending_open_table_id', res.table.id);
            if (onNavigateToTable) onNavigateToTable(res.table.id);
            window.dispatchEvent(new CustomEvent('open-table', { detail: { tableId: res.table.id } }));
          }
        }, 500);
      }
    } catch (err: any) {
      if (isCancelledRef.current) return;
      console.error('[MATCHMAKING_ERROR]', err);
      console.error('[QuickMatchModal] Error en emparejamiento:', err);
      setIsSearching(false);
      setError(sanitizeUserErrorMessage(err, 'No fue posible completar el emparejamiento. Intenta de nuevo.'));
    }
  };

  // Cancelar Búsqueda
  const handleCancelSearch = () => {
    isCancelledRef.current = true;
    setIsSearching(false);
    setSearchStatus('Búsqueda cancelada');
    if (searchTimerRef.current) clearInterval(searchTimerRef.current);
  };

  if (!isOpen) return null;

  // Formato MM:SS
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      id="quick-match-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#080B12]/90 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-match-title"
    >
      <div className="relative w-full max-w-xl bg-gradient-to-b from-[#131926] via-[#0E1420] to-[#0A0E18] border-2 border-[#FF8A00]/40 rounded-3xl shadow-2xl shadow-[#FF8A00]/20 overflow-hidden flex flex-col max-h-[92vh]">
        {/* CABECERA */}
        <div className="bg-gradient-to-r from-[#FF8A00]/20 via-[#F5B942]/15 to-[#FF8A00]/20 border-b border-[#FF8A00]/30 px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {currentStep !== 'SELECT_GAME' && !isSearching && (
              <button
                type="button"
                onClick={() => {
                  setCurrentStep('SELECT_GAME');
                  setError(null);
                }}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                title="Volver a selección de juego"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#FF8A00] to-[#F5B942] flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/30 shrink-0">
              <Zap className="w-6 h-6 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="quick-match-title" className="text-lg sm:text-xl font-black text-white tracking-wide uppercase">
                  JUEGA YA
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-wider border border-emerald-500/40 uppercase">
                  En Vivo
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {isSearching
                  ? 'Buscando rival compatible...'
                  : currentStep === 'SELECT_GAME'
                  ? 'Paso 1 · Selecciona el juego'
                  : `Paso 2 · Elige la entrada para ${selectedGameMeta?.name || 'tu partida'}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isSearching) handleCancelSearch();
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENIDO SCROLLABLE */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Alerta de Error */}
          {error && (
            <div className="p-3.5 bg-red-950/40 border border-red-800/60 rounded-2xl text-xs text-red-300 flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ESTADO 1: RADAR DE BÚSQUEDA ACTIVO */}
          {isSearching ? (
            <div className="py-8 px-4 flex flex-col items-center justify-center text-center space-y-6">
              {/* Radar Pulsante */}
              <div className="relative flex items-center justify-center">
                <div className="w-28 h-28 rounded-full bg-amber-500/10 border-2 border-amber-500/30 animate-ping absolute" />
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border-2 border-amber-400 flex items-center justify-center shadow-xl shadow-amber-500/20">
                  <span className="text-4xl select-none animate-bounce">{selectedGameMeta?.icon || '⚡'}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-2xl font-black font-mono text-amber-400 tracking-wider">
                  <Clock className="w-5 h-5 animate-spin" />
                  <span>{formatTimer(elapsedSeconds)}</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white">{searchStatus}</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {selectedFee === 0
                    ? `Modo Práctica (${selectedGameMeta?.name}) · Sin costo`
                    : `Partida de ${selectedFee} Bs · ${selectedGameMeta?.name} (Mesa pública)`}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCancelSearch}
                className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold transition flex items-center gap-2 border border-slate-700 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cancelar Búsqueda</span>
              </button>
            </div>
          ) : (
            <>
              {/* ESTADO 2: PASO 1 - SELECCIÓN DE JUEGO */}
              {currentStep === 'SELECT_GAME' && (
                <div className="space-y-4">
                  {loadingAvailability ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                      <Loader2 className="w-8 h-8 text-amber-400 animate-spin mb-2" />
                      <p className="text-xs text-slate-400">Verificando juegos activos...</p>
                    </div>
                  ) : availableMatchmakingGames.length === 0 ? (
                    <div className="py-10 text-center space-y-3 bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                      <div className="text-4xl">🛠️</div>
                      <h3 className="text-base font-bold text-slate-200">Mantenimiento de Juegos</h3>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        Los juegos de mesa multijugador se encuentran en mantenimiento temporal por la administración. Por favor vuelve a consultar en breve.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                      {availableMatchmakingGames.map((game) => {
                        const isSelected = selectedGameId === game.id;
                        return (
                          <button
                            key={game.id}
                            type="button"
                            onClick={() => {
                              setSelectedGameId(game.id);
                              setCurrentStep('SELECT_AMOUNT');
                              setError(null);
                            }}
                            className={`group relative rounded-2xl p-3.5 sm:p-4 text-left transition-all active:scale-95 border-2 flex flex-col justify-between min-h-[110px] cursor-pointer ${
                              isSelected
                                ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-400 shadow-lg shadow-amber-500/20'
                                : 'bg-[#131926] hover:bg-[#1A2234] border-slate-800 hover:border-amber-500/50'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full mb-2">
                              <span className="text-3xl sm:text-4xl group-hover:scale-110 transition-transform">
                                {game.icon || '🎮'}
                              </span>
                              {isSelected && (
                                <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
                              )}
                            </div>
                            <div>
                              <h4 className="text-xs sm:text-sm font-black text-white leading-snug group-hover:text-amber-300 transition-colors line-clamp-1">
                                {game.name}
                              </h4>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {game.maxPlayers === 2 ? '1 vs 1' : `${game.maxPlayers} Jugadores`}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ESTADO 3: PASO 2 - SELECCIÓN DE ENTRADA */}
              {currentStep === 'SELECT_AMOUNT' && selectedGameMeta && (
                <div className="space-y-5">
                  {/* Tarjeta del juego seleccionado */}
                  <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{selectedGameMeta.icon || '🎮'}</span>
                      <div>
                        <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                          Juego Elegido
                        </span>
                        <h3 className="text-base font-black text-white">{selectedGameMeta.name}</h3>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentStep('SELECT_GAME')}
                      className="text-xs text-amber-400 hover:text-amber-300 font-bold underline"
                    >
                      Cambiar
                    </button>
                  </div>

                  {/* Saldo de Usuario */}
                  {isAuthenticated && (
                    <div className="flex items-center justify-between bg-slate-900/70 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs">
                      <span className="text-slate-400">Tu saldo disponible:</span>
                      <span className="font-mono font-bold text-amber-400">
                        {availableBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                      </span>
                    </div>
                  )}

                  {/* Opciones de Entrada */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
                      Selecciona la entrada por jugador:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {FEE_OPTIONS.map((opt) => {
                        const isSelected = selectedFee === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedFee(opt.value);
                              setError(null);
                            }}
                            className={`py-3 px-2 rounded-xl text-center border-2 font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 border-amber-300 shadow-md shadow-amber-500/30 font-black'
                                : opt.isFree
                                ? 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            {opt.isFree ? (
                              <div className="flex items-center justify-center gap-1">
                                <Bot className="w-3.5 h-3.5" />
                                <span>Práctica</span>
                              </div>
                            ) : (
                              <span>{opt.label}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Transparencia del Pozo */}
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-[11px] text-slate-400 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Premio al Ganador: <strong className="text-slate-200">90% del pozo</strong></span>
                    </div>
                    <span className="text-[10px] text-slate-500">Plataforma 10%</span>
                  </div>

                  {/* Botón Principal JUEGA YA */}
                  <button
                    id="quick-match-submit-btn"
                    type="button"
                    onClick={handleStartMatchmaking}
                    disabled={hasInsufficientBalance}
                    className={`w-full py-4 rounded-2xl font-black text-base sm:text-lg uppercase tracking-wider transition-all flex items-center justify-center gap-3 shadow-xl ${
                      hasInsufficientBalance
                        ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        : 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-amber-500/30 hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                    }`}
                  >
                    <Zap className="w-6 h-6 fill-current" />
                    <span>
                      {selectedFee === 0
                        ? 'Jugar Modo Práctica'
                        : `Emparejar · ${selectedFee} Bs`}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* PIE DE PÁGINA */}
        <div className="bg-[#0A0E18] border-t border-slate-800/80 px-5 py-3 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Multiplayer Server-Authoritative · 100% Auditado</span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isSearching) handleCancelSearch();
              onClose();
            }}
            className="text-slate-400 hover:text-white transition font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
