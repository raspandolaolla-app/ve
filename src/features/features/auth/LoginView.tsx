import { useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { CloudflareCaptcha } from '../../components/common/CloudflareCaptcha';
import { getOAuthRedirectUrl } from './AuthContext';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
import { Chrome, ShieldCheck } from 'lucide-react';

export const LoginView = () => {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = getSupabaseClient();

  const handleGoogleLogin = async () => {
    if (!captchaToken) {
      setError('Debes completar la verificación humana primero.');
      return;
    }

    if (!supabase) {
      setError('El servicio de autenticación no está disponible.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const redirectUrl = getOAuthRedirectUrl() || `${window.location.origin}/`;
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (authError) throw authError;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error('Error de autenticación:', err);
      setError(sanitizeUserErrorMessage(err, 'No se pudo iniciar sesión con Google. Intenta de nuevo.'));
      setIsLoading(false);
      setCaptchaToken(null); // Resetear para que vuelva a verificar
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F17] p-4">
      <div className="max-w-md w-full p-8 bg-[#131926] border border-slate-700 rounded-3xl space-y-8 shadow-2xl">
        
        {/* Encabezado */}
        <div className="text-center space-y-2">
          <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/30 shadow-inner">
            <span className="text-4xl select-none" role="img" aria-label="Venezuela">🇻🇪</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            RASPANDO LA OLLA
          </h1>
          <p className="text-slate-400 text-sm">
            La plataforma multijugador definitiva. Inicia sesión de forma segura.
          </p>
        </div>

        {/* Mensaje de Error */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-bold text-center flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4" /> {error}
          </div>
        )}

        {/* 1. VERIFICACIÓN HUMANA OBLIGATORIA */}
        <div className="flex justify-center">
          <CloudflareCaptcha 
            onVerify={(token) => {
              setCaptchaToken(token);
              setError('');
            }} 
            onExpire={() => setCaptchaToken(null)}
            size="normal"
          />
        </div>

        {/* 2. BOTÓN DE GOOGLE (Deshabilitado hasta tener el token) */}
        <button
          onClick={handleGoogleLogin}
          disabled={!captchaToken || isLoading}
          className="w-full flex items-center justify-center gap-3 py-4 bg-white hover:bg-slate-100 text-slate-950 font-black text-lg rounded-xl 
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-all shadow-lg shadow-white/5 active:scale-[0.99]"
        >
          {isLoading ? (
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-950"></span>
          ) : (
            <Chrome className="w-6 h-6 text-[#4285F4]" />
          )}
          {isLoading ? 'Redirigiendo a Google...' : 'Continuar con Google'}
        </button>
        
        <p className="text-center text-xs text-slate-500 leading-relaxed">
          Al continuar, aceptas nuestros Términos de Servicio y Políticas de Privacidad. 
          <br />Tus datos están protegidos y cifrados.
        </p>
      </div>
    </div>
  );
};
