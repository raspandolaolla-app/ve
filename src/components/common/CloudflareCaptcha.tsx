import { useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { ShieldCheck, Loader2 } from 'lucide-react';

interface CloudflareCaptchaProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  size?: 'normal' | 'compact';
}

export const CloudflareCaptcha = ({ onVerify, onExpire, size = 'normal' }: CloudflareCaptchaProps) => {
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const siteKey =
    (import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ||
    '0x4AAAAAAEoI4ipaJrT8oCLk';

  if (!siteKey) {
    console.error('Falta VITE_CLOUDFLARE_TURNSTILE_SITE_KEY');
    return null;
  }

  const handleVerify = (token: string) => {
    setIsLoading(true);
    setTimeout(() => {
      setIsVerified(true);
      setIsLoading(false);
      onVerify(token);
    }, 600);
  };

  if (isVerified) {
    return (
      <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl animate-in fade-in">
        <ShieldCheck className="w-5 h-5 text-emerald-400" />
        <span className="text-emerald-400 font-bold text-sm">Verificación humana exitosa</span>
      </div>
    );
  }

  return (
    <div className="p-3 bg-[#131926] border border-slate-700 rounded-xl flex flex-col items-center gap-2">
      <span className="text-slate-400 text-xs font-medium">Verifica que eres humano:</span>
      {isLoading ? (
        <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
      ) : (
        <Turnstile
          siteKey={siteKey}
          onSuccess={handleVerify}
          onExpire={() => {
            setIsVerified(false);
            onExpire?.();
          }}
          options={{ theme: 'dark', language: 'es', size }}
        />
      )}
    </div>
  );
};
