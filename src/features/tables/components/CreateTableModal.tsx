/**
 * Modal de Creación de Mesa Oficial / Privada / Práctica
 * Extraído de TablesView.tsx para modularidad y mantenibilidad
 */
import React from 'react';
import {
  Bot,
  PlusCircle,
  X,
  Coins,
  Users,
  Sparkles,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { SUPPORTED_GAMES_METADATA } from '../../../utils/constants';
import { useGameAvailability } from '../../../context/GameAvailabilityContext';
import { FinancialRepository } from '../../../services/repositories/FinancialRepository';
import { formatBolivares } from '../../../utils/formatters';
import type { GameType, GameMode } from '../../../types/games';
import { CreateBingoTableForm, type CreateBingoTableParams } from './CreateBingoTableForm';

export interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  createIsPractice: boolean;
  setCreateIsPractice: (val: boolean) => void;
  createGameType: GameType;
  setCreateGameType: (val: GameType) => void;
  createMode: GameMode;
  setCreateMode: (val: GameMode) => void;
  createName: string;
  setCreateName: (val: string) => void;
  createEntryFee: number;
  setCreateEntryFee: (val: number) => void;
  createMaxPlayers: number;
  setCreateMaxPlayers: (val: number) => void;
  createIsPrivate: boolean;
  setCreateIsPrivate: (val: boolean) => void;
  creating: boolean;
  createError: string | null;
  setCreateError: (err: string | null) => void;
  availableFees: number[];
  userBalance: number;
  formatUsd: (amount: number) => string;
  onSubmit: (e: React.FormEvent) => void;
  onCreateBingoTable: (params: CreateBingoTableParams) => Promise<void>;
  onForceLeaveAndRetry: () => Promise<void>;
}

