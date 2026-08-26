import React, { useState, useEffect } from 'react';
import {
  Coins,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Sliders,
  DollarSign
} from 'lucide-react';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import type { EntryFeeItem } from '../../../types/admin';

export const AdminEntryFeesTab: React.FC = () => {
  const [fees, setFees] = useState<EntryFeeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Estado del modal de edición / creación
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingFee, setEditingFee] = useState<Partial<EntryFeeItem> | null>(null);

  const loadFees = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await AdminRepository.getEntryFeesList();
      setFees(data);
    } catch (err: any) {
      setError('Error al cargar montos de entrada.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFees();
  }, []);

  const handleOpenCreate = () => {
    setEditingFee({
      amount: 100,
      gameType: null,
      mode: null,
      displayOrder: (fees.length + 1) * 10,
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (fee: EntryFeeItem) => {
    setEditingFee({ ...fee });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFee || !editingFee.amount || editingFee.amount <= 0) {
      setError('El monto debe ser un número positivo.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await AdminRepository.saveEntryFee({
        id: editingFee.id,
        amount: Number(editingFee.amount),
        gameType: editingFee.gameType || null,
        mode: editingFee.mode || null,
        displayOrder: Number(editingFee.displayOrder || 0),
        isActive: editingFee.isActive ?? true,
      });

      if (res.success) {
        setSuccessMsg(editingFee.id ? 'Monto actualizado con éxito.' : 'Nuevo monto registrado correctamente.');
        setIsModalOpen(false);
        setEditingFee(null);
        await loadFees();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.error || 'Error al guardar monto.');
      }
    } catch (err: any) {
      setError(err.message || 'Excepción al guardar monto.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (fee: EntryFeeItem) => {
    try {
      const res = await AdminRepository.saveEntryFee({
        ...fee,
        isActive: !fee.isActive,
      });
      if (res.success) {
        await loadFees();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, amount: number) => {
    if (!window.confirm(`¿Estás seguro de eliminar el monto de ${amount} Bs.?`)) {
      return;
    }

    try {
      const res = await AdminRepository.deleteEntryFee(id);
      if (res.success) {
        setSuccessMsg(`Monto de ${amount} Bs. eliminado.`);
        await loadFees();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(res.error || 'No se pudo eliminar el monto.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div id="admin-entry-fees-tab" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <Coins className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Montos de Entrada Oficiales (Entry Fees)</h2>
          </div>
          <p className="text-sm text-slate-400">
            Configura los montos autorizados en Bolívares (Bs.) para la creación de mesas públicas y privadas Trancaíto.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="btn-refresh-entry-fees"
            onClick={loadFees}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm flex items-center gap-2 border border-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            id="btn-create-entry-fee"
            onClick={handleOpenCreate}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-amber-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            Nuevo Monto
          </button>
        </div>
      </div>

      {/* Alertas */}
      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabla de Montos */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold">Orden</th>
                <th className="px-6 py-4 font-semibold">Monto (Bs.)</th>
                <th className="px-6 py-4 font-semibold">Alcance / Juego</th>
                <th className="px-6 py-4 font-semibold">Modalidad</th>
                <th className="px-6 py-4 font-semibold">Estado</th>
                <th className="px-6 py-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                    Cargando montos de entrada...
                  </td>
                </tr>
              ) : fees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No hay montos de entrada configurados.
                  </td>
                </tr>
              ) : (
                fees.map((fee) => (
                  <tr key={fee.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">
                      #{fee.displayOrder}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-amber-400 font-mono">
                          {fee.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {fee.gameType ? (
                        <span className="px-2.5 py-1 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-md font-semibold">
                          {fee.gameType}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700 rounded-md font-semibold">
                          Todos los juegos
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {fee.mode || 'Cualquier modalidad'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(fee)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition ${
                          fee.isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                        }`}
                      >
                        {fee.isActive ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Activo
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            Inactivo
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(fee)}
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
                          title="Editar monto"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(fee.id, fee.amount)}
                          className="p-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 rounded-lg transition border border-rose-800/40"
                          title="Eliminar monto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Creación / Edición */}
      {isModalOpen && editingFee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
                  <DollarSign className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-100">
                  {editingFee.id ? 'Editar Monto de Entrada' : 'Nuevo Monto de Entrada'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Monto en Bolívares (Bs.) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={editingFee.amount || ''}
                    onChange={(e) => setEditingFee({ ...editingFee, amount: parseFloat(e.target.value) || 0 })}
                    placeholder="Ej: 50.00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 font-mono text-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                  <span className="absolute right-4 top-3.5 text-sm font-semibold text-slate-500">Bs.</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Orden de Visualización
                </label>
                <input
                  type="number"
                  value={editingFee.displayOrder || 0}
                  onChange={(e) => setEditingFee({ ...editingFee, displayOrder: parseInt(e.target.value, 10) || 0 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="chk-fee-active"
                  checked={editingFee.isActive ?? true}
                  onChange={(e) => setEditingFee({ ...editingFee, isActive: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="chk-fee-active" className="text-sm text-slate-300 font-medium cursor-pointer">
                  Monto activo y disponible para los jugadores
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-sm transition shadow-lg shadow-amber-600/20 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar Monto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
