import React from 'react';
import { X, ShieldAlert, Award, Clock, Users, Flame } from 'lucide-react';
import { GameInfo } from '../../data/gameInfo';

interface GameRulesModalProps {
  game: GameInfo;
  onClose: () => void;
}

export const GameRulesModal: React.FC<GameRulesModalProps> = ({ game, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-[#0B0F17] border border-slate-800 text-slate-200 max-w-lg w-full rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-4 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{game.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-white">{game.title}</h3>
                {game.isHot && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-black tracking-wider uppercase flex items-center gap-1">
                    <Flame className="w-3 h-3 text-rose-500" /> HOT
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-medium">{game.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Resumen Rápido (Jugadores, Duración, Dificultad) */}
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
            <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 mb-0.5">
              <Users className="w-3.5 h-3.5 text-sky-400" />
              <span>Jugadores</span>
            </div>
            <p className="text-xs font-black text-slate-100">{game.players}</p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
            <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 mb-0.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Duración</span>
            </div>
            <p className="text-xs font-black text-slate-100">{game.duration}</p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
            <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 mb-0.5">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dificultad</span>
            </div>
            <p className="text-xs font-black text-slate-100">{game.difficulty}</p>
          </div>
        </div>

        {/* Objetivo */}
        <div className="mb-4 bg-slate-900/60 border border-slate-800/80 p-3 rounded-2xl">
          <p className="text-xs font-black text-amber-400 mb-1 flex items-center gap-1.5 uppercase tracking-wider">
            🎯 Objetivo Oficial
          </p>
          <p className="text-xs text-slate-300 leading-relaxed font-medium">{game.objective}</p>
        </div>

        {/* Reglas */}
        <div className="mb-4">
          <p className="text-xs font-black text-sky-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4 text-sky-400" /> Reglas de Juego & Conducción
          </p>
          <ul className="text-xs text-slate-300 space-y-2">
            {game.rules.map((rule, idx) => (
              <li key={idx} className="flex gap-2.5 bg-slate-950/40 p-2 rounded-xl border border-slate-800/60">
                <span className="text-amber-400 font-black shrink-0">{idx + 1}.</span>
                <span className="leading-relaxed">{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Consejos */}
        <div className="mb-5">
          <p className="text-xs font-black text-emerald-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
            💡 Consejos Tácticos
          </p>
          <ul className="text-xs text-slate-300 space-y-1.5">
            {game.tips.map((tip, idx) => (
              <li key={idx} className="flex gap-2 items-start">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span className="text-slate-300">{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20 text-xs uppercase tracking-wider cursor-pointer"
        >
          ¡Entendido, a raspar la olla!
        </button>
      </div>
    </div>
  );
};
