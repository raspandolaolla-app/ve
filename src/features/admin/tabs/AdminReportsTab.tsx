// ==============================================================================
// RASPANDO LA OLLA — TAB 14: REPORTES Y EXPORTACIÓN CONTABLE
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { formatBolivares } from '../../../utils/formatters';
import type { AdminDashboardMetrics } from '../../../types/admin';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  BarChart3,
  TrendingUp,
  FileText,
} from 'lucide-react';

interface AdminReportsTabProps {
  metrics: AdminDashboardMetrics;
}

export function AdminReportsTab({ metrics }: AdminReportsTabProps) {
  const [reportType, setReportType] = useState<'FINANCIAL' | 'USERS' | 'GAMES'>('FINANCIAL');

  const handleExportCSV = () => {
    const csvContent = `data:text/csv;charset=utf-8,Concepto,Monto (Bs.)\nVolumen Total Jugado,${metrics.totalVolumePlayed}\nPremios Ganadores (90%),${metrics.totalPrizesAwarded}\nComision Plataforma (10%),${metrics.totalServiceFeesCollected}\nUsuarios Registrados,${metrics.registeredUsersCount}\nPartidas Jugadas,${metrics.finishedMatchesCount}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reporte_financiero_raspando_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6" id="tab-admin-reports">
      {/* Selector de Tipo de Reporte */}
      <Card id="card-reports-actions" className="bg-slate-900/90 border-slate-800">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex gap-2">
            <button
              id="btn-rep-financial"
              type="button"
              onClick={() => setReportType('FINANCIAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                reportType === 'FINANCIAL'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-950/80 border border-slate-800 text-slate-400'
              }`}
            >
              Cierre Financiero
            </button>
            <button
              id="btn-rep-users"
              type="button"
              onClick={() => setReportType('USERS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                reportType === 'USERS'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-950/80 border border-slate-800 text-slate-400'
              }`}
            >
              Actividad de Usuarios
            </button>
          </div>

          <div className="flex gap-2">
            <Button
              id="btn-export-csv"
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              Exportar CSV
            </Button>
            <Button
              id="btn-print-report"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              leftIcon={<Printer className="w-3.5 h-3.5" />}
            >
              Imprimir
            </Button>
          </div>
        </div>
      </Card>

      {/* Resumen del Reporte Financiero */}
      <Card
        id="card-report-content"
        className="bg-slate-900/90 border-slate-800 space-y-4"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Informe de Liquidación y Auditoría Contable</span>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Fecha de Emisión: {new Date().toLocaleDateString('es-VE')}
            </span>
          </div>
        }
      >
        <div className="divide-y divide-slate-850 text-xs">
          <div className="flex justify-between py-2.5">
            <span className="text-slate-400">Volumen Bruto Acumulado en Mesas</span>
            <span className="font-mono font-bold text-slate-100">{formatBolivares(metrics.totalVolumePlayed)}</span>
          </div>

          <div className="flex justify-between py-2.5">
            <span className="text-slate-400">Premios Distribuidos a Ganadores (Regla 90%)</span>
            <span className="font-mono font-bold text-amber-300">{formatBolivares(metrics.totalPrizesAwarded)}</span>
          </div>

          <div className="flex justify-between py-2.5">
            <span className="text-slate-400">Comisiones de Servicio Retenidas (Regla 10%)</span>
            <span className="font-mono font-bold text-emerald-400">{formatBolivares(metrics.totalServiceFeesCollected)}</span>
          </div>

          <div className="flex justify-between py-2.5">
            <span className="text-slate-400">Partidas Finalizadas con Éxito</span>
            <span className="font-mono text-slate-200">{metrics.finishedMatchesCount}</span>
          </div>

          <div className="flex justify-between py-2.5">
            <span className="text-slate-400">Total de Cuentas de Usuario Registradas</span>
            <span className="font-mono text-slate-200">{metrics.registeredUsersCount}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
