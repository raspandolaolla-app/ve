/**
 * Componente de filtros y selector de tipo de juego para mesas
 * Extraído de TablesView.tsx para modularidad y mantenibilidad
 */
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { SUPPORTED_GAMES_METADATA } from '../../../utils/constants';
import type { GameType } from '../../../types/games';

export interface TableFiltersProps {
  selectedGameFilter: GameType | 'all';
  onSelectGameFilter: (filter: GameType | 'all') => void;
  loadingTables: boolean;
  onRefresh: () => void;
}

export const TableFilters: React.FC<TableFiltersProps> = ({
  selectedGameFilter,
  onSelectGameFilter,
  loadingTables,
  onRefresh,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-slate-100">Mesas Públicas Disponibles</h2>
        <button
          onClick={onRefresh}
          className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
          title="Refrescar mesas"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingTables ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
        <button
          onClick={() => onSelectGameFilter('all')}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            selectedGameFilter === 'all'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          Todos los juegos
        </button>
        {SUPPORTED_GAMES_METADATA.map((game) => (
          <button
            key={game.id}
            onClick={() => onSelectGameFilter(game.id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              selectedGameFilter === game.id
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            {game.name}
          </button>
        ))}
      </div>
    </div>
  );
};
