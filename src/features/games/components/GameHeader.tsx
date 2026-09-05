import React from 'react';
import {
  ArrowLeft,
  Radio,
  RefreshCw,
  WifiOff,
  Minimize2,
  Maximize2,
  Shrink,
  Expand,
  LogOut,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { formatBolivares, getGameDisplayName } from '../../../utils/formatters';

export interface GameHeaderProps {
  table: GameTable;
  currentPlayers: TablePlayer[];
  realtimeStatus: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';
  onlineUsersCount: number;
  isFullscreenNative: boolean;
  onToggleFullscreen: () => void;
  isImmersiveMode: boolean;
  onToggleImmersive: () => void;
  onBackClick: () => void;
  onAbandonClick: () => void;
  abandonNotice?: string | null;
  errorMsg?: string | null;
  botNotice?: string | null;
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  table,
  currentPlayers,
  realtimeStatus,
  onlineUsersCount,
  isFullscreenNative,
  onToggleFullscreen,
  isImmersiveMode,
  onToggleImmersive,
  onBackClick,
  onAbandonClick,
  abandonNotice,
  errorMsg,
  botNotice,
}) => {
  return (
    <>
      {/* Barra de Navegación de la Mesa */}
      <header className="border-b border-neutral-800 bg-neutral-900/90 backdrop-blur-md px-2 sm:px-4 py-1.5 sm:py-2.5 sticky top-0 z-30 flex items-center justify-between gap-1.5 sm:gap-2 shrink-0 max-w-full overflow-hidden">
        <div className="flex items-center space-x-1.5 sm:space-x-3 min-w-0 flex-1">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBackClick();
            }}
            className="p-1.5 sm:p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors shrink-0 touch-manipulation cursor-pointer"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-1 sm:space-x-1.5 truncate">
              <span className="truncate">{getGameDisplayName(table.gameType)}</span>
              <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono border border-amber-500/30 shrink-0">
                #{table.id.substring(0, 4).toUpperCase()}
              </span>
            </h1>
            <div className="flex items-center space-x-1 sm:space-x-1.5 text-[9px] sm:text-xs text-neutral-400 font-mono mt-0.5 whitespace-nowrap overflow-hidden">
              <span className="truncate">Entrada: {formatBolivares(table.entryFee)}</span>
              <span className="text-neutral-600">•</span>
              <span className="text-emerald-400 font-bold truncate">
                Pozo: {formatBolivares(table.entryFee * currentPlayers.length)}
              </span>
            </div>
          </div>
        </div>

        {/* Indicadores de Conexión, Fullscreen y Abandono */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
          {realtimeStatus === 'CONNECTED' ? (
            <div className="flex items-center space-x-1 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] sm:text-xs font-mono">
              <Radio className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-pulse shrink-0" />
              <span className="hidden sm:inline">
                EN VIVO ({onlineUsersCount || 1}/{currentPlayers.length})
              </span>
              <span className="sm:hidden font-bold">VIVO</span>
            </div>
          ) : realtimeStatus === 'CONNECTING' ? (
            <div className="flex items-center space-x-1 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[9px] sm:text-xs font-mono">
              <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin shrink-0" />
              <span className="hidden sm:inline">CONECTANDO</span>
              <span className="sm:hidden font-bold">...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] sm:text-xs font-mono">
              <WifiOff className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span className="hidden sm:inline">RECONECTANDO</span>
              <span className="sm:hidden font-bold">OFF</span>
            </div>
          )}

          <button
            id="fullscreen-toggle-btn"
            onClick={onToggleFullscreen}
            className="p-1.5 sm:p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors shrink-0 touch-manipulation"
            title={isFullscreenNative ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreenNative ? (
              <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            )}
          </button>

          <button
            id="immersive-toggle-btn"
            onClick={onToggleImmersive}
            className="p-1.5 sm:p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors shrink-0 touch-manipulation hidden md:flex items-center"
            title={isImmersiveMode ? 'Minimizar a vista regular' : 'Modo Inmersivo'}
          >
            {isImmersiveMode ? (
              <Shrink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            ) : (
              <Expand className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            )}
          </button>

          <button
            id="abandon-table-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAbandonClick();
            }}
            className="flex items-center space-x-1 px-2 py-1.5 sm:px-3 sm:py-2 bg-red-500/20 hover:bg-red-500/30 active:bg-red-500/50 text-red-300 border border-red-500/40 rounded-xl text-[10px] sm:text-xs font-black transition-all touch-manipulation pointer-events-auto shrink-0 z-50 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">ABANDONAR MESA</span>
            <span className="sm:hidden">SALIR</span>
          </button>
        </div>
      </header>

      {/* Alerta de Abandono de Jugador */}
      {abandonNotice && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 text-amber-200 px-4 py-2 text-xs font-bold flex items-center justify-center space-x-2 animate-in slide-in-from-top">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{abandonNotice}</span>
        </div>
      )}

      {/* Alerta de Error Temporal */}
      {errorMsg && (
        <div className="bg-red-500/20 border-b border-red-500/40 text-red-300 px-4 py-2 text-xs font-semibold flex items-center justify-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Alerta de Movimiento Bot por Inactividad */}
      {botNotice && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 text-amber-300 px-4 py-2 text-xs font-bold flex items-center justify-center space-x-2 animate-pulse">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{botNotice}</span>
        </div>
      )}
    </>
  );
};
