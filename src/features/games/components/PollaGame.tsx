// ==============================================================================
// RASPANDO LA OLLA — POLLA VENEZOLANA (QUINIELA CRILLA)
// ==============================================================================
// Pronósticos deportivos y clásicos criollos (Fútbol / LVBP / Hípica 5y6),
// bloqueo de apuestas, ingreso de resultados oficiales, tabla de posiciones y liquidación.
// ==============================================================================

import { useState } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { useGameEngine } from '../useGameEngine';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, CheckCircle2, Award, Calendar } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';

interface MatchEvent {
  id: number;
  homeTeam: string;
  awayTeam: string;
  category: string;
  result: 'HOME' | 'DRAW' | 'AWAY' | null;
}

const DEFAULT_EVENTS: MatchEvent[] = [
  { id: 1, homeTeam: 'Leones del Caracas', awayTeam: 'Navegantes del Magallanes', category: 'LVBP Béisbol', result: null },
  { id: 2, homeTeam: 'Caracas FC', awayTeam: 'Deportivo Táchira', category: 'FUTVE Clásico', result: null },
  { id: 3, homeTeam: 'Tiburones de La Guaira', awayTeam: 'Cardenales de Lara', category: 'LVBP Béisbol', result: null },
  { id: 4, homeTeam: 'Zamora FC', awayTeam: 'Monagas SC', category: 'FUTVE Liga', result: null },
  { id: 5, homeTeam: '5ta Válida (Ejemplar A)', awayTeam: '5ta Válida (Ejemplar B)', category: 'La Rinconada 5y6', result: null },
];

interface PollaState {
  events: MatchEvent[];
  picks: Record<string, Record<number, 'HOME' | 'DRAW' | 'AWAY'>>; // userId -> eventId -> pick
  scores: Record<string, number>; // userId -> puntos
  isLocked: boolean;
  winnerUserId: string | null;
}

