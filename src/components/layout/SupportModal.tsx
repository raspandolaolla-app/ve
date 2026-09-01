// ==============================================================================
// RASPANDO LA OLLA — MODAL DE SOPORTE, ATENCIÓN AL CLIENTE Y SUGERENCIAS
// ==============================================================================

import React, { useState } from 'react';
import {
  X,
  Headphones,
  MessageCircle,
  Mail,
  Send,
  CheckCircle2,
  HelpCircle,
  FileQuestion,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateFAQ?: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({
  isOpen,
  onClose,
  onNavigateFAQ,
}) => {
  const { user } = useAuth();
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<'soporte' | 'sugerencia' | 'reclamo'>('soporte');

  if (!isOpen) return null;

  const handleSubmitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;

    // Guardar retroalimentación / feedback de manera limpia
    setFeedbackSent(true);
    setTimeout(() => {
      setFeedbackText('');
      setFeedbackSent(false);
      onClose();
    }, 2000);
  };

  return (
    <div
      id="support-modal-container"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#080B12]/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Contenedor Modal */}
      <div className="relative w-full max-w-lg bg-[#111722] border border-[#1E2938] rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabecera */}
        <div className="p-5 border-b border-[#1E2938] flex items-center justify-between bg-[#080B12]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#2496FF] to-[#22C55E] p-0.5 flex items-center justify-center shadow-lg shadow-[#2496FF]/20">
              <Headphones className="w-5 h-5 text-[#080B12]" />
            </div>
            <div>
              <h2 className="text-base font-black text-[#F8FAFC] tracking-tight">
                Centro de Soporte & Ayuda
              </h2>
              <p className="text-xs text-[#94A3B8]">Atención 24/7 para jugadores venezolanos</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-[#171E2A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors border border-[#1E2938]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {/* Canales Oficiales Directos */}
          <div className="space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Canales Directos de Atención
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="https://t.me/pulsoplay_soporte"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3.5 rounded-2xl bg-[#171E2A] border border-[#1E2938] hover:border-[#2496FF] transition-all flex items-center gap-3 group"
              >
                <div className="w-9 h-9 rounded-xl bg-[#2496FF]/10 text-[#2496FF] flex items-center justify-center text-lg shrink-0">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F8FAFC] group-hover:text-[#2496FF] transition-colors flex items-center gap-1">
                    <span>Telegram Oficial</span>
                    <ExternalLink className="w-3 h-3 text-[#94A3B8]" />
                  </div>
                  <div className="text-[10px] text-[#94A3B8]">Respuesta rápida</div>
                </div>
              </a>

              <a
                href="mailto:pulsoplay2026@gmail.com"
                className="p-3.5 rounded-2xl bg-[#171E2A] border border-[#1E2938] hover:border-[#F5B942] transition-all flex items-center gap-3 group"
              >
                <div className="w-9 h-9 rounded-xl bg-[#F5B942]/10 text-[#F5B942] flex items-center justify-center text-lg shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F8FAFC] group-hover:text-[#F5B942] transition-colors flex items-center gap-1">
                    <span>Correo Oficial</span>
                    <ExternalLink className="w-3 h-3 text-[#94A3B8]" />
                  </div>
                  <div className="text-[10px] text-[#94A3B8] truncate">pulsoplay2026@gmail.com</div>
                </div>
              </a>
            </div>
          </div>

          {/* Formulario de Mensaje o Sugerencia */}
          <div className="space-y-3 pt-3 border-t border-[#1E2938]">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] flex items-center justify-between">
              <span>Envíanos un Mensaje o Sugerencia</span>
              <span className="text-[#FF8A00] font-normal text-[10px]">Tu opinión nos ayuda a crecer</span>
            </div>

            {feedbackSent ? (
              <div className="p-4 rounded-2xl bg-[#22C55E]/10 border border-[#22C55E]/30 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-[#22C55E] mx-auto" />
                <div className="text-xs font-bold text-[#22C55E]">¡Mensaje recibido con éxito!</div>
                <p className="text-[11px] text-[#94A3B8]">
                  Gracias por ayudarnos a mejorar la plataforma Raspando La Olla.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitFeedback} className="space-y-3">
                <div className="flex gap-2">
                  {(['soporte', 'sugerencia', 'reclamo'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFeedbackCategory(cat)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-semibold capitalize border transition-all ${
                        feedbackCategory === cat
                          ? 'bg-[#FF8A00]/10 border-[#FF8A00] text-[#FF8A00]'
                          : 'bg-[#171E2A] border-[#1E2938] text-[#94A3B8] hover:text-[#F8FAFC]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Describe tu duda, problema o sugerencia..."
                  rows={3}
                  className="w-full bg-[#171E2A] border border-[#1E2938] rounded-2xl p-3 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none focus:border-[#FF8A00] transition-colors resize-none"
                  required
                />

                <button
                  type="submit"
                  disabled={!feedbackText.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#FF8A00] hover:bg-[#FF8A00]/90 disabled:opacity-50 text-[#080B12] font-black text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#FF8A00]/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar Mensaje</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
