import React, { useState, useEffect } from 'react';
import {
  FileCheck,
  CheckCircle,
  XCircle,
  Eye,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  User,
  ShieldCheck,
  ExternalLink,
  Lock,
  Camera,
  FileText
} from 'lucide-react';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import type { KYCVerificationItem } from '../../../types/admin';

export const AdminKYCTab: React.FC = () => {
  const [kycList, setKycList] = useState<KYCVerificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [search, setSearch] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal de Inspección de Documentos KYC
  const [selectedKyc, setSelectedKyc] = useState<KYCVerificationItem | null>(null);
  const [signedDocFront, setSignedDocFront] = useState<string | null>(null);
  const [signedDocBack, setSignedDocBack] = useState<string | null>(null);
  const [signedSelfie, setSignedSelfie] = useState<string | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState<string>('');
  const [processing, setProcessing] = useState<boolean>(false);

  const loadKYC = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await AdminRepository.getKYCVerificationsList(statusFilter);
      setKycList(data);
    } catch (err: any) {
      setError('Error al cargar expedientes KYC.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKYC();
  }, [statusFilter]);

  const handleOpenInspection = async (kyc: KYCVerificationItem) => {
    setSelectedKyc(kyc);
    setReviewerNotes(kyc.reviewerNotes || '');
    setSignedDocFront(null);
    setSignedDocBack(null);
    setSignedSelfie(null);

    // Obtener URLs firmadas seguras de 5 minutos
    if (kyc.documentStoragePath) {
      const url = await AdminRepository.getStorageSignedUrl('kyc-documents', kyc.documentStoragePath);
      setSignedDocFront(url);
    }
    if (kyc.documentBackStoragePath) {
      const url = await AdminRepository.getStorageSignedUrl('kyc-documents', kyc.documentBackStoragePath);
      setSignedDocBack(url);
    }
    if (kyc.selfieStoragePath) {
      const url = await AdminRepository.getStorageSignedUrl('kyc-selfies', kyc.selfieStoragePath);
      setSignedSelfie(url);
    }
  };

  const handleProcessKYC = async (status: 'APPROVED' | 'REJECTED' | 'NEEDS_MORE_INFORMATION' | 'VERIFIED_WHATSAPP') => {
    if (!selectedKyc) return;
    if (status === 'REJECTED' && !reviewerNotes.trim()) {
      alert('Debes indicar el motivo de rechazo en las notas.');
      return;
    }

    setProcessing(true);
    setError(null);
    try {
      const res = await AdminRepository.processKYCVerification(selectedKyc.id, status, reviewerNotes);
      if (res.success) {
        let msg = 'Expediente actualizado correctamente.';
        if (status === 'APPROVED') msg = 'Expediente marcado como APROBADO.';
        if (status === 'REJECTED') msg = 'Expediente marcado como RECHAZADO.';
        if (status === 'NEEDS_MORE_INFORMATION') msg = 'Se ha solicitado nueva documentación al jugador.';
        if (status === 'VERIFIED_WHATSAPP') msg = 'Expediente VERIFICADO POR WHATSAPP exitosamente.';

        setSuccessMsg(msg);
        setSelectedKyc(null);
        await loadKYC();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.error || 'Error al procesar expediente.');
      }
    } catch (err: any) {
      setError(err.message || 'Excepción al procesar.');
    } finally {
      setProcessing(false);
    }
  };

  const filtered = kycList.filter((item) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      item.userName?.toLowerCase().includes(s) ||
      item.userEmail?.toLowerCase().includes(s) ||
      item.idNumber?.toLowerCase().includes(s) ||
      item.id.toLowerCase().includes(s)
    );
  });

  return (
    <div id="admin-kyc-tab" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <FileCheck className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Validación de Identidad y Expedientes KYC</h2>
          </div>
          <p className="text-sm text-slate-400">
            Revisión oficial de cédulas de identidad venezolanas y fotografías selfie en almacenamiento encriptado.
          </p>
        </div>

        <button
          onClick={loadKYC}
          disabled={loading}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm flex items-center gap-2 border border-slate-700 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center gap-3">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, cédula o ID..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">Todos los estados</option>
            <option value="PENDING">Pendientes de Revisión</option>
            <option value="UNDER_REVIEW">En Revisión</option>
            <option value="APPROVED">Aprobados</option>
            <option value="REJECTED">Rechazados</option>
          </select>
        </div>
      </div>

      {/* Tabla de Expedientes */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold">Usuario</th>
                <th className="px-6 py-4 font-semibold">Tipo / Cédula</th>
                <th className="px-6 py-4 font-semibold">Fecha Envío</th>
                <th className="px-6 py-4 font-semibold">Estado</th>
                <th className="px-6 py-4 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                    Cargando solicitudes de verificación...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No hay solicitudes en esta categoría.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-100">{item.userName || item.fullLegalName || 'Usuario'}</div>
                      <div className="text-xs text-slate-400 font-mono">{item.userId.slice(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-semibold text-slate-200">{item.documentType}</div>
                      <div className="text-xs text-slate-400 font-mono">{item.idNumber || 'Sin cédula'}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(item.submittedAt).toLocaleString('es-VE')}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                          item.status === 'APPROVED'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : item.status === 'REJECTED'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        {item.status === 'APPROVED' && <CheckCircle className="w-3.5 h-3.5" />}
                        {item.status === 'REJECTED' && <XCircle className="w-3.5 h-3.5" />}
                        {item.status === 'PENDING' && <AlertTriangle className="w-3.5 h-3.5" />}
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleOpenInspection(item)}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border border-slate-700 transition"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        Revisar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Inspección Forense de KYC */}
      {selectedKyc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">
                    Expediente KYC: {selectedKyc.userName || selectedKyc.fullLegalName || 'Usuario'}
                  </h3>
                  <p className="text-xs text-slate-400">ID Usuario: {selectedKyc.userId}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedKyc(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Documentos del Expediente */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase text-slate-400">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    Documento de Identidad (Frontal)
                  </div>
                  {signedDocFront ? (
                    <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center">
                      <img
                        src={signedDocFront}
                        alt="Documento Frontal"
                        className="object-contain w-full h-full"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-slate-900 rounded-lg flex items-center justify-center text-xs text-slate-500">
                      Sin archivo o procesando enlace firmado...
                    </div>
                  )}
                </div>

                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase text-slate-400">
                    <Camera className="w-4 h-4 text-sky-400" />
                    Fotografía Selfie / Rostro
                  </div>
                  {signedSelfie ? (
                    <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center">
                      <img
                        src={signedSelfie}
                        alt="Selfie"
                        className="object-contain w-full h-full"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-slate-900 rounded-lg flex items-center justify-center text-xs text-slate-500">
                      Sin selfie o procesando enlace firmado...
                    </div>
                  )}
                </div>
              </div>

              {/* Información Adicional del Expediente */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Método de Solicitud</span>
                  <span className="font-semibold text-slate-200">
                    {selectedKyc.verificationMethod === 'WHATSAPP' ? '📱 WhatsApp' : '🪪 Carga de Documentos'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Fecha de Solicitud</span>
                  <span className="font-mono text-slate-300">
                    {new Date(selectedKyc.submittedAt).toLocaleDateString('es-VE')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Revisor</span>
                  <span className="font-mono text-slate-300">{selectedKyc.reviewerId ? selectedKyc.reviewerId.slice(0, 8) + '...' : 'Pendiente'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Fecha de Revisión</span>
                  <span className="font-mono text-slate-300">
                    {selectedKyc.reviewedAt ? new Date(selectedKyc.reviewedAt).toLocaleDateString('es-VE') : 'Pendiente'}
                  </span>
                </div>
              </div>

              {/* Notas del Revisor */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Notas de Revisión / Dictamen Oficial
                </label>
                <textarea
                  rows={3}
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  placeholder="Escribe observaciones o motivo en caso de rechazo o solicitud de documentos..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Acciones de Resolución */}
              <div className="pt-4 flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedKyc(null)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => handleProcessKYC('NEEDS_MORE_INFORMATION')}
                  className="px-3.5 py-2.5 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold transition disabled:opacity-50"
                >
                  Solicitar Documentos
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => handleProcessKYC('VERIFIED_WHATSAPP')}
                  className="px-3.5 py-2.5 bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-semibold transition disabled:opacity-50"
                >
                  📱 Verificado por WhatsApp
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => handleProcessKYC('REJECTED')}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Rechazar
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => handleProcessKYC('APPROVED')}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Aprobar Expediente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
