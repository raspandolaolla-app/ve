import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export interface SoundControlsProps {
  isEnabled: boolean;
  volume: number;
  onToggle: () => void;
  onVolumeChange: (volume: number) => void;
}

export const SoundControls: React.FC<SoundControlsProps> = ({
  isEnabled,
  volume,
  onToggle,
  onVolumeChange
}) => {
  return (
    <div
      id="bingo-sound-controls"
      className="bg-slate-900/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-800 p-2.5 flex items-center gap-3 w-full"
    >
      {/* Botón de mute/unmute */}
      <button
        id="btn-toggle-sound"
        type="button"
        onClick={onToggle}
        className={`
          p-2 rounded-lg transition-all shrink-0
          ${isEnabled 
            ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30' 
            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'}
        `}
        title={isEnabled ? 'Silenciar sonidos' : 'Activar sonidos'}
      >
        {isEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </button>

      {/* Slider de volumen */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <input
          id="bingo-volume-slider"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          disabled={!isEnabled}
          className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-amber-400"
          style={{
            background: isEnabled 
              ? `linear-gradient(to right, #f59e0b 0%, #f59e0b ${volume * 100}%, #334155 ${volume * 100}%, #334155 100%)`
              : undefined
          }}
        />
        <span className="text-[11px] font-mono font-bold text-slate-300 w-8 text-right shrink-0">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
};
