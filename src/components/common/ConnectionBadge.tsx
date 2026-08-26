// ==============================================================================
// RASPANDO LA OLLA — INDICADOR DE ESTADO DE CONECTIVIDAD
// ==============================================================================

import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useSupabaseStatus } from '../../hooks/useSupabaseStatus';
import { Wifi, WifiOff, Database, AlertCircle } from 'lucide-react';

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

  if (supabaseStatus === 'NOT_CONFIGURED') {
    return (
      <div
        id="badge-supabase-unconfigured"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/70 text-amber-300 border border-amber-700/50"
        title="Comprobando enlace de red"
      >
        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
        <span>Servidor: Enlazando</span>
      </div>
    );
  }

  if (supabaseStatus === 'CONNECTED') {
    return (
      <div
        id="badge-supabase-connected"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-700/50"
        title="Conexión activa y protegida en tiempo real"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <Database className="w-3.5 h-3.5 text-emerald-400" />
        <span>Servidor Activo</span>
      </div>
    );
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
