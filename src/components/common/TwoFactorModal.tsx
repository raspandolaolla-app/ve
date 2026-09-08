// ==============================================================================
// RASPANDO LA OLLA — MODAL REUTILIZABLE DE CONFIRMACIÓN 2FA TOTP
// ==============================================================================

import React, { useState } from 'react';
import { Button } from './Button';
import { ShieldCheck, Lock, AlertCircle, X, KeyRound } from 'lucide-react';

interface TwoFactorModalProps {
  isOpen: boolean;
  title?: string;
  actionDescription: React.ReactNode;
  onConfirm: (code: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
}

export function TwoFactorModal({
  isOpen,
  title = 'Confirmación de Seguridad (2FA)',
  actionDescription,
  onConfirm,
  onCancel,
  isLoading = false,
  errorMessage = null,
}: TwoFactorModalProps) {
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim();
    if (!cleanCode || cleanCode.length < 6) {
      setLocalError('Ingresa un código de autenticación válido de 6 dígitos (o código de recuperación).');
      return;
    }
    setLocalError(null);
    await onConfirm(cleanCode);
  };

  return (
    <div
      id="modal-2fa-confirmation"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl relative">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-100 text-sm">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen de la acción sensible */}
        <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
          <div className="font-semibold text-slate-200 flex items-center gap-1.5 mb-1">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Operación Sensible de Alto Riesgo</span>
          </div>
          <div className="text-slate-300 leading-relaxed">{actionDescription}</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>Código Autenticador (2FA) o de Recuperación *</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              maxLength={12}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-3 text-center text-lg font-mono font-bold tracking-widest text-slate-100 placeholder-slate-600 focus:outline-none"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Ingresa el código de 6 dígitos generado por tu app de autenticación (Google Authenticator, Authy, 1Password) o un código de recuperación.
            </p>
          </div>

          {(localError || errorMessage) && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{localError || errorMessage}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isLoading}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              disabled={!code.trim() || code.trim().length < 6}
              className="text-xs"
            >
              Confirmar y Autorizar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