export const CreateTableModal: React.FC<CreateTableModalProps> = ({
  isOpen,
  onClose,
  createIsPractice,
  setCreateIsPractice,
  createGameType,
  setCreateGameType,
  createMode,
  setCreateMode,
  createName,
  setCreateName,
  createEntryFee,
  setCreateEntryFee,
  createMaxPlayers,
  setCreateMaxPlayers,
  createIsPrivate,
  setCreateIsPrivate,
  creating,
  createError,
  setCreateError: _setCreateError,
  availableFees,
  userBalance,
  formatUsd,
  onSubmit,
  onCreateBingoTable,
  onForceLeaveAndRetry,
}: CreateTableModalProps) => {
  const { isGameEnabled } = useGameAvailability();

  const availableGames = React.useMemo(() => {
    return SUPPORTED_GAMES_METADATA.filter((game) => isGameEnabled(game.id));
  }, [isGameEnabled]);

  // Si el juego actual fue deshabilitado, seleccionar el primero disponible
  React.useEffect(() => {
    if (availableGames.length > 0 && !isGameEnabled(createGameType)) {
      const firstAvailable = availableGames[0];
      setCreateGameType(firstAvailable.id);
      if (!createIsPractice) {
        setCreateEntryFee(firstAvailable.minEntryFee);
      }
      setCreateMaxPlayers(firstAvailable.maxPlayers);
      setCreateMode(firstAvailable.allowedModes[0]);
    }
  }, [availableGames, createGameType, isGameEnabled, createIsPractice, setCreateGameType, setCreateEntryFee, setCreateMaxPlayers, setCreateMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-slate-700 rounded-3xl max-w-2xl w-full max-h-[95vh] overflow-y-auto p-5 sm:p-8 space-y-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between sticky top-0 bg-gradient-to-b from-slate-900 to-slate-900/95 pt-2 pb-4 border-b-2 border-slate-700 z-10">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-100 flex items-center gap-3">
            {createIsPractice ? (
              <Bot className="w-8 h-8 text-cyan-400 shrink-0" />
            ) : (
              <PlusCircle className="w-8 h-8 text-amber-400 shrink-0" />
            )}
            <span className="uppercase tracking-wide">
              {createIsPractice
                ? 'Modo Práctica'
                : createIsPrivate
                ? 'Mesa Privada'
                : 'Crear Mesa Oficial'}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors touch-manipulation"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Pestañas de Tipo de Partida */}
        <div className="grid grid-cols-2 gap-2 p-2 bg-slate-950 rounded-2xl border-2 border-slate-700">
          <button
            type="button"
            onClick={() => {
              setCreateIsPractice(false);
              setCreateEntryFee(50);
            }}
            className={`py-4 px-4 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 ${
              !createIsPractice
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/30 scale-105'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Coins className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="font-black">💰 Saldo Real</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateIsPractice(true);
              setCreateEntryFee(0);
            }}
            className={`py-4 px-4 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 ${
              createIsPractice
                ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-slate-950 shadow-lg shadow-cyan-500/30 scale-105'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="font-black">🎮 Práctica</span>
          </button>
        </div>

        {/* Selección de Juego */}
        <div>
          <label className="block font-black text-slate-100 text-lg mb-3 flex items-center gap-2">
            <span className="text-2xl">🎮</span>
            Seleccionar Juego
          </label>
          <select
            id="select-create-game-type"
            value={createGameType}
            onChange={(e) => {
              const g = e.target.value as GameType;
              setCreateGameType(g);
              const meta = SUPPORTED_GAMES_METADATA.find((m) => m.id === g);
              if (meta) {
                if (!createIsPractice) {
                  setCreateEntryFee(meta.minEntryFee);
                }
                setCreateMaxPlayers(meta.maxPlayers);
                setCreateMode(meta.allowedModes[0]);
              }
            }}
            className="w-full px-5 py-4 bg-slate-950 border-2 border-slate-700 rounded-2xl text-slate-100 text-base font-semibold focus:outline-none focus:border-amber-500 transition-colors"
          >
            {availableGames.map((game) => (
              <option key={game.id} value={game.id} className="py-2">
                {game.name} ({game.minPlayers === game.maxPlayers ? `${game.minPlayers} jug.` : `${game.minPlayers}-${game.maxPlayers} jug.`})
              </option>
            ))}
          </select>
        </div>

        {createGameType === 'bingo' && !createIsPractice ? (
          <div className="pt-2">
            {createError && (
              <div className="mb-4 p-4 bg-gradient-to-br from-red-950/40 to-red-900/30 border-2 border-red-500/50 rounded-2xl text-sm text-red-300 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span className="font-semibold">{createError}</span>
              </div>
            )}
            <CreateBingoTableForm
              onCreateTable={onCreateBingoTable}
              userBalance={userBalance}
              isSubmitting={creating}
              onCancel={onClose}
            />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6">
            {/* Selector de Jugadores */}
            <div>
              <label className="block font-black text-slate-100 text-lg mb-3 flex items-center gap-2">
                <span className="text-2xl">👥</span>
                Jugadores y Modalidad
              </label>
              {(() => {
                const meta = SUPPORTED_GAMES_METADATA.find((m) => m.id === createGameType);
                if (!meta) return null;

                if (createGameType === 'domino_venezolano' || createGameType === 'truco_venezolano') {
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCreateMaxPlayers(2);
                          setCreateMode('1v1');
                        }}
                        className={`py-5 px-4 rounded-2xl border-2 text-sm sm:text-base font-bold transition-all flex flex-col items-center justify-center gap-2 ${
                          createMaxPlayers === 2
                            ? 'bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-300 border-amber-500 shadow-lg shadow-amber-500/20 scale-105'
                            : 'bg-slate-950 text-slate-400 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <Users className="w-6 h-6" />
                        <span>2 Jugadores</span>
                        <span className="text-xs opacity-75">(1v1)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateMaxPlayers(4);
                          setCreateMode('2v2');
                        }}
                        className={`py-5 px-4 rounded-2xl border-2 text-sm sm:text-base font-bold transition-all flex flex-col items-center justify-center gap-2 ${
                          createMaxPlayers === 4
                            ? 'bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-300 border-amber-500 shadow-lg shadow-amber-500/20 scale-105'
                            : 'bg-slate-950 text-slate-400 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <Users className="w-6 h-6" />
                        <span>4 Jugadores</span>
                        <span className="text-xs opacity-75">(Parejas 2v2)</span>
                      </button>
                    </div>
                  );
                }

                if (createGameType === 'atrapaito') {
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { count: 2, mode: '1v1' as GameMode, label: '2 Jug.' },
                        { count: 3, mode: '1v3' as GameMode, label: '3 Jug.' },
                        { count: 4, mode: '2v2' as GameMode, label: '4 Jug.' },
                        { count: 6, mode: '2v2' as GameMode, label: '6 Jug.' },
                      ].map((opt) => (
                        <button
                          key={opt.count}
                          type="button"
                          onClick={() => {
                            setCreateMaxPlayers(opt.count);
                            setCreateMode(opt.mode);
                          }}
                          className={`py-4 px-3 rounded-2xl border-2 text-sm font-bold transition-all text-center ${
                            createMaxPlayers === opt.count
                              ? 'bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-300 border-amber-500 shadow-lg shadow-amber-500/20 scale-105'
                              : 'bg-slate-950 text-slate-400 border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  );
                }

                if (createGameType === 'una_olla') {
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { count: 2, mode: '1v1' as GameMode, label: '2 Jugadores' },
                        { count: 3, mode: '1v3' as GameMode, label: '3 Jugadores' },
                        { count: 4, mode: '1v4' as GameMode, label: '4 Jugadores' },
                      ].map((opt) => (
                        <button
                          key={opt.count}
                          type="button"
                          onClick={() => {
                            setCreateMaxPlayers(opt.count);
                            setCreateMode(opt.mode);
                          }}
                          className={`py-4 px-3 rounded-2xl border-2 text-sm font-bold transition-all text-center ${
                            createMaxPlayers === opt.count
                              ? 'bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-300 border-amber-500 shadow-lg shadow-amber-500/20 scale-105'
                              : 'bg-slate-950 text-slate-400 border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  );
                }

                if (createGameType === 'bingo') {
                  return (
                    <div className="p-5 bg-gradient-to-br from-slate-950 to-slate-900 rounded-2xl border-2 border-amber-500/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 font-bold text-base">Capacidad (Sin Límite)</span>
                        <span className="text-amber-400 font-mono text-sm">Masivo</span>
                      </div>
                      <input
                        type="number"
                        value={createMaxPlayers}
                        min={2}
                        max={100}
                        onChange={(e) => setCreateMaxPlayers(Number(e.target.value))}
                        className="w-full px-5 py-4 bg-slate-950 border-2 border-slate-700 rounded-xl text-slate-100 font-mono text-xl font-bold text-center focus:outline-none focus:border-amber-500 transition-colors"
                      />
                      <p className="text-xs text-slate-400 text-center">
                        Mínimo 2 jugadores • Máximo 100 jugadores
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="p-5 bg-gradient-to-br from-slate-950 to-slate-900 rounded-2xl border-2 border-slate-700 flex items-center justify-between">
                    <span className="text-slate-300 font-semibold text-base">Duelo Mano a Mano</span>
                    <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-4 py-2 rounded-xl border-2 border-amber-500/30 text-sm">
                      2 Jugadores (1v1)
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Nombre Opcional */}
            <div>
              <label className="block font-black text-slate-100 text-lg mb-3 flex items-center gap-2">
                <span className="text-2xl">📝</span>
                Nombre de la Mesa (Opcional)
              </label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={createIsPractice ? 'Mesa de Entrenamiento con Bots' : 'Ej: Mesa de los panas'}
                maxLength={40}
                className="w-full px-5 py-4 bg-slate-950 border-2 border-slate-700 rounded-2xl text-slate-100 text-base placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Configuración de Saldo vs Modo Práctica */}
            {createIsPractice ? (
              <div className="p-6 bg-gradient-to-br from-cyan-950/40 to-cyan-900/30 border-2 border-cyan-500/40 rounded-2xl space-y-3">
                <div className="flex items-center gap-3 font-black text-cyan-300 text-lg">
                  <Sparkles className="w-6 h-6 text-cyan-400" />
                  <span>Entrenamiento con Bots</span>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">
                  En Modo Práctica <strong className="text-cyan-300">no se descuenta saldo</strong> de tu cuenta.
                  Los asientos vacíos se llenan con oponentes de Inteligencia Artificial para que puedas practicar tus jugadas de inmediato.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block font-black text-slate-100 text-lg mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="text-2xl">💰</span>
                      Monto de Participación
                    </span>
                    <span className="text-xs text-amber-400 font-mono font-bold bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/30">
                      90% Ganador / 10% Plataforma
                    </span>
                  </label>
                  <div className="flex items-center justify-between text-sm text-slate-400 mb-3">
                    <span>
                      Mínimo: <strong className="text-slate-200 font-mono">25 Bs.</strong> | Máximo: <strong className="text-slate-200 font-mono">5.000 Bs.</strong>
                    </span>
                    <span className="text-slate-400 font-mono text-sm">{formatUsd(createEntryFee)}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {availableFees.map((fee) => (
                      <button
                        key={fee}
                        type="button"
                        onClick={() => setCreateEntryFee(fee)}
                        className={`px-5 py-3 rounded-xl text-sm font-mono font-bold border-2 transition-all ${
                          createEntryFee === fee
                            ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/30 scale-105'
                            : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        {fee} Bs.
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-2 font-semibold">Monto Personalizado (Bs.)</label>
                      <input
                        type="number"
                        value={createEntryFee}
                        min={25}
                        max={5000}
                        onChange={(e) => setCreateEntryFee(Number(e.target.value))}
                        className={`w-full px-5 py-4 bg-slate-950 border-2 rounded-xl text-slate-100 font-mono text-lg font-bold focus:outline-none transition-colors ${
                          createEntryFee < 25 || createEntryFee > 5000
                            ? 'border-red-500 text-red-300'
                            : 'border-slate-700 focus:border-amber-500'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-2 font-semibold">Premio Estimado</label>
                      <div className="w-full px-5 py-4 bg-gradient-to-br from-emerald-950/30 to-emerald-900/20 border-2 border-emerald-500/30 rounded-xl text-emerald-400 font-mono font-bold text-lg">
                        {formatBolivares(FinancialRepository.calculatePoolBreakdown(createEntryFee * createMaxPlayers).prizePool)}
                      </div>
                    </div>
                  </div>
                  {(createEntryFee < 25 || createEntryFee > 5000) && (
                    <p className="mt-2 text-sm text-red-400 font-medium flex items-center gap-2">
                      <span>⚠️</span>
                      El monto debe estar entre 25 Bs. y 5.000 Bs.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Privacidad */}
            {!createIsPractice && (
              <div className="p-5 bg-gradient-to-br from-slate-950 to-slate-900 rounded-2xl border-2 border-slate-700 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-bold text-slate-200 text-base flex items-center gap-2">
                    <Lock className="w-5 h-5 text-amber-400" />
                    Mesa Privada ("Trancaíto")
                  </div>
                  <div className="text-sm text-slate-400">Sólo jugadores con el código podrán acceder</div>
                </div>
                <input
                  type="checkbox"
                  checked={createIsPrivate}
                  onChange={(e) => setCreateIsPrivate(e.target.checked)}
                  className="w-6 h-6 accent-amber-500 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {/* Error */}
            {createError && (
              <div className="p-4 bg-gradient-to-br from-red-950/40 to-red-900/30 border-2 border-red-500/50 rounded-2xl text-sm text-red-300 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                  <span className="font-semibold">{createError}</span>
                </div>
                {(createError.includes('participando') || createError.includes('mesa activa')) && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={creating}
                      onClick={onForceLeaveAndRetry}
                      className="w-full text-xs font-bold py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl"
                    >
                      ⚡ Liberar mesas previas huérfanas y reintentar
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Botones de Acción */}
            <div className="pt-4 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                className="px-6 py-3 text-base font-bold"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={creating || (!createIsPractice && (createEntryFee < 25 || createEntryFee > 5000))}
                className={`${createIsPractice ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500' : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500'} text-slate-950 px-8 py-3 text-base font-black shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {creating
                  ? '⏳ Creando Mesa...'
                  : createIsPractice
                  ? '🎮 Iniciar Práctica Ahora'
                  : '🚀 Publicar Mesa Oficial'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
