// ==============================================================================
// RASPANDO LA OLLA — MODAL DE AUTENTICACIÓN PROTEGIDO CON CLOUDFLARE TURNSTILE
// ==============================================================================
// Autenticación exclusiva mediante Google OAuth con verificación humana obligatoria.
// ==============================================================================

import { useState } from 'react';
import { CloudflareCaptcha } from '../common/CloudflareCaptcha';
import { getSupabaseClient } from '../../lib/supabase/client';
import { getOAuthRedirectUrl } from '../../features/auth/AuthContext';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
import {
  X,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Chrome,
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LoginModal = ({ isOpen, onClose }: LoginModalProps) => {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const supabase = getSupabaseClient();

  const handleClose = () => {
    setError('');
    setCaptchaToken(null);
    setIsSubmitting(false);
    onClose();
  };

  const handleGoogleLogin = async () => {
    if (!captchaToken) {
      setError('Debes completar la verificación humana primero.');
      return;
    }

    if (!supabase) {
      setError('El servicio de autenticación no está disponible en este momento.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // 1. Opcional: Validar token en backend si está disponible el endpoint
      try {
        const verifyResponse = await fetch('/api/verify-captcha', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: captchaToken }),
        });
        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          if (verifyData.success === false) {
            setError('Verificación de seguridad fallida. Por favor resuelve el captcha nuevamente.');
            setIsSubmitting(false);
            setCaptchaToken(null);
            return;
          }
        }
      } catch (captchaErr) {
        // En caso de entorno offline o sin proxy server, continuar con la sesión OAuth
        console.warn('Verificación backend de captcha no disponible, continuando con client token:', captchaErr);
      }

      // 2. Iniciar sesión con Google OAuth
      const redirectUrl = getOAuthRedirectUrl() || `${window.location.origin}/`;
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (oauthError) throw oauthError;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error('Error de autenticación:', err);
      setError(sanitizeUserErrorMessage(err, 'No se pudo iniciar sesión con Google. Intenta de nuevo.'));
      setIsSubmitting(false);
      setCaptchaToken(null); // Resetear para que vuelva a verificar
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-[#131926] border border-slate-700/90 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl relative my-auto animate-in fade-in zoom-in-95">
        
        {/* BOTÓN CERRAR */}
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          aria-label="Cerrar modal de inicio de sesión"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ENCABEZADO */}
        <div className="text-center space-y-2 pt-2">
          <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-amber-500/30 shadow-inner">
            <span className="text-4xl select-none" role="img" aria-label="Venezuela">🇻🇪</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            RASPANDO LA OLLA
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm">
            La plataforma multijugador definitiva. Inicia sesión de forma segura.
          </p>
        </div>

        {/* MENSAJE DE ERROR */}
        {error && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs sm:text-sm font-bold text-center flex items-center justify-center gap-2 animate-in fade-in">
            <ShieldCheck className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* 1. VERIFICACIÓN HUMANA OBLIGATORIA PRIMERO */}
        <div className="bg-[#0B0F17]/90 border border-slate-800 p-3.5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span className="flex items-center gap-1.5 text-amber-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Verificación de Seguridad</span>
            </span>
            <span className="text-slate-500 text-[11px]">
              {captchaToken ? '✓ Verificado' : 'Requerida para continuar'}
            </span>
          </div>
          <div className="flex justify-center pt-1">
            <CloudflareCaptcha
              onVerify={(token) => {
                setCaptchaToken(token);
                setError('');
              }}
              onExpire={() => setCaptchaToken(null)}
              size="normal"
            />
          </div>
        </div>

        {/* 2. BOTÓN DE GOOGLE (Deshabilitado hasta tener el token) */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={!captchaToken || isSubmitting}
            className="w-full flex items-center justify-center gap-3 py-4 bg-white hover:bg-slate-100 text-slate-950 font-black text-base sm:text-lg rounded-2xl 
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-all shadow-lg shadow-white/5 active:scale-[0.99]"
          >
            {isSubmitting ? (
              <Loader2 className="w-6 h-6 animate-spin text-slate-950" />
            ) : (
              <Chrome className="w-6 h-6 text-[#4285F4]" />
            )}
            <span>{isSubmitting ? 'Redirigiendo a Google...' : 'Continuar con Google'}</span>
          </button>

          {!captchaToken && (
            <p className="text-center text-[11px] text-amber-400/90 font-medium">
              Completa la casilla de verificación humana para activar el acceso con Google.
            </p>
          )}
        </div>

        {/* PIE LEGAL */}
        <p className="text-center text-xs text-slate-500 leading-relaxed pt-1">
          Al continuar, aceptas nuestros Términos de Servicio y Políticas de Privacidad.
          <br />Tus datos están protegidos y cifrados.
        </p>
      </div>
    </div>
  );
};
