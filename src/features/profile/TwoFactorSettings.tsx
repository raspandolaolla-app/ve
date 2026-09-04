// ==============================================================================
// RASPANDO LA OLLA — PANEL DE CONFIGURACIÓN 2FA (TOTP + RECOVERY CODES)
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { TwoFactorRepository, type TwoFactorStatus, type TwoFactorSecret } from '../../services/repositories/TwoFactorRepository';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  QrCode,
  Copy,
  Check,
  Download,
  RefreshCw,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

interface TwoFactorSettingsProps {
  userRole?: string;
  onStatusChange?: () => void;
}

export function TwoFactorSettings({ userRole, onStatusChange }: TwoFactorSettingsProps) {
  const [status, setStatus] = useState<TwoFactorStatus>({ isEnabled: false, hasSecret: false, isLocked: false });
  const [loading, setLoading] = useState(true);

  // Estados de activación
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [secretData, setSecretData] = useState<TwoFactorSecret | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Códigos de recuperación recién generados
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Desactivación
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  // Regenerar códigos
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenCode, setRegenCode] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  const isAdminOrOperator = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'OPERATOR';

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const st = await TwoFactorRepository.get2FAStatus();
    setStatus(st);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Iniciar configuración 2FA
  const handleStartSetup = async () => {
    setSetupError(null);
    setSetupLoading(true);
    const res = await TwoFactorRepository.generateTOTPSecret();
    if (res) {
      setSecretData(res);
      setIsSettingUp(true);
    } else {
      setSetupError('No fue posible generar la clave de seguridad. Intente nuevamente.');
    }
    setSetupLoading(false);
  };

  // Confirmar y Activar 2FA
  const handleConfirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupCode.trim()) return;

    setSetupLoading(true);
    setSetupError(null);

    const res = await TwoFactorRepository.enable2FA(setupCode);
    if (res.success) {
      setNewRecoveryCodes(res.recoveryCodes || []);
      setIsSettingUp(false);
      setSetupCode('');
      setSecretData(null);
      await loadStatus();
      if (onStatusChange) onStatusChange();
    } else {
      setSetupError(res.error || 'Código incorrecto. Verifica la hora de tu dispositivo e intenta de nuevo.');
    }
    setSetupLoading(false);
  };

  // Desactivar 2FA
  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableCode.trim()) return;

    setDisableLoading(true);
    setDisableError(null);

    const res = await TwoFactorRepository.disable2FA(disableCode);
    if (res.success) {
      setIsDisabling(false);
      setDisableCode('');
      await loadStatus();
      if (onStatusChange) onStatusChange();
    } else {
      setDisableError(res.error || 'Código incorrecto o inválido.');
    }
    setDisableLoading(false);
  };

  // Regenerar códigos de recuperación
  const handleRegenerateCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regenCode.trim()) return;

    setRegenLoading(true);
    setRegenError(null);

    const res = await TwoFactorRepository.regenerateRecoveryCodes(regenCode);
    if (res.success) {
      setNewRecoveryCodes(res.recoveryCodes || []);
      setIsRegenerating(false);
      setRegenCode('');
    } else {
      setRegenError(res.error || 'Código 2FA incorrecto.');
    }
    setRegenLoading(false);
  };

  // Copiar clave secreta
  const handleCopySecret = () => {
    if (!secretData) return;
    navigator.clipboard.writeText(secretData.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  // Copiar códigos de recuperación
  const handleCopyRecoveryCodes = () => {
    if (!newRecoveryCodes) return;
    navigator.clipboard.writeText(newRecoveryCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  // Descargar códigos de recuperación en archivo TXT
  const handleDownloadRecoveryCodes = () => {
    if (!newRecoveryCodes) return;
    const content = `=================================================\nRASPANDO LA OLLA / PULSOPLAY - CÓDIGOS DE RECUPERACIÓN 2FA\n=================================================\n\nGuarda estos códigos en un lugar seguro.\nCada código puede usarse UNA SOLA VEZ para acceder a tu cuenta si pierdes tu dispositivo autenticador.\n\nCÓDIGOS DE RECUPERACIÓN:\n${newRecoveryCodes.join('\n')}\n\nFecha de generación: ${new Date().toLocaleString('es-VE')}\n=================================================\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codigos-recuperacion-2fa-raspando-la-olla.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Card
      id="card-2fa-settings"
      className="bg-slate-900/90 border-slate-800"
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <span>Autenticación de Dos Factores (2FA TOTP)</span>
          </div>
          {status.isEnabled ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>ACTIVADO</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>DESACTIVADO</span>
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Banner para Administradores u Operadores */}
        {isAdminOrOperator && !status.isEnabled && (
          <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-200 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block text-amber-300">Requisito Obligatorio para Administradores u Operadores</span>
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                Como usuario con priviligos administrativos, debes configurar 2FA para autorizar operaciones financieras sensibles (aprobación de retiros, cambios de saldo y asignación de roles).
              </p>
            </div>
          </div>
        )}

        {/* Muestra de bloqueo por fuerza bruta si existe */}
        {status.isLocked && (
          <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>
              La validación 2FA se encuentra temporalmente bloqueada por exceso de intentos fallidos. Intenta nuevamente después de{' '}
              {status.lockedUntil ? new Date(status.lockedUntil).toLocaleTimeString('es-VE') : 'unos minutos'}.
            </span>
          </div>
        )}

        {/* MODAL / SECCIÓN DE MOSTRAR CÓDIGOS DE RECUPERACIÓN NUEVOS */}
        {newRecoveryCodes && (
          <div className="p-4 bg-slate-950 rounded-2xl border-2 border-emerald-500/40 space-y-3 animate-in fade-in">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>Códigos de Recuperación de Emergencia</span>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">
              Guarda estos <strong className="text-amber-300">8 códigos de recuperación</strong> en un lugar seguro y privado. Si pierdes tu teléfono o aplicación autenticadora, podrás usar cualquiera de estos códigos para acceder a tu cuenta. Cada código sólo se puede usar <strong>una sola vez</strong>.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2 font-mono text-center text-xs font-bold text-amber-300 bg-slate-900 p-3 rounded-xl border border-slate-800">
              {newRecoveryCodes.map((code, idx) => (
                <div key={idx} className="p-1.5 bg-slate-950 rounded border border-slate-800/80 tracking-wider">
                  {code}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopyRecoveryCodes}
                leftIcon={copiedCodes ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              >
                {copiedCodes ? '¡Copiados!' : 'Copiar Todos'}
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleDownloadRecoveryCodes}
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                Descargar TXT
              </Button>

              <Button
                type="button"
                variant="primary"
                size="sm"
                className="ml-auto"
                onClick={() => setNewRecoveryCodes(null)}
              >
                Entendido, ya los guardé
              </Button>
            </div>
          </div>
        )}

        {/* ESTADO 1: 2FA NO ACTIVADO Y NO EN SETUP */}
        {!status.isEnabled && !isSettingUp && (
          <div className="space-y-3">
            <p className="text-slate-300 leading-relaxed">
              Protege tu cuenta con una capa adicional de seguridad utilizando aplicaciones como <strong>Google Authenticator</strong>, <strong>Authy</strong> o 1Password.
            </p>
            <div className="flex items-center gap-2">
              <Button
                id="btn-start-2fa-setup"
                variant="primary"
                size="sm"
                isLoading={setupLoading}
                onClick={handleStartSetup}
                leftIcon={<QrCode className="w-4 h-4" />}
              >
                Configurar Autenticación 2FA
              </Button>
            </div>
            {setupError && (
              <p className="text-red-400 text-xs flex items-center gap-1 mt-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{setupError}</span>
              </p>
            )}
          </div>
        )}

        {/* ESTADO 2: PROCESO DE SETUP (ESCANEOCÓDIGO QR / MANUAL + CONFIRMACIÓN) */}
        {!status.isEnabled && isSettingUp && secretData && (
          <div className="p-4 bg-slate-950 rounded-2xl border border-amber-500/30 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="font-bold text-slate-100 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-amber-400" />
                <span>Configuración de Autenticador (TOTP)</span>
              </h4>
              <button
                type="button"
                onClick={() => {
                  setIsSettingUp(false);
                  setSecretData(null);
                }}
                className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* Opción A: Código QR */}
              <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-slate-700 shadow-inner">
                <QRCodeSVG
                  value={secretData.qrUri}
                  size={160}
                  level="M"
                  includeMargin={false}
                />
                <span className="text-[10px] text-slate-600 font-mono mt-2">Escanea con Google Authenticator o Authy</span>
              </div>

              {/* Opción B: Clave manual */}
              <div className="space-y-2 text-xs">
                <p className="text-slate-300">
                  1. Abre tu app de autenticación (Google Authenticator, Authy, Microsoft Authenticator) y escanea el código QR.
                </p>
                <p className="text-slate-400 text-[11px]">
                  O si prefieres ingresar la clave manualmente:
                </p>

                <div className="flex items-center gap-2 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <span className="font-mono font-bold text-amber-300 text-sm tracking-wider select-all truncate">
                    {secretData.secret}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer shrink-0 ml-auto"
                    title="Copiar Clave"
                  >
                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Formulario de confirmación del código de 6 dígitos */}
            <form onSubmit={handleConfirmEnable} className="space-y-3 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  2. Ingresa el código de 6 dígitos para verificar la sincronización *
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="000000"
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-center text-lg font-mono font-bold tracking-widest text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              {setupError && (
                <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{setupError}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  id="btn-confirm-enable-2fa"
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={setupLoading}
                  disabled={!setupCode.trim() || setupCode.trim().length < 6}
                  leftIcon={<ShieldCheck className="w-4 h-4" />}
                >
                  Verificar y Activar 2FA
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ESTADO 3: 2FA ACTIVADO - OPCIONES DE GESTIÓN */}
        {status.isEnabled && (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-950/30 border border-emerald-800/50 rounded-xl text-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-bold block text-slate-100">Tu cuenta está protegida con 2FA</span>
                  <span className="text-[11px] text-slate-400">
                    Se requerirá confirmación TOTP para retiros y acciones sensibles.
                  </span>
                </div>
              </div>
            </div>

            {/* Sub-Sección: Regenerar códigos de recuperación */}
            {isRegenerating ? (
              <form onSubmit={handleRegenerateCodes} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200">Regenerar Códigos de Recuperación</span>
                  <button type="button" onClick={() => setIsRegenerating(false)} className="text-slate-400 text-xs">
                    Cancelar
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Ingresa tu código 2FA de 6 dígitos para invalidated los códigos anteriores y generar 8 nuevos códigos.
                </p>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="Código 2FA (000000)"
                  value={regenCode}
                  onChange={(e) => setRegenCode(e.target.value)}
                  className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 font-mono text-center font-bold text-slate-100 text-sm"
                />
                {regenError && <p className="text-red-400 text-xs">{regenError}</p>}
                <Button type="submit" variant="primary" size="sm" isLoading={regenLoading}>
                  Generar Nuevos Códigos
                </Button>
              </form>
            ) : isDisabling ? (
              <form onSubmit={handleDisable2FA} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-red-400">Desactivar Autenticación 2FA</span>
                  <button type="button" onClick={() => setIsDisabling(false)} className="text-slate-400 text-xs">
                    Cancelar
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Ingresa tu código TOTP actual de 6 dígitos o un código de recuperación para confirmar la desactivación.
                </p>
                <input
                  type="text"
                  required
                  maxLength={12}
                  placeholder="Código 2FA o de recuperación"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 font-mono text-center font-bold text-slate-100 text-sm"
                />
                {disableError && <p className="text-red-400 text-xs">{disableError}</p>}
                <Button type="submit" variant="danger" size="sm" isLoading={disableLoading} leftIcon={<Unlock className="w-3.5 h-3.5" />}>
                  Confirmar Desactivación
                </Button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsRegenerating(true)}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Regenerar Códigos de Recuperación
                </Button>

                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setIsDisabling(true)}
                  leftIcon={<Unlock className="w-3.5 h-3.5" />}
                >
                  Desactivar 2FA
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
