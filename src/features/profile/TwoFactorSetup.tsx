// ==============================================================================
// RASPANDO LA OLLA — COMPONENTE CONFIGURACIÓN 2FA / TOTP (FASE A1)
// ==============================================================================
import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { SecurityRepository } from '../../services/repositories/SecurityRepository';
import { Button } from '../../components/common/Button';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Copy,
  Check,
  QrCode,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
  RefreshCw,
} from 'lucide-react';

interface TwoFactorSetupProps {
  isMfaEnabled?: boolean;
  onStatusChange?: () => void;
}

export function TwoFactorSetup({ isMfaEnabled = false, onStatusChange }: TwoFactorSetupProps) {
  const [setupMode, setSetupMode] = useState<boolean>(false);
  const [disableMode, setDisableMode] = useState<boolean>(false);
  const [secretData, setSecretData] = useState<{ secret: string; qrUri: string; email: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [totpCode, setTotpCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (secretData?.qrUri) {
      QRCode.toDataURL(secretData.qrUri, {
        width: 200,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('[TwoFactorSetup] Error generando QR:', err));
    }
  }, [secretData]);

  const handleStartSetup = async () => {
    setLoading(true);
    setFeedback(null);
    setTotpCode('');
    const data = await SecurityRepository.generateTotpSecret();
    setLoading(false);
    if (data) {
      setSecretData(data);
      setSetupMode(true);
    } else {
      setFeedback({
        success: false,
        message: 'No se pudo generar el secreto 2FA. Reintenta más tarde.',
      });
    }
  };

  const handleCopySecret = () => {
    if (!secretData?.secret) return;
    navigator.clipboard.writeText(secretData.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.length !== 6) {
      setFeedback({ success: false, message: 'Ingresa un código de 6 dígitos válido.' });
      return;
    }

    setLoading(true);
    setFeedback(null);

    const res = await SecurityRepository.enable2FA(totpCode);
    setLoading(false);

    if (res.success) {
      setFeedback({ success: true, message: res.message });
      setSetupMode(false);
      setSecretData(null);
      setTotpCode('');
      if (onStatusChange) onStatusChange();
    } else {
      setFeedback({ success: false, message: res.message });
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.length !== 6) {
      setFeedback({ success: false, message: 'Ingresa el código 2FA de 6 dígitos para confirmar.' });
      return;
    }

    setLoading(true);
    setFeedback(null);

    const res = await SecurityRepository.disable2FA(totpCode);
    setLoading(false);

    if (res.success) {
      setFeedback({ success: true, message: res.message });
      setDisableMode(false);
      setTotpCode('');
      if (onStatusChange) onStatusChange();
    } else {
      setFeedback({ success: false, message: res.message });
    }
  };

  return (
    <div className="space-y-4">
      {/* Estado Actual */}
      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isMfaEnabled ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            )}
            <div>
              <h4 className="text-xs font-semibold text-slate-200">
                Autenticación en Dos Pasos (2FA TOTP)
              </h4>
              <p className="text-[11px] text-slate-400">
                Protección mediante Google Authenticator / Authy para retiros y seguridad de la cuenta.
              </p>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              isMfaEnabled
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                : 'bg-amber-950/60 text-amber-400 border-amber-800/50'
            }`}
          >
            {isMfaEnabled ? 'Activado' : 'Desactivado'}
          </span>
        </div>

        {!isMfaEnabled && !setupMode && (
          <Button
            onClick={handleStartSetup}
            disabled={loading}
            className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            <span>Activar Autenticación 2FA (TOTP)</span>
          </Button>
        )}

        {isMfaEnabled && !disableMode && (
          <Button
            onClick={() => {
              setDisableMode(true);
              setFeedback(null);
              setTotpCode('');
            }}
            variant="outline"
            className="w-full py-2 text-rose-400 border-rose-950 hover:bg-rose-950/30 text-xs rounded-lg flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            <span>Desactivar 2FA</span>
          </Button>
        )}
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
            feedback.success
              ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/50 text-rose-300'
          }`}
        >
          {feedback.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Modal / Panel de Configuración Activa (Setup) */}
      {setupMode && secretData && (
        <form onSubmit={handleEnable2FA} className="p-4 bg-slate-900/90 rounded-xl border border-amber-500/40 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" />
              <span>Paso 1: Escanea el código QR en tu App Authenticator</span>
            </h4>
            <button
              type="button"
              onClick={() => {
                setSetupMode(false);
                setSecretData(null);
              }}
              className="text-slate-400 hover:text-slate-200 text-xs"
            >
              Cancelar
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-950 p-3 rounded-xl border border-slate-800">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Código QR 2FA" className="w-36 h-36 rounded-lg bg-white p-1" />
            ) : (
              <div className="w-36 h-36 rounded-lg bg-slate-900 flex items-center justify-center text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}
            <div className="space-y-2 text-center sm:text-left flex-1">
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Escanea este código con <strong>Google Authenticator</strong>, <strong>Authy</strong> o <strong>1Password</strong>.
              </p>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  O ingresa esta clave manualmente:
                </span>
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <code className="text-xs font-mono font-bold text-amber-300 bg-slate-900 px-2 py-1 rounded border border-slate-800 select-all">
                    {secretData.secret}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="p-1 text-slate-400 hover:text-amber-400 transition"
                    title="Copiar Clave"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="text-xs font-semibold text-slate-200 block">
              Paso 2: Ingresa el código de 6 dígitos generado por tu app:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-center font-mono text-lg tracking-widest text-amber-400 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>Verificar y Activar 2FA</span>
            </Button>
          </div>
        </form>
      )}

      {/* Modal / Formulario de Desactivación */}
      {disableMode && (
        <form onSubmit={handleDisable2FA} className="p-4 bg-rose-950/20 rounded-xl border border-rose-900/50 space-y-3">
          <div className="flex items-center justify-between border-b border-rose-900/40 pb-2">
            <h4 className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
              <Lock className="w-4 h-4" />
              <span>Confirmar Desactivación de 2FA</span>
            </h4>
            <button
              type="button"
              onClick={() => setDisableMode(false)}
              className="text-slate-400 hover:text-slate-200 text-xs"
            >
              Cancelar
            </button>
          </div>

          <p className="text-[11px] text-slate-300">
            Ingresa tu código TOTP de 6 dígitos actual para autorizar la desactivación del 2FA.
          </p>

          <input
            type="text"
            maxLength={6}
            placeholder="000000"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
            className="w-full bg-slate-950 border border-rose-900/60 rounded-lg px-3 py-2 text-center font-mono text-lg tracking-widest text-rose-300 focus:outline-none focus:border-rose-500"
          />

          <Button
            type="submit"
            disabled={loading || totpCode.length !== 6}
            className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            <span>Confirmar Desactivación</span>
          </Button>
        </form>
      )}
    </div>
  );
}
