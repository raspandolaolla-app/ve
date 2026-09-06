// ==============================================================================
// RASPANDO LA OLLA — TAB 8: ESTADO Y CONTROL DE LOS 8 JUEGOS TRADICIONALES
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { formatBolivares } from '../../../utils/formatters';
import type { AdminGameItem } from '../../../types/admin';
import {
  Gamepad2,
  CheckCircle2,
  PauseCircle,
  TrendingUp,
  Users,
  Table,
  ShieldAlert,
} from 'lucide-react';

interface AdminGamesTabProps {
  games: AdminGameItem[];
  onRefresh: () => void;
}

export function AdminGamesTab({ games, onRefresh }: AdminGamesTabProps) {
  return (
    <div className="space-y-6" id="tab-admin-games">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-100 text-base">Motores de Juego Tradicionales (8)</h3>
          <p className="text-xs text-slate-400">
            Supervisión operativa, límites de apuesta y parámetros de salas multijugador.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {games.map((game) => (
          <Card
            key={game.id}
            id={`card-admin-game-${game.id}`}
            className="bg-slate-900/90 border-slate-800 flex flex-col justify-between"
            header={
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-100">{game.name}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" />
                  ACTIVO
                </span>
              </div>
            }
          >
            <div className="space-y-3 text-xs">
              <p className="text-slate-400 text-[11px] line-clamp-2">{game.shortDescription}</p>

              <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-850">
                <div>
                  <span className="text-slate-500 block text-[10px]">Jugadores</span>
                  <span className="font-semibold text-slate-200">
                    {game.minPlayers} a {game.maxPlayers}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Entradas</span>
                  <span className="font-mono font-semibold text-amber-300">
                    {formatBolivares(game.minEntryFee)} - {formatBolivares(game.maxEntryFee)}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 border-t border-slate-850">
                <span className="flex items-center gap-1">
                  <Table className="w-3.5 h-3.5 text-indigo-400" />
                  {game.activeTables} mesas
                </span>
                <span className="flex items-center gap-1 font-mono text-emerald-400 font-semibold">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {formatBolivares(game.totalVolume)}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
