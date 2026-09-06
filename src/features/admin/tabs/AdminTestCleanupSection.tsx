// ==============================================================================
// RASPANDO LA OLLA — MANTENIMIENTO: PURGA ADMINISTRATIVA DE DATOS DE PRUEBA
// ==============================================================================
// Permite al Administrador depurar de forma segura saldos y registros del Bono
// de Prueba (5000 Bs) sin comprometer dinero real ni depósitos legítimos.
// ==============================================================================

import { useState } from 'react';
import { Trash2, AlertTriangle, CheckCircle2, ShieldAlert, Coins, RefreshCw } from 'lucide-react';
import { AdminRepository } from '../../../services/repositories/AdminRepository';

interface AdminTestCleanupSectionProps {
  onPurgeComplete?: () => void;
}

export function AdminTestCleanupSection({ onPurgeComplete }: AdminTestCleanupSectionProps) {
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; affectedUsers?: number } | null>(null);

  const REQUIRED_PHRASE = 'ELIMINAR DATOS DE PRUEBA';
  const isConfirmed = confirmationPhrase.trim() === REQUIRED_PHRASE;

  const handleExecutePurge = async () => {
    if (!isConfirmed) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await AdminRepository.adminPurgeTestData();
      if (res.success) {
        setResult({
          success: true,
          message: res.message,
          affectedUsers: res.affectedUsers,
        });
        setConfirmationPhrase('');
        if (onPurgeComplete) {
          onPurgeComplete();
        }
      } else {
        setResult({
          success: false,
          message: res.error || 'No se pudo ejecutar la depuración.',
        });
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: err?.message || 'Error inesperado al purgar datos de prueba.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="admin-test-cleanup-section"
      className="p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-red-950/20 via-slate-900 to-slate-900/90 border border-red-500/30 text-slate-100 shadow-xl space-y-4"
    >
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0 text-red-400">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            Purga de Saldos y Datos de Prueba (5.000 Bs.)
            <span className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-[10px] font-bold text-red-300">
              SOLO ADMINISTRADOR
            </span>
          </h3>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            Herramienta quirúrgica para reiniciar el entorno de pruebas antes o después de sesiones de validación.
          </p>
        </div>
      </div>

      {/* Reglas de Seguridad */}
      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
        <div className="flex items-center gap-2 text-amber-300 font-semibold">
          <Coins className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Garantía de Integridad Financiera y Protección de Dinero Real:</span>
        </div>
        <ul className="list-disc list-inside text-slate-400 space-y-1 text-[11px] pl-1">
          <li>
            <strong className="text-slate-200">Saldo ≤ 5.000 Bs:</strong> Se asume que solo posee dinero de prueba. Su saldo se resetea a <strong>0,00 Bs.</strong>
          </li>
          <li>
            <strong className="text-slate-200">Saldo &gt; 5.000 Bs:</strong> Si el usuario depositó dinero real posterior a las pruebas, se le descuentan estrictamente <strong>5.000,00 Bs.</strong> de prueba, preservando íntegramente su dinero real.
          </li>
          <li>
            <strong className="text-slate-200">Libro Mayor (Ledger):</strong> Elimina exclusivamente las entradas contables etiquetadas con <code className="text-amber-400 font-mono">source_type = 'TEST_BONUS'</code>.
          </li>
          <li>
            <strong className="text-slate-200">Permisividad:</strong> Restaura la bandera en los perfiles para permitir nuevas pruebas si fuera requerido.
          </li>
        </ul>
      </div>

      {/* Caja de Confirmación */}
      <div className="space-y-2 pt-1">
        <label htmlFor="test-cleanup-confirm-input" className="block text-xs text-slate-300 font-medium">
          Para confirmar, escribe exactamente: <strong className="text-red-400 font-mono tracking-wider">{REQUIRED_PHRASE}</strong>
        </label>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            id="test-cleanup-confirm-input"
            type="text"
            value={confirmationPhrase}
            onChange={(e) => setConfirmationPhrase(e.target.value)}
            placeholder={REQUIRED_PHRASE}
            disabled={loading}
            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
          />
          <button
            id="test-cleanup-execute-btn"
            onClick={handleExecutePurge}
            disabled={!isConfirmed || loading}
            className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-red-950/40 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Purgando Datos...
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                Ejecutar Purga de Pruebas
              </>
            )}
          </button>
        </div>
      </div>

      {/* Resultados */}
      {result && (
        <div
          className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs ${
            result.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {result.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>
            {result.message}
            {result.affectedUsers !== undefined && (
              <span className="font-bold ml-1">({result.affectedUsers} usuarios afectados)</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
