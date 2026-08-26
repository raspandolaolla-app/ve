// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: POLLA VENEZOLANA (QUINIELA)
// ==============================================================================

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, CheckCircle, Award } from 'lucide-react';
import type { PollaState, PollaPrediction } from '../../../types/games';

interface PollaBoardProps {
  state: PollaState;
  currentUserId: string;
  onSubmitPredictions: (predictions: PollaPrediction[]) => void;
  onResolveMatches?: () => void;
}

export const PollaBoard: React.FC<PollaBoardProps> = ({
  state,
  currentUserId,
  onSubmitPredictions,
  onResolveMatches,
}) => {
  const [picks, setPicks] = useState<Record<string, { home: number; away: number; pick: 'HOME' | 'DRAW' | 'AWAY' }>>({});

  const handleScoreChange = (fixtureId: string, type: 'home' | 'away', val: number) => {
    const current = picks[fixtureId] || { home: 0, away: 0, pick: 'DRAW' };
    const updated = { ...current, [type]: Math.max(0, val) };
    if (updated.home > updated.away) updated.pick = 'HOME';
    else if (updated.home < updated.away) updated.pick = 'AWAY';
    else updated.pick = 'DRAW';

    setPicks({ ...picks, [fixtureId]: updated });
  };

  const handleSendPicks = () => {
    const list: PollaPrediction[] = Object.entries(picks).map(
      ([fixtureId, p]: [string, { home: number; away: number; pick: 'HOME' | 'DRAW' | 'AWAY' }]) => ({
        fixtureId,
        predictedHomeScore: p.home,
        predictedAwayScore: p.away,
        pick: p.pick,
      })
    );
    onSubmitPredictions(list);
  };

  const mySavedPicks = state.predictions[currentUserId] || [];

  return (
    <div id="polla-board-container" className="flex flex-col items-center p-4 max-w-2xl mx-auto w-full">
      {/* Tabla de Posiciones */}
      <div id="polla-leaderboard" className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-bold text-neutral-200">Tabla de Líderes de la Polla</span>
          </div>
          <span className="text-xs text-neutral-400 font-mono">
            {state.status === 'open_picks' ? 'Pronósticos Abiertos' : 'Polla Finalizada'}
          </span>
        </div>

        <div className="space-y-2">
          {state.leaderboard.map((entry, idx) => (
            <div
              key={entry.userId}
              className={`flex items-center justify-between p-2.5 rounded-xl border ${
                idx === 0
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  : 'bg-neutral-800/40 border-neutral-800 text-neutral-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="w-5 text-xs font-mono font-bold">{idx + 1}.</span>
                <span className="text-sm font-semibold">
                  {state.playerNames[entry.userId] || 'Participante'}
                </span>
                {entry.userId === currentUserId && (
                  <span className="text-[10px] text-amber-400 font-mono">(Tú)</span>
                )}
              </div>
              <div className="flex items-center space-x-3 text-xs font-mono">
                <span>Exactos: {entry.correctExact}</span>
                <span className="font-bold text-base text-white">{entry.points} pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lista de Partidos */}
      <div id="polla-fixtures" className="w-full space-y-3 mb-5">
        {state.fixtures.map((fix) => {
          const userPick = mySavedPicks.find((p) => p.fixtureId === fix.id);
          const currentInput = picks[fix.id] || { home: 0, away: 0 };

          return (
            <div
              key={fix.id}
              className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4"
            >
              <div className="flex-1 text-center sm:text-left">
                <span className="text-[10px] text-amber-400 uppercase font-mono tracking-wider block">
                  {fix.category} • {fix.date}
                </span>
                <div className="text-sm font-bold text-neutral-200 mt-1">
                  {fix.homeTeam} vs {fix.awayTeam}
                </div>
              </div>

              {/* Entradas de Marcador */}
              {state.status === 'open_picks' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={currentInput.home}
                    onChange={(e) => handleScoreChange(fix.id, 'home', parseInt(e.target.value) || 0)}
                    className="w-12 h-10 bg-neutral-800 border border-neutral-700 rounded-lg text-center font-bold text-white text-base"
                  />
                  <span className="text-neutral-500 font-bold">-</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={currentInput.away}
                    onChange={(e) => handleScoreChange(fix.id, 'away', parseInt(e.target.value) || 0)}
                    className="w-12 h-10 bg-neutral-800 border border-neutral-700 rounded-lg text-center font-bold text-white text-base"
                  />
                </div>
              )}

              {/* Si ya terminó o tiene resultado oficial */}
              {fix.result && (
                <div className="text-center bg-neutral-800/80 px-3 py-1.5 rounded-xl border border-neutral-700">
                  <span className="text-[10px] text-neutral-400 block font-mono">OFICIAL</span>
                  <span className="text-sm font-black text-amber-400 font-mono">
                    {fix.result.homeScore} - {fix.result.awayScore}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Botones de Acción */}
      <div className="w-full flex gap-3">
        {state.status === 'open_picks' && (
          <button
            onClick={handleSendPicks}
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-sm shadow-lg transition-all"
          >
            Guardar Mis Pronósticos
          </button>
        )}

        {onResolveMatches && (
          <button
            onClick={onResolveMatches}
            className="px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-sm border border-neutral-700 transition-all"
          >
            Liquidar Resultados
          </button>
        )}
      </div>
    </div>
  );
};
