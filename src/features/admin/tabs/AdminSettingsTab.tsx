// ==============================================================================
// RASPANDO LA OLLA — TAB 12: CONFIGURACIÓN GENERAL DEL SISTEMA
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import type { SystemSettings, UserRole } from '../../../types/admin';
import {
  Settings,
  ShieldAlert,
  Percent,
  Sliders,
  Check,
  AlertTriangle,
  Lock,
} from 'lucide-react';

interface AdminSettingsTabProps {
  settings: SystemSettings;
  currentUserRole: UserRole;
  onUpdateSetting: (key: string, value: any) => Promise<{ success: boolean; error?: string }>;
  onRefresh: () => void;
}

export function AdminSettingsTab({
  settings,
  currentUserRole,
  onUpdateSetting,
  onRefresh,
}: AdminSettingsTabProps) {
  const [formData, setFormData] = useState<SystemSettings>({ ...settings });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';

  const handleSaveFinancials = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await onUpdateSetting('SERVICE_FEE_PERCENT', { percent: formData.serviceFeePercent });
      await onUpdateSetting('WINNER_PERCENT', { percent: formData.winnerPercent });
      await onUpdateSetting('DEPOSIT_LIMITS', { min: formData.minDepositAmount, max: formData.maxDepositAmount });
      await onUpdateSetting('WITHDRAWAL_LIMITS', { min: formData.minWithdrawalAmount, max: formData.maxWithdrawalAmount });
      setSaveSuccess(true);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMaintenance = async () => {
    setSaving(true);
    try {
      const nextVal = !formData.maintenanceMode;
      await onUpdateSetting('MAINTENANCE_MODE', { enabled: nextVal });
      setFormData((prev) => ({ ...prev, maintenanceMode: nextVal }));
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" id="tab-admin-settings">
      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Configuración actualizada correctamente en la base de datos y registrada en auditoría.</span>
        </div>
      )}

      {/* Reglas Financieras */}
      <Card
        id="card-settings-financial"
        className="bg-slate-900/90 border-slate-800"
        header={
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
            <Percent className="w-4 h-4 text-amber-400" />
            <span>Reglas Financieras y Distribución de Pozos</span>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium block">
              Comisión de Servicio de Plataforma (%)
            </label>
            <input
              id="input-setting-fee"
              type="number"
              value={formData.serviceFeePercent}
              onChange={(e) => setFormData({ ...formData, serviceFeePercent: Number(e.target.value) })}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
            />
            <span className="text-[10px] text-slate-500">Por defecto: 10%</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium block">
              Premio al Ganador de la Mesa (%)
            </label>
            <input
              id="input-setting-winner"
              type="number"
              value={formData.winnerPercent}
              onChange={(e) => setFormData({ ...formData, winnerPercent: Number(e.target.value) })}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
            />
            <span className="text-[10px] text-slate-500">Por defecto: 90%</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium block">
              Monto Mínimo de Recarga (Bs.)
            </label>
            <input
              id="input-setting-min-dep"
              type="number"
              value={formData.minDepositAmount}
              onChange={(e) => setFormData({ ...formData, minDepositAmount: Number(e.target.value) })}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium block">
              Monto Máximo de Recarga (Bs.)
            </label>
            <input
              id="input-setting-max-dep"
              type="number"
              value={formData.maxDepositAmount}
              onChange={(e) => setFormData({ ...formData, maxDepositAmount: Number(e.target.value) })}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium block">
              Monto Mínimo de Retiro (Bs.)
            </label>
            <input
              id="input-setting-min-with"
              type="number"
              value={formData.minWithdrawalAmount}
              onChange={(e) => setFormData({ ...formData, minWithdrawalAmount: Number(e.target.value) })}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium block">
              Monto Máximo de Retiro (Bs.)
            </label>
            <input
              id="input-setting-max-with"
              type="number"
              value={formData.maxWithdrawalAmount}
              onChange={(e) => setFormData({ ...formData, maxWithdrawalAmount: Number(e.target.value) })}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
            />
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-800 flex justify-end">
          <Button
            id="btn-save-settings-financial"
            variant="primary"
            size="sm"
            isLoading={saving}
            onClick={handleSaveFinancials}
            leftIcon={<Check className="w-4 h-4" />}
          >
            Guardar Parámetros Financieros
          </Button>
        </div>
      </Card>

      {/* Modo de Mantenimiento y Políticas */}
      <Card
        id="card-settings-maintenance"
        className="bg-slate-900/90 border-slate-800"
        header={
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Políticas Operativas y Modo Mantenimiento</span>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-850">
            <div>
              <span className="font-bold text-slate-200 block mb-0.5">Modo Mantenimiento Global</span>
              <p className="text-slate-400 text-[11px]">
                Deshabilita la creación de nuevas mesas y muestra aviso de mantenimiento a los jugadores.
              </p>
            </div>
            <Button
              id="btn-toggle-maintenance"
              variant={formData.maintenanceMode ? 'primary' : 'outline'}
              size="sm"
              className={formData.maintenanceMode ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
              isLoading={saving}
              onClick={handleToggleMaintenance}
            >
              {formData.maintenanceMode ? 'Mantenimiento ACTIVO' : 'Desactivado'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
