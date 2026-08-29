// ==============================================================================
// RASPANDO LA OLLA — INDICADOR DE ESTADO DE CONECTIVIDAD
// ==============================================================================

import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useSupabaseStatus } from '../../hooks/useSupabaseStatus';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';

export function ConnectionBadge() {
  const network = useNetworkStatus();
  const { status: supabaseStatus } = useSupabaseStatus();

  if (network === 'offline') {
    return (
      <div
        id="badge-network-offline"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-950/80 text-red-300 border border-red-800/60"
        title="Sin conexión a internet"
      >
        <WifiOff className="w-3.5 h-3.5 text-red-400" />
        <span>Sin Conexión</span>
      </div>
    );
  }

  if (supabaseStatus === 'NOT_CONFIGURED' || supabaseStatus === 'ERROR') {
    return (
      <div
        id="badge-server-unconfigured"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/70 text-amber-300 border border-amber-700/50"
        title="Servicio de conexión en espera"
      >
        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
        <span>Sin conexión</span>
      </div>
    );
  }

  if (supabaseStatus === 'CONNECTED') {
    return null;
  }

  return (
    <div
      id="badge-network-online"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700"
    >
      <Wifi className="w-3.5 h-3.5 text-slate-400" />
      <span>Conectando...</span>
    </div>
  );
}
