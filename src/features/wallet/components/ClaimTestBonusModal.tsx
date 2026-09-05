// ==============================================================================
// RASPANDO LA OLLA — COMPONENTE: RECLAMAR BONO DE PRUEBA (5.000 BS)
// ==============================================================================
// Permite al jugador activar su saldo inicial de prueba de 5.000 Bs. de forma
// atómica, idempotente y aislada contablemente bajo `source_type = 'TEST_BONUS'`.
// ==============================================================================

import { useState } from 'react';
import { Gift, Sparkles, CheckCircle2, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';
import { WalletRepository } from '../../../services/repositories/WalletRepository';

interface ClaimTestBonusModalProps {
  hasClaimed?: boolean;
  onSuccess?: () => void;
}

export function ClaimTestBonusModal({ hasClaimed = false, onSuccess }: ClaimTestBonusModalProps) {
  const [loading, setLoading] = useState(false);
  const [claimedLocal, setClaimedLocal] = useState(hasClaimed);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  if (claimedLocal) {
    return null;
  }

  const handleClaim = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      const res = await WalletRepository.claimTestBonus();
      if (res.success) {
        setClaimedLocal(true);
        setFeedback({
          success: true,
          message: res.message || '¡Bono de 5.000 Bs acreditado exitosamente en tu billetera!',
        });
        if (onSuccess) {
          onSuccess();
        }
      } else {
        if (res.error?.includes('BONO_YA_RECLAMADO')) {
          setClaimedLocal(true);
        }
        setFeedback({
          success: false,
          message: res.error || 'No se pudo reclamar el bono de prueba.',
        });
      }
    } catch (err: any) {
      setFeedback({
        success: false,
        message: err?.message || 'Error inesperado al reclamar el bono.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="test-bonus-banner"
      className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 p-4 sm:p-5 shadow-lg shadow-amber-950/20 text-slate-100"
    >
      {/* Luz ambiental sutil */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-400 shadow-inner">
            <Gift className="w-6 h-6 animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                Bono de Prueba de Bienvenida
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[10px] font-semibold text-amber-300">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  5.000,00 Bs. Gratis
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
              Recibe 5.000 Bs. de crédito de prueba inmediatamente para participar en cualquier mesa y probar el sorteo de bingo, polla y dominó sin arriesgar fondos reales.
            </p>
            <div className="flex items-center gap-2 mt-2 text-[11px] text-amber-400/90">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Contabilidad segura y aislada en libro mayor</span>
            </div>
          </div>
        </div>

        <div className="w-full sm:w-auto shrink-0 flex flex-col items-stretch sm:items-end gap-2">
          <button
            id="claim-test-bonus-btn"
            data-testid="claim-test-bonus-btn"
            onClick={handleClaim}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-amber-950/40 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                Acreditando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-slate-950" />
                Reclamar 5.000 Bs.
              </>
            )}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-3 p-3 rounded-xl border flex items-center gap-2 text-xs ${
            feedback.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {feedback.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
