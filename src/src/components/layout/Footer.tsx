// ==============================================================================
// RASPANDO LA OLLA — PIE DE PÁGINA PROFESIONAL (RESPONSIVE)
// ==============================================================================

import React from 'react';
import { FINANCIAL_RULES } from '../../utils/constants';
import { ShieldCheck, Scale, Lock, FileText, BookOpen, HeartHandshake, Shield, Sparkles } from 'lucide-react';
import type { LegalDocId } from '../../types/legal';

interface FooterProps {
  onOpenLegalDoc?: (docId: LegalDocId) => void;
}

export function Footer({ onOpenLegalDoc }: FooterProps) {
  return (
    <footer
      id="app-footer"
      className="bg-[#080B12] border-t border-[#1E2938] py-8 text-xs text-[#94A3B8] mt-auto select-none pb-24 sm:pb-8"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Fila Principal */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-[#1E2938]">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base">🔥</span>
              <span className="font-black text-[#F8FAFC] tracking-tight text-sm uppercase">
                RASPANDO <span className="text-[#FF8A00]">LA OLLA</span>
              </span>
              <span className="text-xs">🇻🇪</span>
            </div>
            <p className="text-[#94A3B8] text-xs leading-relaxed max-w-sm">
              Plataforma interactiva multijugador con los juegos tradicionales más queridos de Venezuela, auditoría transparente y retiros instantáneos.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-bold text-[#F8FAFC] text-xs uppercase tracking-wider">
              Garantías de la Plataforma
            </span>
            <div className="flex items-center gap-2 text-[#94A3B8]">
              <Scale className="w-3.5 h-3.5 text-[#FF8A00] shrink-0" />
              <span>
                Regla {FINANCIAL_RULES.WINNER_PERCENT}/{FINANCIAL_RULES.SERVICE_FEE_PERCENT} (90% Ganador / 10% Tarifa)
              </span>
            </div>
            <div className="flex items-center gap-2 text-[#94A3B8]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#22C55E] shrink-0" />
              <span>Mayores de {FINANCIAL_RULES.MINIMUM_LEGAL_AGE} años & KYC Verificado</span>
            </div>
            <div className="flex items-center gap-2 text-[#94A3B8]">
              <Lock className="w-3.5 h-3.5 text-[#2496FF] shrink-0" />
              <span>Seguridad de Cuentas & Verificación 2FA</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 md:items-end">
            <span className="font-bold text-[#F8FAFC] text-xs uppercase tracking-wider">
              Seguridad Financiera
            </span>
            <span className="text-[#94A3B8]">Conexión Cifrada SSL de Alta Seguridad</span>
            <span className="text-[#94A3B8]">Libro Contable Auditado & Fondos Segregados</span>
            <span className="text-[#F5B942] font-mono text-[11px] font-bold">
              Moneda Oficial: Bolívares (Bs.)
            </span>
          </div>
        </div>

        {/* Enlaces Legales */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-b border-[#1E2938] pb-4 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-[#94A3B8]">
            <button
              id="footer-link-terms"
              type="button"
              onClick={() => onOpenLegalDoc?.('terms')}
              className="inline-flex items-center gap-1.5 hover:text-[#FF8A00] transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#FF8A00]" />
              <span>Términos y Condiciones</span>
            </button>
            <button
              id="footer-link-privacy"
              type="button"
              onClick={() => onOpenLegalDoc?.('privacy')}
              className="inline-flex items-center gap-1.5 hover:text-[#2496FF] transition-colors cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-[#2496FF]" />
              <span>Privacidad & Datos</span>
            </button>
            <button
              id="footer-link-rules"
              type="button"
              onClick={() => onOpenLegalDoc?.('rules')}
              className="inline-flex items-center gap-1.5 hover:text-[#F5B942] transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#F5B942]" />
              <span>Reglas de Juego</span>
            </button>
            <button
              id="footer-link-responsible-gaming"
              type="button"
              onClick={() => onOpenLegalDoc?.('responsible_gaming')}
              className="inline-flex items-center gap-1.5 hover:text-[#22C55E] transition-colors cursor-pointer"
            >
              <HeartHandshake className="w-3.5 h-3.5 text-[#22C55E]" />
              <span>Juego Responsable (+18)</span>
            </button>
          </div>
          <div className="text-[11px] text-[#94A3B8]">
            <span>Uso exclusivo para mayores de edad</span>
          </div>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-[#94A3B8] text-[11px]">
          <span>© {new Date().getFullYear()} Raspando La Olla. Todos los derechos reservados.</span>
          <span className="text-[#94A3B8]">
            Juego Responsable (+18). Hecho con orgullo para Venezuela 🇻🇪
          </span>
        </div>
      </div>
    </footer>
  );
}
