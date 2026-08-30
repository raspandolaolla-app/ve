// ==============================================================================
// RASPANDO LA OLLA — ARENA PRINCIPAL DE JUEGO (MOTOR UNIFICADO)
// ==============================================================================
// Renderiza el componente de juego interactivo según table.gameType,
// administrando jugadores, pozo y salida de mesa.
// ==============================================================================

import { useState } from 'react';
import type { GameTable, TablePlayer } from '../../types/tables';
import { TicTacToeGame } from './components/TicTacToeGame';
import { RockPaperScissorsGame } from './components/RockPaperScissorsGame';
import { CheckersGame } from './components/CheckersGame';
import { DominoGame } from './components/DominoGame';
import { TrucoGame } from './components/TrucoGame';
import { BingoGame } from './components/BingoGame';
import { PollaGame } from './components/PollaGame';
import { AtrapaitoGame } from './components/AtrapaitoGame';
import { UnaOllaGame } from './components/UnaOllaGame';
import { ArrowLeft, Users, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '../../components/common/Button';

export interface GameArenaProps {
  table: GameTable;
  players: TablePlayer[];
  currentUserId?: string;
  onLeaveTable: () => void;
}

export function GameArena({
  table,
  players,
  currentUserId,
  onLeaveTable,
}: GameArenaProps) {
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const renderGameComponent = () => {
    switch (table.gameType) {
      case 'tic_tac_toe':
        return (
          <TicTacToeGame
            table={table}
            players={players}
            currentUserId={currentUserId}
            onLeave={onLeaveTable}
          />
        );
      case 'rock_paper_scissors':
        return (
          <RockPaperScissorsGame
            table={table}
            players={players}
            currentUserId={currentUserId}
            onLeave={onLeaveTable}
          />
        );
      case 'checkers':
        return (
          <CheckersGame
            table={table}
            players={players}
            currentUserId={currentUserId}
            onLeave={onLeaveTable}
          />
        );
      case 'domino_venezolano':
        return (
          <DominoGame
            table={table}
            players={players}
            currentUserId={currentUserId}
            onLeave={onLeaveTable}
          />
        );
      case 'truco_venezolano':
        return (
          <TrucoGame
            table={table}
            players={players}
            currentUserId={currentUserId}
            onLeave={onLeaveTable}
          />
        );
      case 'bingo':
        return (
          <BingoGame
            table={table}
            players={players}
            currentUserId={currentUserId}
            onLeave={onLeaveTable}
          />
        );
      case 'polla_venezolana':
        return (
          <PollaGame
            table={table}
            players={players}
            currentUserId={currentUserId}
            onLeave={onLeaveTable}
          />
        );
      case 'atrapaito':
        return (
          <AtrapaitoGame
            table={table}
            players={players}
            currentUserId={currentUserId}
            onLeave={onLeaveTable}
          />
        );
      case 'una_olla':
        return (
          <UnaOllaGame
            table={table}
            players={players}
            currentUserId={currentUserId}
            onLeave={onLeaveTable}
          />
        );
      default:
        return (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-100">Juego en proceso de preparación</h3>
            <p className="text-xs text-slate-400">El motor para este tipo de juego está inicializándose.</p>
            <Button variant="outline" onClick={onLeaveTable}>
              Volver al Lobby
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de Control Superior */}
      <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowExitConfirm(true)}
            className="text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Salir de la Mesa
          </Button>

          <div className="hidden sm:flex items-center gap-2 border-l border-slate-800 pl-3">
            <span className="text-xs font-mono text-slate-400">{table.name || 'Mesa Privada'}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              Mesa #{table.id.slice(0, 6)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <Users className="w-4 h-4 text-slate-400" />
            <span>{players.length}/{table.maxPlayers}</span>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Pozo 90/10 Protegido</span>
          </div>
        </div>
      </div>

      {/* Modal de Confirmación de Salida */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">¿Deseas salir de la partida?</h3>
            <p className="text-xs text-slate-400">
              Si la partida ya inició, abandonar la mesa puede resultar en la pérdida de la entrada conforme a las reglas del juego.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button size="sm" variant="outline" onClick={() => setShowExitConfirm(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="danger" onClick={onLeaveTable}>
                Confirmar Salida
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Componente del Juego Activo */}
      <div className="min-h-[500px] flex items-center justify-center">
        {renderGameComponent()}
      </div>
    </div>
  );
}
