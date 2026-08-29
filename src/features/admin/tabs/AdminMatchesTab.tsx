// ==============================================================================
// RASPANDO LA OLLA — TAB 7: PARTIDAS Y LIQUIDACIONES DE POZO
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { formatBolivares } from '../../../utils/formatters';
import type { AdminMatchItem } from '../../../types/admin';
import {
  Gamepad2,
  Award,
  CircleDollarSign,
  TrendingUp,
  Clock,
  Eye,
  Search,
} from 'lucide-react';

interface AdminMatchesTabProps {
  matches: AdminMatchItem[];
  onRefresh: () => void;
}

export function AdminMatchesTab({ matches, onRefresh }: AdminMatchesTabProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMatches = matches.filter(
    (m) =>
      m.gameName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.winnerName && m.winnerName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6" id="tab-admin-matches">
      {/* Filtro */}
      <Card id="card-matches-filter" className="bg-slate-900/90 border-slate-800">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-matches"
              type="text"
              placeholder="Buscar por juego, ID o ganador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <span className="text-xs text-slate-400">
            Regla de Liquidación: <span className="text-amber-300 font-semibold">90% Ganador / 10% Tarifa</span>
          </span>
        </div>
      </Card>

      {/* Tabla de Partidas */}
      <Card
        id="card-matches-table"
        className="bg-slate-900/90 border-slate-800 overflow-hidden"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <Gamepad2 className="w-4 h-4 text-emerald-400" />
              <span>Historial de Partidas y Liquidaciones ({filteredMatches.length})</span>
            </div>
            <span className="text-xs text-slate-500">Transparencia en Ledger</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Fecha</th>
                <th className="py-2.5 px-3">Juego</th>
                <th className="py-2.5 px-3">Pozo Total</th>
                <th className="py-2.5 px-3">Premio Ganador (90%)</th>
                <th className="py-2.5 px-3">Comisión (10%)</th>
                <th className="py-2.5 px-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No hay registros de partidas que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filteredMatches.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                      {new Date(m.startedAt).toLocaleString('es-VE')}
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-200">{m.gameName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">ID: {m.id.slice(0, 8)}</div>
                    </td>

                    <td className="py-3 px-3 font-mono font-bold text-slate-200">
                      {formatBolivares(m.totalPot)}
                    </td>

                    <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                      {formatBolivares(m.winnerPayout)}
                    </td>

                    <td className="py-3 px-3 font-mono font-semibold text-blue-400">
                      {formatBolivares(m.serviceFee)}
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.status === 'FINISHED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : m.status === 'IN_PROGRESS'
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {m.status === 'FINISHED' ? 'LIQUIDADA' : m.status === 'IN_PROGRESS' ? 'EN JUEGO' : m.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
