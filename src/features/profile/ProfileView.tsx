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
import { KYCRepository, type UserKYCStatus } from '../../services/repositories/KYCRepository';
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
  Loader2,
  Camera,
  Upload,
  CheckCircle2,
  Clock,
  Lock,
} from 'lucide-react';
import { CURRENT_TERMS_VERSION } from '../../data/legalDocuments';
import type { LegalDocId } from '../../types/legal';
import { MediaBanner } from '../../components/common/MediaBanner';
import { InstallPWAButton } from '../../components/common/InstallPWAButton';
import { TwoFactorSetup } from './TwoFactorSetup';

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
  const { state, user, profile, role, hasAcceptedTerms, termsRecord, isSigningIn, signInWithGoogle, signOut, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [residenceState, setResidenceState] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Estado KYC
  const [userKyc, setUserKyc] = useState<UserKYCStatus | null>(null);
  const [loadingKyc, setLoadingKyc] = useState<boolean>(false);
  const [cedulaFile, setCedulaFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [kycIdNumber, setKycIdNumber] = useState<string>('');
  const [kycFullName, setKycFullName] = useState<string>('');
  const [submittingKyc, setSubmittingKyc] = useState<boolean>(false);
  const [kycFeedback, setKycFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const [userAuditLogs, setUserAuditLogs] = useState<AuditLogEntry[]>([]);

  const isAuthenticated = state === 'authenticated' && user !== null;
  const isAdminOrOperator = role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'OPERATOR';

  const loadUserSecurity = useCallback(async () => {
    if (!user) return;
    const logs = await SecurityRepository.getUserAuditLogs(user.id, 10);
    setUserAuditLogs(logs);
  }, [user]);

  const loadKYC = useCallback(async () => {
    if (!user) return;
    setLoadingKyc(true);
    try {
      const kyc = await KYCRepository.getUserKYCStatus(user.id);
      setUserKyc(kyc);
      if (kyc?.idNumber) setKycIdNumber(kyc.idNumber);
      if (kyc?.fullLegalName) setKycFullName(kyc.fullLegalName);
    } catch {
      // ignore
    } finally {
      setLoadingKyc(false);
    }
  }, [user]);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      setResidenceState(profile.state || 'Distrito Capital');
      setBirthDate(profile.birthDate || '');
      if (!kycFullName) {
        setKycFullName(`${profile.firstName || ''} ${profile.lastName || ''}`.trim());
      }
    }
    if (user) {
      loadUserSecurity();
      loadKYC();
    }
  }, [profile, user, loadUserSecurity, loadKYC]);

  const handleSubmitKYC = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!kycIdNumber.trim()) {
      setKycFeedback({ success: false, message: 'Por favor ingresa tu número de cédula de identidad.' });
      return;
    }

    setSubmittingKyc(true);
    setKycFeedback(null);

    try {
      let docPath: string | undefined = undefined;
      let selfiePath: string | undefined = undefined;

      if (cedulaFile) {
        const upDoc = await KYCRepository.uploadKYCFile('kyc-documents', user.id, cedulaFile, 'cedula');
        if (!upDoc.success) {
          setKycFeedback({ success: false, message: 'Error al subir la cédula: ' + upDoc.error });
          setSubmittingKyc(false);
          return;
        }
        docPath = upDoc.storagePath;
      }

      if (selfieFile) {
        const upSelfie = await KYCRepository.uploadKYCFile('kyc-selfies', user.id, selfieFile, 'selfie');
        if (!upSelfie.success) {
          setKycFeedback({ success: false, message: 'Error al subir la foto selfie: ' + upSelfie.error });
          setSubmittingKyc(false);
          return;
        }
        selfiePath = upSelfie.storagePath;
      }

      const res = await KYCRepository.submitKYC({
        idNumber: kycIdNumber.trim(),
        fullLegalName: kycFullName.trim() || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || user.email || '',
        documentStoragePath: docPath,
        selfieStoragePath: selfiePath,
        verificationMethod: 'DOCUMENT_UPLOAD',
      });

      if (res.success) {
        setKycFeedback({ success: true, message: res.message || 'Solicitud de verificación KYC enviada con éxito.' });
        await loadKYC();
        await refreshProfile();
      } else {
        setKycFeedback({ success: false, message: res.error || 'Error al enviar solicitud KYC.' });
      }
    } catch (err: any) {
      setKycFeedback({ success: false, message: err.message || 'Error en el envío.' });
    } finally {
      setSubmittingKyc(false);
    }
  };

  const handleWhatsAppVerification = async () => {
    if (!user) return;
    setSubmittingKyc(true);
    setKycFeedback(null);

    try {
      const fullName = kycFullName.trim() || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || user.email || 'Usuario';
      const idNum = kycIdNumber.trim() || 'V-Pendiente';

      await KYCRepository.submitKYC({
        idNumber: idNum,
        fullLegalName: fullName,
        verificationMethod: 'WHATSAPP',
      });

      await loadKYC();

      const whatsappNumber = '584141234567';
      const msg = `Hola equipo de Soporte Raspando la Olla. Solicito la verificación de identidad (KYC) por WhatsApp para mi cuenta.\n\n📧 Correo: ${user.email}\n👤 Nombre: ${fullName}\n🪪 Cédula: ${idNum}`;
      window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`, '_blank');

      setKycFeedback({
        success: true,
        message: 'Se ha abierto WhatsApp. Envía el mensaje precargado para completar tu verificación.'
      });
    } catch (err: any) {
      setKycFeedback({ success: false, message: err.message || 'Error al iniciar verificación por WhatsApp.' });
    } finally {
      setSubmittingKyc(false);
    }
  };

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
          disabled={isSigningIn}
          leftIcon={isSigningIn ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : undefined}
          className="w-full font-semibold shadow-md shadow-amber-950/40"
        >
          {isSigningIn ? 'Conectando con Google...' : 'Continuar con Google'}
        </Button>
      </div>
    );
  }

  return (
    <div id="profile-view" className="space-y-8 max-w-4xl mx-auto">
      {/* Zona Publicitaria del Perfil */}
      <MediaBanner location="PROFILE" />

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

      {/* Botón de Instalación de la Aplicación PWA */}
      <InstallPWAButton variant="profile" />

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
            <TwoFactorSetup
              isMfaEnabled={profile?.twoFactorEnabled}
              onStatusChange={refreshProfile}
            />

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

      {/* 🔐 VERIFICACIÓN DE IDENTIDAD (KYC) */}
      {isAdminOrOperator ? (
        <Card
          id="card-kyc-verification-admin"
          header={
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>🔐 Estatus KYC — Perfil Técnico de Plataforma</span>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-emerald-300 text-sm">KYC Validado de Forma Permanente</h3>
                <p className="text-slate-300 mt-1 leading-relaxed text-xs">
                  Tu usuario cuenta con rol de <strong className="text-emerald-400 uppercase">{role}</strong>. De acuerdo con las políticas de operación interna y auditoría de la plataforma, las cuentas administrativas y operativas se consideran validadas y exentas del proceso KYC de jugador.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 text-xs flex items-center justify-between">
              <span>Restricción de Retiros de Fondos:</span>
              <span className="font-semibold text-amber-400 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> Retiros Deshabilitados
              </span>
            </div>
          </div>
        </Card>
      ) : (
        <Card
          id="card-kyc-verification-player"
          header={
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>🔐 VERIFICACIÓN DE IDENTIDAD (KYC)</span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase ${
                  userKyc?.status === 'APPROVED' || profile?.identityVerificationStatus === 'approved' || profile?.accountStatus === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : userKyc?.status === 'PENDING' || userKyc?.status === 'UNDER_REVIEW'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : userKyc?.status === 'NEEDS_MORE_INFORMATION'
                    ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                    : userKyc?.status === 'REJECTED'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {userKyc?.status === 'APPROVED' || profile?.identityVerificationStatus === 'approved'
                  ? '✓ Aprobado'
                  : userKyc?.status === 'PENDING' || userKyc?.status === 'UNDER_REVIEW'
                  ? '⏳ En Revisión'
                  : userKyc?.status === 'NEEDS_MORE_INFORMATION'
                  ? '⚠️ Documentos Requeridos'
                  : userKyc?.status === 'REJECTED'
                  ? '✕ Rechazado'
                  : '⚪ No Verificado'}
              </span>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            {kycFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  kycFeedback.success
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                }`}
              >
                <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{kycFeedback.message}</span>
              </div>
            )}

            {userKyc?.status === 'APPROVED' || profile?.identityVerificationStatus === 'approved' ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2 text-emerald-300">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Identidad Verificada Correctamente</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-xs">
                  Tu cuenta cumple con todos los requisitos de verificación de identidad. Puedes realizar retiros de tus fondos sin limitaciones.
                </p>
              </div>
            ) : (
              <>
                {userKyc?.status === 'PENDING' || userKyc?.status === 'UNDER_REVIEW' ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-amber-300">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <Clock className="w-5 h-5 text-amber-400" />
                      <span>Verificación en Proceso</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed text-xs">
                      Tu solicitud fue enviada el{' '}
                      <strong className="text-amber-300">
                        {userKyc.submittedAt ? new Date(userKyc.submittedAt).toLocaleDateString('es-VE') : 'recientemente'}
                      </strong>{' '}
                      y está siendo revisada por nuestro equipo de operadores. Te notificaremos al ser procesada.
                    </p>
                    {userKyc.verificationMethod === 'WHATSAPP' && (
                      <p className="text-xs text-amber-400 font-semibold">
                        Método seleccionado: Solicitud vía WhatsApp
                      </p>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleSubmitKYC} className="space-y-4">
                    {userKyc?.status === 'REJECTED' && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 space-y-1">
                        <span className="font-bold block text-xs">Tu solicitud anterior fue rechazada</span>
                        {userKyc.reviewerNotes && (
                          <p className="text-xs text-rose-200 italic">Observaciones del operador: "{userKyc.reviewerNotes}"</p>
                        )}
                        <p className="text-[11px] text-slate-300">Por favor vuelve a subir tus documentos corregidos.</p>
                      </div>
                    )}

                    {userKyc?.status === 'NEEDS_MORE_INFORMATION' && (
                      <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl text-orange-300 space-y-1">
                        <span className="font-bold block text-xs">Documentos adicionales requeridos</span>
                        {userKyc.reviewerNotes && (
                          <p className="text-xs text-orange-200 italic">Indicación del equipo: "{userKyc.reviewerNotes}"</p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-slate-300 mb-1">Cédula de Identidad (V/E)</label>
                        <input
                          type="text"
                          value={kycIdNumber}
                          onChange={(e) => setKycIdNumber(e.target.value)}
                          placeholder="Ej. V-12345678"
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-slate-300 mb-1">Nombre Completo Legal</label>
                        <input
                          type="text"
                          value={kycFullName}
                          onChange={(e) => setKycFullName(e.target.value)}
                          placeholder="Nombre y Apellido según Cédula"
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <label className="block font-medium text-slate-200 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-emerald-400" />
                          <span>🪪 Documento de Cédula</span>
                        </label>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => setCedulaFile(e.target.files?.[0] || null)}
                          className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                        />
                        <p className="text-[10px] text-slate-500">Formato JPG, PNG o PDF (Máx. 10MB)</p>
                      </div>

                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <label className="block font-medium text-slate-200 flex items-center gap-1.5">
                          <Camera className="w-4 h-4 text-sky-400" />
                          <span>🤳 Foto de tu Cara / Selfie</span>
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          capture="user"
                          onChange={(e) => setSelfieFile(e.target.files?.[0] || null)}
                          className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                        />
                        <p className="text-[10px] text-slate-500">Fotografía legible mostrando tu rostro claro</p>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                      🔒 <strong>Privacidad:</strong> Tus documentos se utilizan exclusivamente para validar tu identidad según las normas de cumplimiento de la plataforma.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={submittingKyc}
                        leftIcon={submittingKyc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        className="flex-1 font-semibold"
                      >
                        {submittingKyc ? 'Enviando...' : 'Enviar Documentación Digital'}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleWhatsAppVerification}
                        disabled={submittingKyc}
                        className="flex-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 font-semibold"
                      >
                        📱 Verificar por WhatsApp
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </Card>
      )}

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
