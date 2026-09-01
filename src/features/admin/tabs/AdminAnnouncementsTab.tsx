import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Bell,
  Calendar,
  Layers,
  Eye,
  X
} from 'lucide-react';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import type { SystemAnnouncementItem } from '../../../types/admin';

export const AdminAnnouncementsTab: React.FC = () => {
  const [announcements, setAnnouncements] = useState<SystemAnnouncementItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Partial<SystemAnnouncementItem> | null>(null);

  const loadAnnouncements = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await AdminRepository.getAnnouncementsList();
      setAnnouncements(list);
    } catch (err: any) {
      setError('Error al cargar anuncios del sistema.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleOpenCreate = () => {
    setEditingAnnouncement({
      title: '',
      content: '',
      type: 'GENERAL',
      priority: 10,
      targetAudience: 'ALL',
      isActive: true,
      startsAt: new Date().toISOString().slice(0, 16),
      expiresAt: null,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (ann: SystemAnnouncementItem) => {
    setEditingAnnouncement({
      ...ann,
      startsAt: ann.startsAt ? ann.startsAt.slice(0, 16) : new Date().toISOString().slice(0, 16),
      expiresAt: ann.expiresAt ? ann.expiresAt.slice(0, 16) : null,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAnnouncement || !editingAnnouncement.title || !editingAnnouncement.content) {
      setError('El título y contenido son requeridos.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await AdminRepository.saveAnnouncement({
        id: editingAnnouncement.id,
        title: editingAnnouncement.title,
        content: editingAnnouncement.content,
        type: editingAnnouncement.type || 'GENERAL',
        priority: Number(editingAnnouncement.priority || 0),
        targetAudience: editingAnnouncement.targetAudience || 'ALL',
        isActive: editingAnnouncement.isActive ?? true,
        startsAt: editingAnnouncement.startsAt ? new Date(editingAnnouncement.startsAt).toISOString() : new Date().toISOString(),
        expiresAt: editingAnnouncement.expiresAt ? new Date(editingAnnouncement.expiresAt).toISOString() : null,
      });

      if (res.success) {
        setSuccessMsg(editingAnnouncement.id ? 'Anuncio actualizado con éxito.' : 'Anuncio publicado correctamente.');
        setIsModalOpen(false);
        setEditingAnnouncement(null);
        await loadAnnouncements();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.error || 'Error al guardar el anuncio.');
      }
    } catch (err: any) {
      setError(err.message || 'Excepción al guardar anuncio.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el anuncio "${title}"?`)) return;

    try {
      const res = await AdminRepository.deleteAnnouncement(id);
      if (res.success) {
        setSuccessMsg('Anuncio eliminado.');
        await loadAnnouncements();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(res.error || 'Error al eliminar anuncio.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'IMPORTANT':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'MAINTENANCE':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'PROMOTION':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'SECURITY':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'UPDATE':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'MARQUEE':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
    }
  };

  return (
    <div id="admin-announcements-tab" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
              <Megaphone className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Anuncios y Avisos del Sistema</h2>
          </div>
          <p className="text-sm text-slate-400">
            Publica banners y alertas globales dirigidas a jugadores, salas de juego o mantenimiento programado.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadAnnouncements}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm flex items-center gap-2 border border-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={handleOpenCreate}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            Nuevo Anuncio
          </button>
        </div>
      </div>

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

      {/* Lista de Anuncios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-2 p-12 text-center text-slate-500 bg-slate-900/60 rounded-2xl border border-slate-800">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-500" />
            Cargando avisos del sistema...
          </div>
        ) : announcements.length === 0 ? (
          <div className="col-span-2 p-12 text-center text-slate-500 bg-slate-900/60 rounded-2xl border border-slate-800">
            No hay anuncios registrados actualmente.
          </div>
        ) : (
          announcements.map((ann) => (
            <div
              key={ann.id}
              className={`p-6 rounded-2xl border transition shadow-xl bg-slate-900/70 ${
                ann.isActive ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/40 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getTypeBadge(ann.type)}`}>
                    {ann.type}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Prioridad {ann.priority}
                  </span>
                  <span className="text-xs text-slate-400">
                    • Público: <strong className="text-slate-300">{ann.targetAudience}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(ann)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                    title="Editar anuncio"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(ann.id, ann.title)}
                    className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 rounded-lg transition border border-rose-800/40"
                    title="Eliminar anuncio"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-base font-bold text-slate-100 mb-2">{ann.title}</h3>
              <p className="text-sm text-slate-300 mb-4 whitespace-pre-wrap">{ann.content}</p>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-800/60">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Publicado: {new Date(ann.startsAt).toLocaleDateString('es-VE')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${ann.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className={ann.isActive ? 'text-emerald-400' : 'text-rose-400 font-medium'}>
                    {ann.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Creación / Edición de Anuncio */}
      {isModalOpen && editingAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
                  <Megaphone className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-100">
                  {editingAnnouncement.id ? 'Editar Anuncio' : 'Nuevo Anuncio del Sistema'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Título del Anuncio *
                </label>
                <input
                  type="text"
                  required
                  value={editingAnnouncement.title || ''}
                  onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, title: e.target.value })}
                  placeholder="Ej: Mantenimiento programado de servidores"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Mensaje / Contenido *
                </label>
                <textarea
                  rows={4}
                  required
                  value={editingAnnouncement.content || ''}
                  onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, content: e.target.value })}
                  placeholder="Escribe el mensaje que verán los usuarios..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Tipo de Aviso
                  </label>
                  <select
                    value={editingAnnouncement.type || 'GENERAL'}
                    onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
                  >
                    <option value="GENERAL">GENERAL (Informativo)</option>
                    <option value="IMPORTANT">IMPORTANT (Importante)</option>
                    <option value="MAINTENANCE">MAINTENANCE (Mantenimiento)</option>
                    <option value="PROMOTION">PROMOTION (Promoción)</option>
                    <option value="SECURITY">SECURITY (Seguridad)</option>
                    <option value="UPDATE">UPDATE (Actualización)</option>
                    <option value="MARQUEE">MARQUEE (Cintillo Superior Infinito)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Audiencia
                  </label>
                  <select
                    value={editingAnnouncement.targetAudience || 'ALL'}
                    onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, targetAudience: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ALL">Todos los Usuarios</option>
                    <option value="PLAYERS">Solo Jugadores</option>
                    <option value="OPERATORS">Operadores y Admins</option>
                    <option value="UNVERIFIED">Usuarios no verificados</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Fecha de Inicio
                  </label>
                  <input
                    type="datetime-local"
                    value={editingAnnouncement.startsAt || ''}
                    onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, startsAt: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Fecha de Expiración (Opcional)
                  </label>
                  <input
                    type="datetime-local"
                    value={editingAnnouncement.expiresAt || ''}
                    onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, expiresAt: e.target.value || null })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="ann-active-chk"
                  checked={editingAnnouncement.isActive ?? true}
                  onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, isActive: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-cyan-500"
                />
                <label htmlFor="ann-active-chk" className="text-sm text-slate-300 font-medium cursor-pointer">
                  Anuncio activo y visible
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
                  className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-sm transition shadow-lg shadow-cyan-600/20 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar Anuncio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