export function PollaGame({
  table,
  players,
  currentUserId,
  onLeave,
}: {
  table: GameTable;
  players: TablePlayer[];
  currentUserId?: string;
  onLeave: () => void;
}) {
  const initialPollaState: PollaState = {
    events: DEFAULT_EVENTS,
    picks: {},
    scores: {},
    isLocked: false,
    winnerUserId: null,
  };

  const {
    gameState,
    isHost,
    isSettling,
    dispatchAction,
  } = useGameEngine({
    table,
    players,
    currentUserId,
    initialState: initialPollaState,
  });

  const state = (gameState as unknown as PollaState) || initialPollaState;
  const events = state.events || DEFAULT_EVENTS;
  const myPicks = (currentUserId ? state.picks?.[currentUserId] : {}) || {};

  const [selectedPicks, setSelectedPicks] = useState<Record<number, 'HOME' | 'DRAW' | 'AWAY'>>(myPicks);

  const handlePick = (eventId: number, pick: 'HOME' | 'DRAW' | 'AWAY') => {
    if (state.isLocked || state.winnerUserId || isSettling) return;
    setSelectedPicks((prev) => ({
      ...prev,
      [eventId]: pick,
    }));
  };

  // Guardar y enviar pronósticos del participante
  const handleSubmitPicks = async () => {
    if (!currentUserId || state.isLocked || isSettling) return;

    const newPicks = {
      ...state.picks,
      [currentUserId]: selectedPicks,
    };

    const nextState: PollaState = {
      ...state,
      picks: newPicks,
    };

    await dispatchAction(
      'SUBMIT_PICKS',
      { picks: selectedPicks, userId: currentUserId },
      nextState as unknown as Record<string, unknown>,
      null
    );
  };

  // Anfitrión simula o define los resultados oficiales y calcula ganadores
  const handleResolveEvents = async () => {
    if (!isHost || state.winnerUserId || isSettling) return;

    // Generar resultados oficiales para los eventos que no los tengan
    const resolvedEvents = events.map((ev) => {
      if (ev.result) return ev;
      const options: ('HOME' | 'DRAW' | 'AWAY')[] = ['HOME', 'DRAW', 'AWAY'];
      return {
        ...ev,
        result: options[Math.floor(Math.random() * options.length)],
      };
    });

    // Calcular puntuaciones para todos los jugadores registrados
    const calculatedScores: Record<string, number> = {};
    let highestScore = -1;
    let topWinnerId: string | null = null;

    players.forEach((p) => {
      const userPicks = state.picks?.[p.userId] || {};
      let pts = 0;
      resolvedEvents.forEach((ev) => {
        if (userPicks[ev.id] === ev.result) {
          pts += 1;
        }
      });
      calculatedScores[p.userId] = pts;

      if (pts > highestScore) {
        highestScore = pts;
        topWinnerId = p.userId;
      }
    });

    const nextState: PollaState = {
      ...state,
      events: resolvedEvents,
      scores: calculatedScores,
      isLocked: true,
      winnerUserId: topWinnerId,
    };

    await dispatchAction(
      'RESOLVE_POLLA',
      { scores: calculatedScores, winnerUserId: topWinnerId },
      nextState as unknown as Record<string, unknown>,
      null,
      topWinnerId,
      false
    );
  };

  const isGameOver = Boolean(state.winnerUserId);
  const isWinner = state.winnerUserId === currentUserId;
  const estimatedPrize = table.entryFee * table.maxPlayers * (FINANCIAL_RULES.WINNER_PERCENT / 100);

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-4xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100">Polla Criolla (Quiniela)</h2>
              <p className="text-xs text-slate-400">
                Pozo: <strong className="text-emerald-400 font-mono">{formatBolivares(estimatedPrize)}</strong> (90%)
              </p>
            </div>
          </div>

          {isHost && !isGameOver && (
            <Button size="sm" variant="primary" onClick={handleResolveEvents}>
              <Award className="w-4 h-4 mr-1.5" />
              Cerrar y Evaluar Polla
            </Button>
          )}
        </div>
      </div>

      {/* Cartelera de Encuentros */}
      <div className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            Encuentros de la Jornada
          </h3>

          {!state.isLocked && (
            <Button size="sm" variant="primary" onClick={handleSubmitPicks}>
              Guardar Mis Pronósticos
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {events.map((ev) => {
            const currentPick = selectedPicks[ev.id];
            return (
              <div
                key={ev.id}
                className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400">
                    {ev.category}
                  </span>
                  <div className="text-sm font-bold text-slate-100 mt-1">
                    {ev.homeTeam} <span className="text-slate-500">vs</span> {ev.awayTeam}
                  </div>
                  {ev.result && (
                    <div className="text-xs text-emerald-400 font-mono mt-0.5">
                      Resultado Oficial: <strong>{ev.result === 'HOME' ? 'Local' : ev.result === 'DRAW' ? 'Empate' : 'Visitante'}</strong>
                    </div>
                  )}
                </div>

                {/* Opciones 1 X 2 */}
                <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
                  {(['HOME', 'DRAW', 'AWAY'] as const).map((opt) => {
                    const isSelected = currentPick === opt;
                    const isCorrect = ev.result && ev.result === opt && isSelected;

                    return (
                      <button
                        key={opt}
                        id={`polla-event-${ev.id}-opt-${opt}`}
                        disabled={state.isLocked || isSettling}
                        onClick={() => handlePick(ev.id, opt)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold font-mono transition-all select-none ${
                          isCorrect
                            ? 'bg-emerald-500/30 border-2 border-emerald-400 text-emerald-300'
                            : isSelected
                            ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-300'
                            : 'bg-slate-950 border border-slate-800 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {opt === 'HOME' ? '1 (Local)' : opt === 'DRAW' ? 'X (Empate)' : '2 (Visita)'}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabla de Clasificación de la Polla */}
      {Object.keys(state.scores || {}).length > 0 && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Tabla de Puntuaciones
          </h4>
          <div className="divide-y divide-slate-800">
            {players.map((p) => {
              const pts = state.scores[p.userId] || 0;
              const isTop = state.winnerUserId === p.userId;
              return (
                <div key={p.userId} className="flex items-center justify-between py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">{p.displayName}</span>
                    {isTop && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">Líder</span>}
                  </div>
                  <div className="font-mono font-bold text-amber-400">{pts} aciertos</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Overlay de Resultado */}
      {isGameOver && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
          {isWinner ? (
            <div>
              <div className="text-3xl font-black text-emerald-400 mb-1">¡GANADOR DE LA POLLA! 🏆</div>
              <p className="text-xs text-slate-300">
                Has obtenido la mayor cantidad de aciertos y ganas:{' '}
                <strong className="text-emerald-400 font-mono text-base">{formatBolivares(estimatedPrize)}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-black text-slate-300 mb-1">POLLA FINALIZADA</div>
              <p className="text-xs text-slate-400">Otro participante acumuló más aciertos en la jornada.</p>
            </div>
          )}

          {isSettling && (
            <div className="text-xs text-amber-300 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Liquidando premio 90/10 en Supabase...</span>
            </div>
          )}

          <Button variant="primary" onClick={onLeave} className="w-full py-3">
            Volver al Lobby de Mesas
          </Button>
        </div>
      )}
    </div>
  );
}
