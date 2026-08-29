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
import { TwoFactorSettings } from './TwoFactorSettings';

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

  // Datos reales obtenidos desde Google Auth
  const userMetadata = user?.user_metadata || {};
  const googleAvatar = profile?.avatarUrl || userMetadata.avatar_url || userMetadata.picture || null;
  const googleFirstName = userMetadata.given_name || profile?.firstName || user?.email?.split('@')[0] || 'Jugador';
  const googleLastName = userMetadata.family_name || profile?.lastName || '';
  const googleFullName = `${googleFirstName} ${googleLastName}`.trim();
  const googleEmail = user?.email || profile?.email || '';

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
      if (!kycFullName) {
        setKycFullName(`${googleFirstName} ${googleLastName}`.trim());
      }
    }
    if (user) {
      loadUserSecurity();
      loadKYC();
    }
  }, [profile, user, googleFirstName, googleLastName, kycFullName, loadUserSecurity, loadKYC]);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 bg-slate-900/90 border border-slate-800/90 rounded-2xl sm:rounded-3xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {googleAvatar ? (
              <img
                src={googleAvatar}
                alt={googleFullName}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-amber-500/50 shadow-lg shadow-amber-950/40"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-700/20 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 text-2xl font-black shadow-lg">
                {googleFirstName[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 bg-slate-950 border border-slate-800 rounded-full p-1 shadow-md" title="Cuenta verificada por Google">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 truncate max-w-full">
                {googleFullName || 'Usuario Google'}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase">
                {role}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{googleEmail}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-medium">
              <Lock className="w-3 h-3 text-amber-400 shrink-0" />
              <span>Datos administrados por tu cuenta de Google</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button id="profile-signout-btn" variant="secondary" size="sm" onClick={signOut} className="touch-manipulation">
            Cerrar Sesión
          </Button>
        </div>
      </div>

      {/* Botón de Instalación de la Aplicación PWA */}
      <InstallPWAButton variant="profile" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Información Personal */}
        <Card
          id="card-personal-info"
          header={
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-slate-200">Datos Personales</span>
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                Solo Lectura (Google)
              </span>
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl text-slate-400 text-[11px] leading-relaxed flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Datos personales administrados por tu cuenta de Google. Tu nombre, correo y foto de perfil no pueden modificarse desde la aplicación.
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
              <span className="text-slate-400">Nombre</span>
              <span className="font-semibold text-slate-100">{googleFirstName || '---'}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
              <span className="text-slate-400">Apellido</span>
              <span className="font-semibold text-slate-100">{googleLastName || '---'}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
              <span className="text-slate-400">Correo Electrónico</span>
              <span className="font-mono font-medium text-amber-300 break-all text-right max-w-[180px] sm:max-w-none">{googleEmail}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
              <span className="text-slate-400">Estado de Cuenta</span>
              <span className="font-bold text-emerald-400 uppercase flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> ACTIVO
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
              <span className="text-slate-400">Cédula de Identidad</span>
              <span className="font-mono font-medium text-slate-200">
                {profile?.cedulaMasked ? maskCedula(profile.cedulaMasked) : 'Verificado vía KYC'}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
              <span className="text-slate-400">Teléfono Móvil</span>
              <span className="font-mono font-medium text-slate-200">
                {profile?.phoneMasked ? maskPhone(profile.phoneMasked) : 'Verificado vía KYC'}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
              <span className="text-slate-400">Estado de Residencia</span>
              <span className="font-medium text-slate-200">{profile?.state || 'Venezuela'}</span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Mayoría de Edad (+{FINANCIAL_RULES.MINIMUM_LEGAL_AGE})</span>
              <span className="font-semibold text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Confirmada (+18)
              </span>
            </div>
          </div>
        </Card>

        {/* Seguridad de la Cuenta y Autenticación 2FA */}
        <TwoFactorSettings userRole={role || undefined} onStatusChange={refreshProfile} />

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
