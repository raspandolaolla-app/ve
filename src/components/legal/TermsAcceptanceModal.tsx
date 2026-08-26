// ==============================================================================
// RASPANDO LA OLLA — MODAL DE ACEPTACIÓN OBLIGATORIA DE TÉRMINOS Y EDAD (+18)
// ==============================================================================
// Aparece inmediatamente tras autenticación (incluido Google Login) si el usuario
// aún no ha confirmado mayoría de edad y aceptado los Términos v1.0.
// ==============================================================================

import { useState, useId } from 'react';
import { ShieldCheck, AlertCircle, ExternalLink, LogOut, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '../common/Button';
import { TermsService } from '../../services/legal/TermsService';
import { CURRENT_TERMS_VERSION } from '../../data/legalDocuments';
import type { LegalDocId } from '../../types/legal';

interface TermsAcceptanceModalProps {
  userId: string;
  userEmail?: string | null;
  isOpen: boolean;
  onAccepted: () => void;
  onSignOut: () => void;
  onOpenLegalDoc: (docId: LegalDocId) => void;
}

export function TermsAcceptanceModal({
  userId,
  userEmail,
  isOpen,
  onAccepted,
  onSignOut,
  onOpenLegalDoc,
}: TermsAcceptanceModalProps) {
  const [isAdultChecked, setIsAdultChecked] = useState(false);
  const [isTermsChecked, setIsTermsChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const termsModalTitleId = useId();

  if (!isOpen) return null;

  const canSubmit = isAdultChecked && isTermsChecked && !isSubmitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const result = await TermsService.recordAcceptance(userId, userEmail);
      if (result.success) {
        onAccepted();
      } else {
        setErrorMsg('Ocurrió un inconveniente al registrar la aceptación. Por favor intenta de nuevo.');
      }
    } catch (err: unknown) {
      console.error('[TermsAcceptanceModal] Error registrando aceptación:', err);
      setErrorMsg('No se pudo guardar la confirmación. Verifica tu conexión.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="terms-acceptance-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby={termsModalTitleId}
    >
      <div
        id="terms-acceptance-card"
        className="bg-slate-900 border border-amber-500/30 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col"
      >
        {/* Encabezado Principal */}
        <div className="px-6 py-5 bg-gradient-to-b from-amber-950/40 to-slate-900 border-b border-slate-800 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 id={termsModalTitleId} className="text-xl font-bold text-slate-100">
            Confirmación de Mayoría de Edad y Términos
          </h2>
          <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
            Para utilizar <strong className="text-amber-400 font-semibold">RASPANDO LA OLLA</strong> debes ser mayor de 18 años y aceptar nuestros Términos y Condiciones de Uso.
          </p>
        </div>

        {/* Cuerpo con Información y Casillas */}
        <div className="p-6 space-y-5">
          {/* Banner de Naturaleza de Plataforma */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200">
              <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Plataforma de Entretenimiento y Juegos Tradicionales</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Raspando La Olla es una plataforma digital de recreación multijugador. No constituye una casa de apuestas ni entidad bancaria. Toda partida y operación opera bajo reglas de transparencia contable y juego limpio.
            </p>
          </div>

          {/* Enlaces a la Documentación */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              id="link-read-terms-modal"
              type="button"
              onClick={() => onOpenLegalDoc('terms')}
              className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 hover:underline font-medium bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20"
            >
              <span>Ver Términos y Condiciones (v{CURRENT_TERMS_VERSION})</span>
              <ExternalLink className="w-3 h-3" />
            </button>
            <button
              id="link-read-privacy-modal"
              type="button"
              onClick={() => onOpenLegalDoc('privacy')}
              className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-slate-100 hover:underline bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/50"
            >
              <span>Ver Privacidad</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {/* Casillas de Verificación Obligatorias */}
          <div className="space-y-3 pt-2">
            {/* Casilla 1: Mayoría de Edad */}
            <label
              htmlFor="chk-accept-age"
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all ${
                isAdultChecked
                  ? 'bg-amber-950/30 border-amber-500/40 text-slate-100'
                  : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <input
                id="chk-accept-age"
                type="checkbox"
                checked={isAdultChecked}
                onChange={(e) => setIsAdultChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500/40 bg-slate-900 cursor-pointer accent-amber-500"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-semibold text-slate-200 block">
                  Declaro que soy mayor de 18 años.
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Cuento con plena capacidad legal para participar en actividades de entretenimiento digital.
                </span>
              </div>
            </label>

            {/* Casilla 2: Aceptación de Términos */}
            <label
              htmlFor="chk-accept-terms"
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all ${
                isTermsChecked
                  ? 'bg-amber-950/30 border-amber-500/40 text-slate-100'
                  : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <input
                id="chk-accept-terms"
                type="checkbox"
                checked={isTermsChecked}
                onChange={(e) => setIsTermsChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500/40 bg-slate-900 cursor-pointer accent-amber-500"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-semibold text-slate-200 block">
                  He leído y acepto los Términos y Condiciones de Uso.
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Acepto las Reglas de Uso, Política de Privacidad y reconozco mi responsabilidad en el uso de la cuenta.
                </span>
              </div>
            </label>
          </div>

          {/* Mensaje de Error si ocurre */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-800/50 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Pie de Acciones */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            id="btn-decline-terms-signout"
            type="button"
            onClick={onSignOut}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-red-400 py-2 px-3 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar sesión / Cancelar</span>
          </button>

          <Button
            id="btn-confirm-accept-terms"
            variant="primary"
            size="md"
            disabled={!canSubmit}
            isLoading={isSubmitting}
            onClick={handleConfirm}
            className="w-full sm:w-auto font-semibold px-6 shadow-md shadow-amber-950/40"
            rightIcon={<CheckCircle2 className="w-4 h-4" />}
          >
            Confirmar y Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
