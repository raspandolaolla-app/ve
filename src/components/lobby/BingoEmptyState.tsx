import React from 'react';
import { PlusCircle } from 'lucide-react';

interface BingoEmptyStateProps {
  onCreateTable: () => void;
}

export const BingoEmptyState: React.FC<BingoEmptyStateProps> = ({ onCreateTable }) => {
  return (
    <div className="bg-gradient-to-b from-[#1E1936] to-[#120F22] rounded-2xl border border-purple-500/30 p-10 text-center shadow-[0_0_30px_rgba(168,85,247,0.1)]">
      <div className="w-20 h-20 mx-auto bg-purple-900/50 rounded-full flex items-center justify-center mb-6 border border-purple-500/50">
        <span className="text-4xl select-none">🎱</span>
      </div>
      
      <h3 className="text-white font-black text-2xl mb-3 tracking-wide">
        No hay mesas de Bingo disponibles
      </h3>
      <p className="text-slate-400 text-sm mb-8 max-w-md mx-auto leading-relaxed">
        ¡Sé el primero en crear una mesa, define el valor del cartón y empieza la emoción del sorteo en tiempo real!
      </p>

      <button 
        id="btn-create-first-bingo-table"
        onClick={onCreateTable}
        className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black text-lg px-8 py-4 rounded-xl inline-flex items-center gap-3 transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] active:scale-95 cursor-pointer"
      >
        <PlusCircle size={24} />
        Crear Primera Mesa
      </button>
    </div>
  );
};
