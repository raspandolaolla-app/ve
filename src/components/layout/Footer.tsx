// ==============================================================================
// RASPANDO LA OLLA — PIE DE PÁGINA (FOOTER) OPTIMIZADO Y COMPACTO
// Diseño Responsive Mobile-First • Centralizado • Jerarquía Visual Limpia
// ==============================================================================

import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Scale,
  CreditCard,
  FileText,
  HelpCircle,
  Headphones,
  ExternalLink,
  ChevronDown,
  Info,
  CheckCircle2,
  BookOpen,
  HeartHandshake,
} from 'lucide-react';
import type { LegalDocId } from '../../types/legal';

interface FooterProps {
  onOpenLegalDoc?: (docId: LegalDocId) => void;
  onOpenSupport?: () => void;
  onNavigateFAQ?: () => void;
  onOpenRules?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenLegalDoc,
  onOpenSupport,
  onNavigateFAQ,
  onOpenRules,
}) => {
  const [mobileSecurityOpen, setMobileSecurityOpen] = useState<boolean>(false);

  return (
    <footer
      id="app-main-footer"
      className="w-full bg-[#080B12] border-t border-[#1E2938] text-[#94A3B8] pb-28 sm:pb-12 pt-6 sm:pt-10 transition-colors"
      role="contentinfo"
      aria-label="Pie de página de la aplicación"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

        {/* =====================================================================
            VISTA MÓVIL (< 768px): COMPACTA, JERÁRQUICA Y SIN SCROLL INTERMINABLE
           ===================================================================== */}
        <div className="block md:hidden space-y-4">
          {/* Identidad de Marca Compacta */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <span className="text-xl select-none">🔥</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black tracking-wider text-white uppercase">
                    Raspando La Olla
                  </span>
                  <span className="text-[10px]">🇻🇪</span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium">
                  Desarrollado por <span className="text-slate-300 font-bold">PulsoPLAY</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>100% Auditado</span>
            </div>
          </div>

          {/* Menú de Botones Compactos de Navegación Rápida */}
          <div className="grid grid-cols-2 gap-2">
            {/* 1. Preguntas Frecuentes */}
            <button
              type="button"
              id="mobile-footer-faq-btn"
              onClick={() => {
                if (onNavigateFAQ) {
                  onNavigateFAQ();
                } else {
                  const el = document.getElementById('lobby-faq-section');
                  el?.scrollIntoView({ behavior: 'smooth' });
                  window.dispatchEvent(new CustomEvent('open-faq'));
                }
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-[#111722] border border-slate-800/90 text-left text-xs font-bold text-slate-200 hover:text-white hover:border-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate">Preguntas Frecuentes</span>
            </button>

            {/* 2. Ayuda y Soporte */}
            <button
              type="button"
              id="mobile-footer-support-btn"
              onClick={() => {
                if (onOpenSupport) {
                  onOpenSupport();
                } else {
                  window.dispatchEvent(new CustomEvent('navigate-tab', { detail: { tab: 'support' } }));
                }
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-[#111722] border border-slate-800/90 text-left text-xs font-bold text-slate-200 hover:text-white hover:border-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <Headphones className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Ayuda y Soporte</span>
            </button>

            {/* 3. Información Legal */}
            <button
              type="button"
              id="mobile-footer-legal-btn"
              onClick={() => onOpenLegalDoc?.('terms')}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-[#111722] border border-slate-800/90 text-left text-xs font-bold text-slate-200 hover:text-white hover:border-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <FileText className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="truncate">Información Legal</span>
            </button>

            {/* 4. Privacidad */}
            <button
              type="button"
              id="mobile-footer-privacy-btn"
              onClick={() => onOpenLegalDoc?.('privacy')}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-[#111722] border border-slate-800/90 text-left text-xs font-bold text-slate-200 hover:text-white hover:border-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate">Privacidad y Datos</span>
            </button>
          </div>

          {/* 5. Botón Desplegable de Seguridad y Garantías */}
          <div className="rounded-xl border border-slate-800/80 bg-[#0E1420] overflow-hidden">
            <button
              type="button"
              id="mobile-footer-security-toggle"
              onClick={() => setMobileSecurityOpen((prev) => !prev)}
              className="w-full p-2.5 flex items-center justify-between gap-2 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
              aria-expanded={mobileSecurityOpen}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Garantías de Seguridad & Libro Mayor</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  mobileSecurityOpen ? 'rotate-180 text-emerald-400' : ''
                }`}
              />
            </button>

            {mobileSecurityOpen && (
              <div className="px-3 pb-3 pt-1 space-y-2 text-[11px] text-slate-300 border-t border-slate-800/60 animate-in fade-in duration-150">
                <div className="flex items-start gap-2">
                  <Scale className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Regla 90/10 Transparente:</strong> 90% para el ganador de la mesa y 10% de tarifa operativa comunitaria.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Mayores de 18 & KYC:</strong> Verificación estricta de cédula y mayoría de edad para retiro directo de fondos.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Cifrado SSL & Ledger Inmutable:</strong> Registro contable segregado por partida con trazabilidad garantizada.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CreditCard className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Moneda Oficial:</strong> Operaciones y liquidaciones bancarias exclusivas en Bolívares (Bs.).
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Enlaces Rápidos de Juego Responsable y Reglas */}
          <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 pt-1">
            <button
              type="button"
              onClick={() => onOpenLegalDoc?.('rules')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Reglas de Juego
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => onOpenLegalDoc?.('responsible_gaming')}
              className="hover:text-amber-400 transition-colors cursor-pointer"
            >
              Juego Responsable (+18)
            </button>
          </div>

          {/* Copyright Móvil */}
          <div className="text-center text-[10px] text-slate-400 pt-1 space-y-1">
            <p>© 2026 PulsoPLAY. Todos los derechos reservados.</p>
            <p className="text-slate-400">Juegos tradicionales multijugador para Venezuela 🇻🇪</p>
          </div>
        </div>

        {/* =====================================================================
            VISTA ESCRITORIO / TABLET (>= 768px): DISEÑO AMPLIO Y ROBUSTO
           ===================================================================== */}
        <div className="hidden md:block space-y-8">
          {/* Fila Principal: 3 Columnas Amplias */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-8 border-b border-[#1E2938]">
            {/* Columna 1: Identidad y PulsoPLAY */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl select-none">🔥</span>
                <span className="text-base font-black tracking-wider text-white uppercase">
                  Raspando La Olla
                </span>
                <span className="text-sm">🇻🇪</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Plataforma interactiva multijugador con los juegos tradicionales venezolanos más queridos (Dominó, Truco, Bingo, Polla, Atrapaíto y más). Desarrollada por <strong className="text-slate-300">PulsoPLAY</strong> con arquitectura server-authoritative y liquidaciones en Bolívares (Bs.).
              </p>
              <div className="flex items-center gap-2 pt-1 text-xs text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Servidores activos y partidas auditadas en tiempo real</span>
              </div>
            </div>

            {/* Columna 2: Garantías de la Plataforma */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                Garantías de la Plataforma
              </h3>
              <ul className="space-y-2.5 text-xs text-slate-400">
                <li className="flex items-center gap-2.5">
                  <Scale className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong className="text-slate-200">Regla 90/10:</strong> 90% para el ganador de la mesa, 10% de tarifa comunitaria.
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong className="text-slate-200">Mayores de 18 & KYC:</strong> Verificación de cédula para retiros directos.
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>
                    <strong className="text-slate-200">Seguridad de Cuentas:</strong> Autenticación protegida y sesiones cifradas.
                  </span>
                </li>
              </ul>
            </div>

            {/* Columna 3: Seguridad Financiera */}
            <div className="space-y-3 md:text-right">
              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                Seguridad Financiera
              </h3>
              <ul className="space-y-2.5 text-xs text-slate-400 md:items-end flex flex-col">
                <li className="flex items-center gap-2">
                  <span>Conexión cifrada SSL de alta seguridad</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                </li>
                <li className="flex items-center gap-2">
                  <span>Libro Mayor inmutable (Double-entry Ledger)</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                </li>
                <li className="flex items-center gap-2">
                  <span>Moneda Oficial: Bolívares (Bs.)</span>
                  <CreditCard className="w-4 h-4 text-cyan-400 shrink-0" />
                </li>
              </ul>
            </div>
          </div>

          {/* Fila Secundaria: Enlaces Legales y Centro de Ayuda */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-b border-[#1E2938] pb-6 text-xs">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <button
                type="button"
                id="footer-legal-terms"
                onClick={() => onOpenLegalDoc?.('terms')}
                className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Términos y Condiciones</span>
              </button>

              <button
                type="button"
                id="footer-legal-privacy"
                onClick={() => onOpenLegalDoc?.('privacy')}
                className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Privacidad & Datos</span>
              </button>

              <button
                type="button"
                id="footer-legal-rules"
                onClick={() => onOpenLegalDoc?.('rules')}
                className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Reglas de Juego</span>
              </button>

              <button
                type="button"
                id="footer-legal-responsible"
                onClick={() => onOpenLegalDoc?.('responsible_gaming')}
                className="text-slate-400 hover:text-amber-400 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <HeartHandshake className="w-3.5 h-3.5" />
                <span>Juego Responsable (+18)</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                id="footer-support-link"
                onClick={() => {
                  if (onOpenSupport) {
                    onOpenSupport();
                  } else {
                    window.dispatchEvent(new CustomEvent('navigate-tab', { detail: { tab: 'support' } }));
                  }
                }}
                className="text-[#2496FF] hover:text-[#60A5FA] font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>Centro de Ayuda & Soporte 24/7</span>
              </button>
            </div>
          </div>

          {/* Fila Final: Copyright y Advertencia Legal */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <p>© 2026 Raspando La Olla / PulsoPLAY. Todos los derechos reservados.</p>
            <p className="text-center sm:text-right text-slate-400 text-[11px]">
              Juego exclusivo para mayores de 18 años. Juega con responsabilidad y moderación. Hecho para Venezuela 🇻🇪
            </p>
          </div>
        </div>

      </div>
    </footer>
  );
};
