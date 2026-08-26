// ==============================================================================
// RASPANDO LA OLLA — VISTA DE PERFIL Y SEGURIDAD (INTEGRACIÓN COMPLETA FASE 4)
// ==============================================================================
// Interfaz interactiva conectada a Supabase:
// - Consulta y actualización de datos personales (profiles)
// - Verificación de mayoría de edad (+18) y estado de cuenta
// - Consulta de registros de seguridad del usuario en audit_logs
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import type React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ProfileRepository } from '../../services/repositories/ProfileRepository';
import { SecurityRepository } from '../../services/repositories/SecurityRepository';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { maskCedula, maskPhone, formatDateVE } from '../../utils/formatters';
import { FINANCIAL_RULES } from '../../utils/constants';
import type { AuditLogEntry } from '../../types/security';
import {
  User,
  ShieldCheck,
  KeyRound,
  AlertTriangle,
  Edit2,
  Check,
  X,
  History,
  AlertCircle,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { CURRENT_TERMS_VERSION } from '../../data/legalDocuments';
import type { LegalDocId } from '../../types/legal';

interface ProfileViewProps {
  onOpenLegalDoc?: (docId: LegalDocId) => void;
}

const VENEZUELA_STATES = [
  'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar',
  'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón',
  'Guárico', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta',
  'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'La Guaira', 'Yaracuy', 'Zulia'
];

export function ProfileView({ onOpenLegalDoc }: ProfileViewProps) {
  const { state, user, profile, hasAcceptedTerms, termsRecord, signInWithGoogle, signOut, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [residenceState, setResidenceState] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const [userAuditLogs, setUserAuditLogs] = useState<AuditLogEntry[]>([]);

  const isAuthenticated = state === 'authenticated' && user !== null;

  const loadUserSecurity = useCallback(async () => {
    if (!user) return;
    const logs = await SecurityRepository.getUserAuditLogs(user.id, 10);
    setUserAuditLogs(logs);
  }, [user]);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      setResidenceState(profile.state || 'Distrito Capital');
      setBirthDate(profile.birthDate || '');
    }
    if (user) {
      loadUserSecurity();
    }
  }, [profile, user, loadUserSecurity]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setFeedback(null);

    try {
      const ok = await ProfileRepository.updateProfile(user.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        state: residenceState,
        birthDate: birthDate || undefined,
      });

      if (ok) {
        setFeedback({ success: true, message: 'Perfil actualizado correctamente.' });
        setEditing(false);
        await refreshProfile();
      } else {
        setFeedback({ success: false, message: 'No se pudo guardar la información del perfil. Inténtalo nuevamente.' });
      }
    } catch (err: any) {
      setFeedback({ success: false, message: err.message || 'Error al guardar.' });
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div id="profile-unauthenticated" className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-amber-400">
          <User className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">Mi Perfil</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Inicia sesión para gestionar tus datos personales, verificación de identidad y seguridad de cuenta.
        </p>
        <Button
          id="profile-signin-btn"
          variant="primary"
          onClick={signInWithGoogle}
          className="w-full font-semibold shadow-md shadow-amber-950/40"
        >
          Continuar con Google
        </Button>
      </div>
    );
  }

  return (
    <div id="profile-view" className="space-y-8 max-w-4xl mx-auto">
      {/* Encabezado del Perfil */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xl font-black">
            {profile?.firstName?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-100">
              {profile?.firstName ? `${profile.firstName} ${profile.lastName}` : user.email?.split('@')[0]}
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!editing && (
            <Button
              id="btn-edit-profile"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              leftIcon={<Edit2 className="w-3.5 h-3.5" />}
            >
              Editar Datos
            </Button>
          )}
          <Button id="profile-signout-btn" variant="secondary" size="sm" onClick={signOut}>
            Cerrar Sesión
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-2xl border text-xs flex items-start gap-2 ${
            feedback.success
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-red-950/40 border-red-800/60 text-red-300'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Información Personal */}
        <Card
          id="card-personal-info"
          header={
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-slate-200">Datos Personales</span>
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                Protegido y Encriptado
              </span>
            </div>
          }
        >
          {editing ? (
            <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Nombre</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Apellido</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Estado de Residencia</label>
                <select
                  value={residenceState}
                  onChange={(e) => setResidenceState(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  {VENEZUELA_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Fecha de Nacimiento</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  <Check className="w-3.5 h-3.5 mr-1" /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Cédula de Identidad</span>
                <span className="font-mono font-medium text-slate-200">
                  {profile?.cedulaMasked ? maskCedula(profile.cedulaMasked) : 'Pendiente registro'}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Teléfono Móvil</span>
                <span className="font-mono font-medium text-slate-200">
                  {profile?.phoneMasked ? maskPhone(profile.phoneMasked) : 'Pendiente registro'}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Estado de Residencia</span>
                <span className="font-medium text-slate-200">{profile?.state || 'Venezuela'}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Fecha de Nacimiento</span>
                <span className="font-mono font-medium text-slate-200">
                  {profile?.birthDate ? formatDateVE(profile.birthDate) : 'No configurada'}
                </span>
              </div>

              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">Mayoría de Edad (+{FINANCIAL_RULES.MINIMUM_LEGAL_AGE})</span>
                <span className={`font-semibold ${profile?.isAdult ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {profile?.isAdult ? 'Acreditada' : 'Pendiente de Validación'}
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Seguridad y 2FA */}
        <Card
          id="card-security-settings"
          header={
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>Seguridad de la Cuenta y 2FA</span>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Autenticación en Dos Pasos (2FA)</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                  {profile?.twoFactorEnabled ? 'Activado' : 'Desactivado'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Requerido para autorizar retiros de saldo y modificaciones de cuentas registradas.
              </p>
            </div>

            <div className="p-3 bg-amber-950/20 rounded-xl border border-amber-800/30 text-amber-300/90 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Los datos de Pago Móvil quedan vinculados de forma confidencial y protegida a tu cuenta.
              </span>
            </div>
          </div>
        </Card>

        {/* Términos y Cumplimiento Legal */}
        <Card
          id="card-legal-compliance"
          header={
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Términos y Cumplimiento Legal</span>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="space-y-2">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Términos de Uso</span>
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Versión {CURRENT_TERMS_VERSION} {hasAcceptedTerms ? 'Aceptada' : 'Pendiente'}</span>
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Declaración +18 Años</span>
                <span className="font-semibold text-emerald-400">
                  {hasAcceptedTerms || profile?.isAdult ? 'Confirmada' : 'Pendiente'}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Registro de Aceptación</span>
                <span className="font-mono text-[11px] text-slate-300">
                  {termsRecord?.acceptedAt
                    ? new Date(termsRecord.acceptedAt).toLocaleString('es-VE')
                    : 'Registrado en sesión'}
                </span>
              </div>
            </div>

            <Button
              id="btn-profile-view-legal"
              variant="outline"
              size="sm"
              className="w-full justify-center"
              onClick={() => onOpenLegalDoc?.('terms')}
              rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              Consultar Documentos Legales y Políticas
            </Button>
          </div>
        </Card>
      </div>

      {/* Historial de Seguridad Personal */}
      <Card
        id="card-user-security-history"
        header={
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <History className="w-4 h-4 text-amber-400" />
            <span>Registro de Actividad de la Cuenta</span>
          </div>
        }
      >
        {userAuditLogs.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-xs">
            No se registran alertas de seguridad en tu cuenta.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 text-xs">
            {userAuditLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200">{log.action}</span>
                  <div className="text-[10px] text-slate-500 font-medium">Operación verificada</div>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(log.timestamp).toLocaleString('es-VE')}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
