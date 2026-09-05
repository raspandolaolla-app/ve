// ==============================================================================
// RASPANDO LA OLLA — MODAL DE AUTENTICACIÓN PROTEGIDO CON CLOUDFLARE TURNSTILE
// ==============================================================================
// Verificación humana obligatoria antes de procesar inicio de sesión
// (tanto para Email/Password como para Google OAuth).
// ==============================================================================

import { useState } from 'react';
import type React from 'react';
import { CloudflareCaptcha } from '../common/CloudflareCaptcha';
import { getSupabaseClient } from '../../lib/supabase/client';
import { getOAuthRedirectUrl } from '../../features/auth/AuthContext';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
import {
  LogIn,
  Mail,
  Lock,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LoginModal = ({ isOpen, onClose, onSuccess }: LoginModalProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);

  if (!isOpen) return null;

  const supabase = getSupabaseClient();

  const handleClose = () => {
    setError('');
    setSuccessMessage('');
    setCaptchaToken(null);
    onClose();
  };

  const verifyCaptchaToken = async (): Promise<boolean> => {
    if (!captchaToken) {
      setError('Por favor, completa la verificación humana.');
      return false;
    }

    try {
      const verifyResponse = await fetch('/api/verify-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: captchaToken }),
      });

      const verifyData = await verifyResponse.json();
      if (!verifyData.success) {
        setError('Verificación de seguridad fallida. Por favor intenta de nuevo.');
        setCaptchaToken(null);
        return false;
      }

      return true;
    } catch (err: any) {
      setError(err?.message || 'Error de conexión verificando seguridad humana.');
      setCaptchaToken(null);
      return false;
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!captchaToken) {
      setError('Por favor, completa la verificación humana.');
      return;
    }

    if (!email || !password) {
      setError('Ingresa tu correo y contraseña.');
      return;
    }

    if (!supabase) {
      setError('El servicio de autenticación no está disponible.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Verificar el token en el backend
      const isHuman = await verifyCaptchaToken();
      if (!isHuman) {
        setIsSubmitting(false);
        return;
      }

      // 2. Procesar con Supabase Auth
      if (isSignUpMode) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;

        if (data?.session) {
          setSuccessMessage('¡Cuenta creada e inicio de sesión exitoso!');
          setTimeout(() => {
            handleClose();
            onSuccess?.();
          }, 1000);
        } else {
          setSuccessMessage('¡Registro exitoso! Revisa tu correo si se requiere confirmación.');
          setTimeout(() => {
            handleClose();
            onSuccess?.();
          }, 2000);
        }
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (loginError) throw loginError;

        setSuccessMessage('¡Inicio de sesión exitoso!');
        setTimeout(() => {
          handleClose();
          onSuccess?.();
        }, 800);
      }
    } catch (err: any) {
      setError(sanitizeUserErrorMessage(err, 'Error al procesar las credenciales.'));
    } finally {
      setIsSubmitting(false);
      setCaptchaToken(null);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setSuccessMessage('');

    if (!captchaToken) {
      setError('Por favor, completa la verificación humana antes de conectar con Google.');
      return;
    }

    if (!supabase) {
      setError('El servicio de autenticación no está disponible.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Verificar captcha humano en backend
      const isHuman = await verifyCaptchaToken();
      if (!isHuman) {
        setIsSubmitting(false);
        return;
      }

      // 2. Proceder con OAuth Google
      const redirectUrl = getOAuthRedirectUrl();
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
      setError(sanitizeUserErrorMessage(err, 'Error al conectar con Google.'));
      setIsSubmitting(false);
      setCaptchaToken(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#131926] border border-slate-700 rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-md w-full space-y-4 shadow-2xl relative my-auto animate-in fade-in zoom-in-95">
        {/* BOTÓN CERRAR */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          aria-label="Cerrar modal de inicio de sesión"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ENCABEZADO */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Acceso Seguro Protegido</span>
          </div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <LogIn className="w-6 h-6 text-amber-400" />
            <span>{isSignUpMode ? 'Crear Cuenta' : 'Iniciar Sesión'}</span>
          </h2>
          <p className="text-slate-400 text-xs">
            Ingresa para gestionar tus fondos, jugar en vivo y cobrar tus premios.
          </p>
        </div>

        {/* FEEDBACK NOTIFICACIONES */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-bold flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-bold flex items-start gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* FORMULARIO EMAIL Y PASSWORD */}
        <form onSubmit={handleEmailAuth} className="space-y-3.5">
          <div>
            <label className="text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-amber-400" />
              <span>Correo Electrónico</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0B0F17] border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none transition-colors"
              placeholder="tu@email.com"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Contraseña</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0B0F17] border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none transition-colors"
              placeholder="••••••••"
              required
              autoComplete={isSignUpMode ? 'new-password' : 'current-password'}
              minLength={6}
            />
          </div>

          {/* VERIFICACIÓN HUMANA OBLIGATORIA CON CLOUDFLARE TURNSTILE */}
          <div className="pt-1">
            <CloudflareCaptcha
              onVerify={(token) => {
                setCaptchaToken(token);
                setError('');
              }}
              onExpire={() => setCaptchaToken(null)}
              size="compact"
            />
          </div>

          {/* BOTÓN SUBMIT EMAIL */}
          <button
            type="submit"
            disabled={!captchaToken || isSubmitting}
            className="w-full py-3 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black rounded-xl text-sm
                       disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Verificando...</span>
              </>
            ) : (
              <span>{isSignUpMode ? 'CREAR CUENTA' : 'INGRESAR'}</span>
            )}
          </button>
        </form>

        {/* DIVISOR */}
        <div className="relative flex items-center justify-center my-2">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-[#131926] px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider absolute">
            O también
          </span>
        </div>

        {/* BOTÓN GOOGLE OAUTH */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={!captchaToken || isSubmitting}
          className="w-full py-2.5 bg-[#1A2234] hover:bg-[#20293F] border border-slate-700/80 hover:border-amber-500/40 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
            />
            <path
              fill="#FBBC05"
              d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.2-2 .4-2.8L1.9 6.3C.7 8.7 0 10.8 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
            />
          </svg>
          <span>Continuar con Google</span>
        </button>

        {/* TOGGLE ENTRE INICIAR SESIÓN Y REGISTRARSE */}
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => {
              setIsSignUpMode(!isSignUpMode);
              setError('');
              setSuccessMessage('');
            }}
            className="text-xs text-amber-400 hover:text-amber-300 font-medium underline underline-offset-2"
          >
            {isSignUpMode
              ? '¿Ya tienes cuenta? Inicia sesión aquí'
              : '¿No tienes cuenta? Regístrate con tu correo'}
          </button>
        </div>
      </div>
    </div>
  );
};
