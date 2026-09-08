// ==============================================================================
// RASPANDO LA OLLA — COMPONENTE DE ESTADO DE CONEXIÓN DE JUEGO
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { RealtimeManager } from '../../services/realtime/RealtimeManager';

export interface ConnectionStatusPlayer {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  isConnected?: boolean;
}

export interface ConnectionStatusProps {
  sessionId?: string | null;
  currentPlayerId?: string | null;
  players?: ConnectionStatusPlayer[];
  className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  sessionId,
  currentPlayerId,
  players = [],
  className = '',
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('connected');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const checkConnection = () => {
      const status = RealtimeManager.getConnectionStatus();
      setConnectionStatus(status.connected ? 'connected' : 'disconnected');
    };

    const interval = setInterval(checkConnection, 5000);
    checkConnection();

    return () => clearInterval(interval);
  }, []);

  const disconnectedPlayers = players.filter((p) => p.isConnected === false);

  if (!isOnline) {
    return (
      <div
        id="game-connection-offline-banner"
        className={`bg-red-600/90 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-semibold shadow backdrop-blur-sm ${className}`}
      >
        <WifiOff size={14} className="animate-pulse" />
        <span>Sin conexión a internet</span>
      </div>
    );
  }

  if (connectionStatus === 'disconnected') {
    return (
      <div
        id="game-connection-reconnecting-banner"
        className={`bg-amber-600/90 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-semibold shadow backdrop-blur-sm ${className}`}
      >
        <AlertCircle size={14} className="animate-spin" />
        <span>Reconectando al servidor...</span>
      </div>
    );
  }

  if (disconnectedPlayers.length > 0) {
    return (
      <div id="game-connection-players-status" className={`space-y-1 ${className}`}>
        {disconnectedPlayers.map((player) => (
          <div
            key={player.userId}
            id={`disconnected-player-${player.userId}`}
            className="bg-amber-500/20 border border-amber-500/40 text-amber-200 px-3 py-1 rounded-md flex items-center gap-2 text-xs"
          >
            <WifiOff size={12} className="text-amber-400" />
            <span>{player.displayName} se ha desconectado</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      id="game-connection-online-badge"
      className={`bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-full flex items-center gap-1.5 text-xs font-medium backdrop-blur-sm ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      <Wifi size={12} />
      <span>Conectado</span>
    </div>
  );
};
