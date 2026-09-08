/**
 * Tarjeta individual de mesa de juego
 * Extraído de TablesView.tsx para modularidad y mantenibilidad
 */
import React from 'react';
import { Users, Coins } from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { SUPPORTED_GAMES_METADATA } from '../../../utils/constants';
import { formatBolivares } from '../../../utils/formatters';
import type { GameTable } from '../../../types/tables';

export interface TableCardProps {
  table: GameTable;
  onView: (table: GameTable) => void;
}

export const TableCard: React.FC<TableCardProps> = ({ table, onView }) => {
  const gameMeta = SUPPORTED_GAMES_METADATA.find((g) => g.id === table.gameType);
  const isFull = table.currentPlayersCount >= table.maxPlayers;

  return (
    <Card
      key={table.id}
      id={`table-card-${table.id}`}
      className="hover:border-amber-500/30 transition-all flex flex-col justify-between"
    >
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-100 text-sm">{table.name || gameMeta?.name || table.gameType}</h3>
            <span className="text-[11px] text-slate-400">{gameMeta?.name}</span>
          </div>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
              isFull
                ? 'bg-red-950/60 text-red-400 border border-red-800/40'
                : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
            }`}
          >
            {isFull ? 'Completa' : 'Abierta'}
          </span>
        </div>

        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {table.currentPlayersCount} / {table.maxPlayers} jug.
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-mono font-semibold text-amber-300">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>{formatBolivares(table.entryFee)}</span>
          </div>
        </div>
      </div>

      <div className="pt-4 mt-2">
        <Button
          id={`btn-view-table-${table.id}`}
          variant={isFull ? 'secondary' : 'primary'}
          size="sm"
          className="w-full text-xs font-semibold"
          onClick={() => onView(table)}
        >
          {isFull ? 'Ver Mesa (Espectador)' : 'Ingresar a la Sala'}
        </Button>
      </div>
    </Card>
  );
};
