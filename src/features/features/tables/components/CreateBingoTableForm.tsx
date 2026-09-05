import React, { useState } from 'react';
import { Zap, Users, Ticket, Sparkles, Loader2, X } from 'lucide-react';

export interface CreateBingoTableParams {
  gameType: 'bingo';
  gameVariant: '75' | '90';
  entryFee: number;
  maxPlayers: number;
  isPrivate: boolean;
}

export interface CreateBingoTableFormProps {
  onCreateTable: (params: CreateBingoTableParams) => void | Promise<void>;
  userBalance?: number;
  isSubmitting?: boolean;
  onCancel?: () => void;
}

/**
 * Formulario ultra-compacto, visual y rápido para crear mesas de Bingo (75 y 90 Bolas)
 */
export const CreateBingoTableForm: React.FC<CreateBingoTableFormProps> = ({
  onCreateTable,
  userBalance = 0,
  isSubmitting = false,
  onCancel,
}) => {
  const [variant, setVariant] = useState<'75' | '90'>('90');
  const [fee, setFee] = useState<number | string>(25);
  const [players, setPlayers] = useState<string>('UNLIMITED');
  const [isPrivate, setIsPrivate] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entryFeeNum = Number(fee) || 25;
    const maxPlayersNum = players === 'UNLIMITED' ? 99 : Number(players) || 99;

    onCreateTable({
      gameType: 'bingo',
      gameVariant: variant,
      entryFee: entryFeeNum,
      maxPlayers: maxPlayersNum,
      isPrivate,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      id="create-bingo-table-form"
      className="space-y-4 p-5 bg-slate-900 dark:bg-gray-900 rounded-2xl shadow-xl border border-slate-700 dark:border-gray-800 max-w-sm mx-auto text-slate-100"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xl font-black text-center text-slate-100 dark:text-white flex items-center gap-2">
          <span>🎱</span> Crear Mesa de Bingo
        </h3>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* 1. Tipo de Sorteo (Compacto y Visual: 75 vs 90 Bolas) */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          id="btn-variant-75"
          onClick={() => setVariant('75')}
          className={`p-3 rounded-xl border-2 font-bold text-sm transition-all flex flex-col items-center ${
            variant === '75'
              ? 'border-blue-500 bg-blue-950/60 text-blue-300 shadow-md shadow-blue-500/20 scale-[1.02]'
              : 'border-slate-700 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:text-slate-300'
          }`}
        >
          <span className="text-2xl font-black tracking-tight">75</span>
          <span className="text-xs font-semibold text-blue-400 mt-0.5">2 Ganadores</span>
          <span className="text-[10px] text-slate-400">Línea + Bingo</span>
        </button>

        <button
          type="button"
          id="btn-variant-90"
          onClick={() => setVariant('90')}
          className={`p-3 rounded-xl border-2 font-bold text-sm transition-all flex flex-col items-center ${
            variant === '90'
              ? 'border-purple-500 bg-purple-950/60 text-purple-300 shadow-md shadow-purple-500/20 scale-[1.02]'
              : 'border-slate-700 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:text-slate-300'
          }`}
        >
          <span className="text-2xl font-black tracking-tight">90</span>
          <span className="text-xs font-semibold text-purple-400 mt-0.5">1 Ganador</span>
          <span className="text-[10px] text-slate-400">Cartón Lleno</span>
        </button>
      </div>

      {/* 2. Costo por Cartón (Grande y Claro) */}
      <div>
        <label className="text-xs font-bold text-slate-400 dark:text-gray-400 ml-1 mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Ticket className="w-3.5 h-3.5 text-amber-400" /> Costo por Cartón
          </span>
          <span className="text-[11px] text-amber-400/90 font-mono font-medium">Mín. 10 Bs.</span>
        </label>
        <div className="flex items-center bg-slate-950 dark:bg-gray-800 border-2 border-slate-700 dark:border-gray-700 rounded-xl overflow-hidden focus-within:border-emerald-500 transition-colors">
          <input
            type="number"
            id="input-bingo-fee"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            min="10"
            max="5000"
            step="5"
            className="w-full p-3 text-2xl font-black text-center bg-transparent outline-none text-slate-100 placeholder-slate-500"
          />
          <span className="pr-4 font-black text-emerald-400 text-sm tracking-wider">BS</span>
        </div>
      </div>

      {/* 3. Capacidad de Jugadores */}
      <div>
        <label className="text-xs font-bold text-slate-400 dark:text-gray-400 ml-1 mb-1.5 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-cyan-400" /> Capacidad de Jugadores
        </label>
        <select
          id="select-bingo-players"
          value={players}
          onChange={(e) => setPlayers(e.target.value)}
          className="w-full p-3 bg-slate-950 dark:bg-gray-800 border-2 border-slate-700 dark:border-gray-700 rounded-xl font-bold text-slate-200 outline-none focus:border-indigo-500 transition-colors text-sm"
        >
          <option value="2">2 Jugadores</option>
          <option value="4">4 Jugadores</option>
          <option value="6">6 Jugadores</option>
          <option value="8">8 Jugadores</option>
          <option value="UNLIMITED">♾️ Ilimitado (Recomendado)</option>
        </select>
      </div>

      {/* Selector Mesa Privada / Pública */}
      <div className="flex items-center justify-between px-1 text-xs">
        <label htmlFor="checkbox-private-bingo" className="text-slate-400 font-medium cursor-pointer">
          Mesa privada (solo por código)
        </label>
        <input
          type="checkbox"
          id="checkbox-private-bingo"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-700 focus:ring-indigo-500"
        />
      </div>

      {/* 4. Botón de Acción */}
      <button
        type="submit"
        id="btn-submit-create-bingo"
        disabled={isSubmitting}
        className="w-full py-3.5 bg-gradient-to-r from-emerald-500 via-green-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 text-white font-black text-base rounded-xl shadow-lg shadow-emerald-500/20 transform transition active:scale-95 flex items-center justify-center gap-2 mt-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Creando mesa...</span>
          </>
        ) : (
          <>
            <Zap className="w-5 h-5 fill-current" />
            <span>CREAR MESA ({variant} Bolas)</span>
          </>
        )}
      </button>

      {/* Saldo de usuario */}
      <p className="text-xs text-center text-slate-400 mt-1">
        Tu saldo: <span className="font-bold text-emerald-400 font-mono">{userBalance.toFixed(2)} BS</span>
      </p>
    </form>
  );
};
