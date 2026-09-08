import React from 'react';
import { Users, Ticket, Zap, Crown } from 'lucide-react';

interface BingoTableCardProps {
  table: {
    id: string;
    game_variant: string;
    entry_fee: number;
    current_prize?: number;
    prize_pool?: number;
    players_count?: number;
    max_players?: number;
    cards_sold?: number;
    status: string;
  };
  onJoin: (tableId: string) => void;
}

export const BingoTableCard: React.FC<BingoTableCardProps> = ({ table, onJoin }) => {
  const isDrawing = table.status === 'DRAWING' || table.status === 'drawing';

  return (
    <div
      id={`bingo-table-card-${table.id}`}
      className={`bg-gradient-to-b from-[#1A2235] to-[#0F1523] border rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${
        isDrawing ? 'border-yellow-500/30 opacity-90' : 'border-slate-700/50 hover:border-amber-500/50'
      }`}
    >
      {/* Header de la Tarjeta */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white shadow-lg ${
              table.game_variant === '75'
                ? 'bg-gradient-to-br from-blue-600 to-blue-800'
                : 'bg-gradient-to-br from-purple-600 to-purple-800'
            }`}
          >
            {table.game_variant}
          </div>
          <div>
            <h3 className="font-black text-white text-base tracking-wide">Bingo {table.game_variant} Bolas</h3>
            <p className="text-xs text-slate-400">
              {table.game_variant === '75' ? '2 Ganadores (Línea + Bingo)' : '1 Ganador (Cartón Lleno)'}
            </p>
          </div>
        </div>

        {isDrawing ? (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 text-yellow-400 text-[10px] font-black uppercase rounded-full border border-yellow-500/30">
            <Zap size={12} className="animate-pulse" /> En Juego
          </span>
        ) : (
          <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase rounded-full border border-emerald-500/30">
            Abierto
          </span>
        )}
      </div>

      {/* Estadísticas (Entrada y Pozo) */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#0B0F17]/60 rounded-xl p-3 text-center border border-slate-800">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Entrada</p>
          <p className="text-xl font-black text-emerald-400 font-mono">
            {table.entry_fee} <span className="text-xs text-emerald-600">Bs</span>
          </p>
        </div>
        <div className="bg-[#0B0F17]/60 rounded-xl p-3 text-center border border-slate-800">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Pozo</p>
          <p className="text-xl font-black text-purple-400 font-mono">
            {table.current_prize || table.prize_pool || 0} <span className="text-xs text-purple-600">Bs</span>
          </p>
        </div>
      </div>

      {/* Jugadores y Cartones */}
      <div className="flex items-center justify-between text-xs text-slate-400 mb-5 px-1">
        <div className="flex items-center gap-1.5">
          <Users size={14} className="text-slate-500" />
          <span className="font-semibold text-slate-300">
            {table.players_count || 0}/{table.max_players === 99 ? '∞' : table.max_players}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Ticket size={14} className="text-slate-500" />
          <span className="font-semibold text-slate-300">{table.cards_sold || 0} cartones</span>
        </div>
      </div>

      {/* Botón de Acción */}
      {isDrawing ? (
        <button
          disabled
          className="w-full py-3.5 bg-slate-800/50 text-slate-500 font-bold rounded-xl cursor-not-allowed flex items-center justify-center gap-2 text-sm border border-slate-700"
        >
          <Zap size={16} /> Sorteo en curso
        </button>
      ) : (
        <button
          id={`btn-join-bingo-table-${table.id}`}
          onClick={() => onJoin(table.id)}
          className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all active:scale-95 flex items-center justify-center gap-2 text-sm uppercase tracking-wide cursor-pointer"
        >
          <Crown size={16} /> Unirse Ahora
        </button>
      )}
    </div>
  );
};
