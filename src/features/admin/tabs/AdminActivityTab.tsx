import React, { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, Clock, Laptop, ShieldCheck, UserCheck, Search, Filter, AlertCircle, Wifi } from 'lucide-react';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import type { AdminActivityItem } from '../../../types/admin';

export function AdminActivityTab() {
  const [sessions, setSessions] = useState<AdminActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'IDLE' | 'DISCONNECTED' | 'ENDED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const data = await AdminRepository.getActivitySessions(100);
      setSessions(data);
    } catch (err) {
      console.error('[AdminActivityTab] Error cargando sesiones de actividad:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivity();
    const interval = setInterval(loadActivity, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, [loadActivity]);

  const filteredSessions = sessions.filter((session) => {
    const matchesStatus = statusFilter === 'ALL' || session.status === statusFilter;
    const matchesSearch =
      searchTerm === '' ||
      session.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.userId.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const activeCount = sessions.filter((s) => s.status === 'ACTIVE').length;
  const idleCount = sessions.filter((s) => s.status === 'IDLE').length;
  const disconnectedCount = sessions.filter((s) => s.status === 'DISCONNECTED').length;

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Activo
          </span>
        );
      case 'IDLE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            Inactivo
          </span>
        );
      case 'DISCONNECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
            Desconectado
          </span>
        );
      case 'ENDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-slate-500 border border-slate-800">
            Cerrada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div id="admin-activity-tab" className="space-y-6">
      {/* Encabezado y Métricas Rápidas */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            Monitoreo de Sesiones y Actividad de Usuarios
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Supervisión en tiempo real con pulsos de heartbeat centralizados en Supabase y reconciliación server-side.
          </p>
        </div>

        <button
          onClick={loadActivity}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-2 transition shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refrescar Ahora
        </button>
      </div>

      {/* Tarjetas de Resumen de Conectividad */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/20 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400">Usuarios Conectados (Activos)</p>
            <p className="text-2xl font-black text-emerald-400 mt-1">{activeCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Wifi className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-amber-500/20 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400">Sesiones Inactivas (Idle)</p>
            <p className="text-2xl font-black text-amber-400 mt-1">{idleCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400">Desconectados Recientes</p>
            <p className="text-2xl font-black text-slate-300 mt-1">{disconnectedCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
            <Laptop className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre, correo o ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {(['ALL', 'ACTIVE', 'IDLE', 'DISCONNECTED', 'ENDED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 ${
                statusFilter === st
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {st === 'ALL' ? 'Todas' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de Sesiones de Actividad */}
      <div className="overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-mono border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Usuario</th>
                <th className="py-3 px-4">Estatus</th>
                <th className="py-3 px-4">Último Pulso (Heartbeat)</th>
                <th className="py-3 px-4">Duración Oficial</th>
                <th className="py-3 px-4">Tipo de Actividad</th>
                <th className="py-3 px-4">Plataforma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No se encontraron sesiones con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-100">{session.userName}</div>
                      <div className="text-[11px] font-mono text-slate-400">{session.userEmail}</div>
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(session.status)}</td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {new Date(session.lastSeenAt).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas' })}
                      <div className="text-[10px] text-slate-500">
                        {new Date(session.lastSeenAt).toLocaleDateString('es-VE')}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-amber-400">
                      {formatDuration(session.sessionDurationSeconds)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                        {session.lastActivityType}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">{session.clientPlatform || 'WEB'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
