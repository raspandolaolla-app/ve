// ==============================================================================
// RASPANDO LA OLLA — CENTRO DE AYUDA Y PREGUNTAS FRECUENTES (FAQ)
// Jerarquía Responsive Mobile-First • Categorías Colapsables • 100% Accesible
// ==============================================================================

import React, { useState, useEffect, useId, useMemo } from 'react';
import {
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Search,
  Lock,
  Gamepad2,
  Wallet,
  Trophy,
  ShieldCheck,
  Smartphone,
  Headphones,
  Sparkles,
  CheckCircle2,
  X,
} from 'lucide-react';
import { FINANCIAL_RULES } from '../../utils/constants';

export interface FAQQuestion {
  id: string;
  question: string;
  answer: string;
  tags?: string[];
}

export interface FAQCategory {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgLight: string;
  borderLight: string;
  questions: FAQQuestion[];
}

interface FAQAccordionProps {
  onOpenSupport?: () => void;
  className?: string;
}

export const FAQ_CATEGORIES: FAQCategory[] = [
  {
    id: 'account',
    title: 'Cuenta y Acceso',
    shortTitle: 'Cuenta',
    description: 'Registro, inicio de sesión, recuperación de contraseña y 2FA',
    icon: Lock,
    color: '#2496FF',
    bgLight: 'bg-[#2496FF]/10',
    borderLight: 'border-[#2496FF]/30',
    questions: [
      {
        id: 'acc-1',
        question: '¿Cómo me registro en la plataforma?',
        answer:
          'Haz clic en "Ingresar" en la parte superior, selecciona "Continuar con Google" o usa tu correo electrónico. El sistema creará tu perfil de jugador y tu billetera personal en Bolívares (Bs.) de forma totalmente automática.',
        tags: ['registro', 'cuenta', 'google', 'correo'],
      },
      {
        id: 'acc-2',
        question: '¿Cómo recupero mi usuario o contraseña?',
        answer:
          'Si te registraste con Google, simplemente vuelve a iniciar sesión con tu cuenta. Si usaste correo y contraseña, haz clic en "Ingresar" y selecciona "¿Olvidaste tu contraseña?" para recibir un enlace seguro de restablecimiento en tu correo.',
        tags: ['contraseña', 'recuperar', 'olvido', 'acceso'],
      },
      {
        id: 'acc-3',
        question: '¿Por qué debo verificar mi identidad (KYC)?',
        answer:
          'La verificación de mayoría de edad (+18 años) y cédula de identidad protege a la comunidad contra el fraude, garantiza juego responsable y permite procesar tus solicitudes de retiro de fondos directamente a tu cuenta bancaria de manera instantánea y segura.',
        tags: ['kyc', 'cédula', 'verificación', 'seguridad', 'mayoría de edad'],
      },
    ],
  },
  {
    id: 'games',
    title: 'Juegos y Reglas',
    shortTitle: 'Juegos',
    description: 'Mesas multijugador, regla 90/10, Bingo, Polla y reconexión',
    icon: Gamepad2,
    color: '#FF8A00',
    bgLight: 'bg-[#FF8A00]/10',
    borderLight: 'border-[#FF8A00]/30',
    questions: [
      {
        id: 'game-1',
        question: '¿Cómo funcionan las mesas y la regla 90/10?',
        answer: `En cada partida multijugador con entrada en Bolívares, el ${FINANCIAL_RULES.WINNER_PERCENT}% de la olla acumulada se entrega directamente al ganador o equipo victorioso de forma transparente, mientras el ${FINANCIAL_RULES.SERVICE_FEE_PERCENT}% se retiene como tarifa de servicio y mantenimiento de la plataforma.`,
        tags: ['regla 90/10', 'mesas', 'olla', 'tarifa', 'ganador'],
      },
      {
        id: 'game-2',
        question: '¿Cómo funciona el Bingo Online y la Polla Venezolana?',
        answer:
          'El Bingo y la Polla Venezolana son sorteos auditados con generadores de números aleatorios verificables. En el Bingo compras tus cartones y juegas en salas en vivo con locución automática. En la Polla seleccionas tus 6 animalitos favoritos para los turnos Mañana (07:55 AM) y Tarde (05:55 PM) con pozo comunitario acumulado.',
        tags: ['bingo', 'polla', 'animalitos', 'sorteo', 'lotto'],
      },
      {
        id: 'game-3',
        question: '¿Qué ocurre si pierdo conexión durante una partida?',
        answer:
          '¡No te preocupes! Toda la lógica de juego se ejecuta en servidores seguros (server-authoritative). Si te desconectas temporalmente, el sistema activa una ventana de reconexión automática para que retomes tu turno y continúes jugando sin perder tu avance ni tu balance.',
        tags: ['conexión', 'internet', 'reconexión', 'partida'],
      },
    ],
  },
  {
    id: 'wallet',
    title: 'Billetera y Pagos',
    shortTitle: 'Billetera',
    description: 'Recargas en Bolívares, Pago Móvil y retiros bancarios',
    icon: Wallet,
    color: '#22C55E',
    bgLight: 'bg-[#22C55E]/10',
    borderLight: 'border-[#22C55E]/30',
    questions: [
      {
        id: 'wal-1',
        question: '¿Cómo abono fondos a mi billetera?',
        answer:
          'Ve a Billetera > Recargar. Selecciona Pago Móvil interbancario o transferencia nacional, ingresa el monto en Bolívares (Bs.), número de referencia bancaria y adjunta el comprobante. Nuestros operadores verificarán y acreditarán tus fondos rápidamente.',
        tags: ['recarga', 'abono', 'pago móvil', 'transferencia', 'saldo'],
      },
      {
        id: 'wal-2',
        question: '¿Cómo retiro mis ganancias?',
        answer:
          'Ve a Billetera > Retirar o toca el botón "Retirar" en la barra inferior. Selecciona tu cuenta de Pago Móvil registrada a tu nombre, ingresa el monto en Bolívares y confirma. Las liquidaciones son procesadas de forma rápida, segura y certificada.',
        tags: ['retiro', 'ganancias', 'banco', 'liquidación'],
      },
    ],
  },
  {
    id: 'prizes',
    title: 'Premios y Torneos',
    shortTitle: 'Torneos',
    description: 'Potes acumulados, eliminatorias y tablas clasificatorias',
    icon: Trophy,
    color: '#F5B942',
    bgLight: 'bg-[#F5B942]/10',
    borderLight: 'border-[#F5B942]/30',
    questions: [
      {
        id: 'prz-1',
        question: '¿Cómo funcionan los torneos y potes acumulados?',
        answer:
          'Los torneos y potes en vivo agrupan a múltiples jugadores en fases eliminatorias o tablas de posiciones en tiempo real. El pozo se conforma con las entradas de todos los participantes y se distribuye automáticamente al finalizar el torneo entre las mejores posiciones según la tabla de premios.',
        tags: ['torneos', 'potes', 'pozo', 'eliminatorias', 'premios'],
      },
    ],
  },
  {
    id: 'security',
    title: 'Seguridad y Confianza',
    shortTitle: 'Seguridad',
    description: 'Quiénes somos, Libro Mayor contable auditado y cifrado SSL',
    icon: ShieldCheck,
    color: '#38BDF8',
    bgLight: 'bg-[#38BDF8]/10',
    borderLight: 'border-[#38BDF8]/30',
    questions: [
      {
        id: 'sec-1',
        question: '¿Quiénes somos?',
        answer:
          'Raspando La Olla es la plataforma multijugador venezolana creada por PulsoPLAY para disfrutar de nuestros juegos tradicionales (Dominó, Truco, Polla, Bingo, Atrapaíto, Damas, La Vieja y más) en salas seguras, con reglas transparentes y partidas auditadas en tiempo real.',
        tags: ['quiénes somos', 'pulsoplay', 'venezuela', 'empresa'],
      },
      {
        id: 'sec-2',
        question: '¿Es seguro jugar en Raspando La Olla y están mis fondos protegidos?',
        answer:
          'Totalmente. Toda la lógica de juego se valida en servidores seguros para garantizar partidas limpias y sin trampas. Los fondos operan bajo un Libro Mayor contable inmutable (double-entry ledger auditado) con cifrado SSL de alta seguridad y autenticación multifactor protegida.',
        tags: ['seguridad', 'fondos', 'ledger', 'ssl', 'confianza'],
      },
    ],
  },
  {
    id: 'app',
    title: 'Aplicación y PWA',
    shortTitle: 'App / PWA',
    description: 'Instalación en pantalla de inicio, notificaciones y modo sin tiendas',
    icon: Smartphone,
    color: '#A855F7',
    bgLight: 'bg-[#A855F7]/10',
    borderLight: 'border-[#A855F7]/30',
    questions: [
      {
        id: 'app-1',
        question: '¿Cómo instalar y jugar desde el móvil como PWA?',
        answer:
          'En Android o PC con Google Chrome o Edge, presiona "Instalar aplicación" desde el menú del navegador. En iPhone (iOS Safari), toca el botón "Compartir" y selecciona "Agregar a la pantalla de inicio". Disfrutarás de experiencia a pantalla completa, arranque ultrarrápido y sin necesidad de descargas pesadas de tiendas.',
        tags: ['pwa', 'instalar', 'móvil', 'android', 'ios', 'iphone'],
      },
    ],
  },
];

export const FAQAccordion: React.FC<FAQAccordionProps> = ({
  onOpenSupport,
  className = '',
}) => {
  const sectionId = useId();
  // En móvil inicia colapsado para ocupar espacio mínimo; en pantallas mayores se puede explorar cómodamente
  const [isMainExpanded, setIsMainExpanded] = useState<boolean>(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('account');
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Escuchar evento global para expandir y enfocar el FAQ desde enlaces del Footer
  useEffect(() => {
    const handleOpenFAQ = () => {
      setIsMainExpanded(true);
    };
    window.addEventListener('open-faq', handleOpenFAQ);
    return () => window.removeEventListener('open-faq', handleOpenFAQ);
  }, []);

  // Total de preguntas disponibles
  const totalQuestions = useMemo(() => {
    return FAQ_CATEGORIES.reduce((acc, cat) => acc + cat.questions.length, 0);
  }, []);

  // Filtrado de preguntas por búsqueda en tiempo real
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return null;

    const results: { category: FAQCategory; question: FAQQuestion }[] = [];
    FAQ_CATEGORIES.forEach((cat) => {
      cat.questions.forEach((q) => {
        const matchesQ = q.question.toLowerCase().includes(query);
        const matchesA = q.answer.toLowerCase().includes(query);
        const matchesTags = q.tags?.some((t) => t.toLowerCase().includes(query));
        if (matchesQ || matchesA || matchesTags) {
          results.push({ category: cat, question: q });
        }
      });
    });
    return results;
  }, [searchQuery]);

  const toggleQuestion = (questionId: string) => {
    setOpenQuestionId((prev) => (prev === questionId ? null : questionId));
  };

  const currentCategory = useMemo(() => {
    return (
      FAQ_CATEGORIES.find((c) => c.id === activeCategoryId) || FAQ_CATEGORIES[0]
    );
  }, [activeCategoryId]);

  return (
    <div
      id="faq-accordion-section"
      className={`select-none rounded-2xl sm:rounded-3xl border border-[#1E2938] bg-[#0B0F19] overflow-hidden shadow-xl ${className}`}
    >
      {/* 1. ENCABEZADO PRINCIPAL COMPACTO (BOTÓN ACORDEÓN MAESTRO) */}
      <div className="p-3.5 sm:p-5 flex items-center justify-between gap-3 bg-[#0E1422] border-b border-[#1E2938]">
        <button
          type="button"
          id="faq-main-toggle-button"
          onClick={() => setIsMainExpanded((prev) => !prev)}
          className="flex-1 flex items-center justify-between gap-3 text-left group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A00] rounded-xl"
          aria-expanded={isMainExpanded}
          aria-controls={`faq-content-${sectionId}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#2496FF]/10 border border-[#2496FF]/30 flex items-center justify-center text-[#2496FF] shrink-0 group-hover:scale-105 transition-transform">
              <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black text-[#F8FAFC] tracking-tight group-hover:text-[#FF8A00] transition-colors truncate">
                  Preguntas Frecuentes & Centro de Ayuda
                </h2>
                <span className="hidden xs:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF8A00]/10 text-[#FF8A00] border border-[#FF8A00]/25">
                  {totalQuestions} Respuestas
                </span>
              </div>
              <p className="text-[11px] text-[#94A3B8] truncate">
                6 categorías • Reglas, cuentas, pagos, seguridad y PWA
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-bold text-slate-400 hidden sm:inline">
              {isMainExpanded ? 'Colapsar' : 'Explorar'}
            </span>
            <div
              className={`w-8 h-8 rounded-lg bg-[#171E2A] border border-[#1E2938] flex items-center justify-center text-slate-300 transition-transform duration-200 ${
                isMainExpanded ? 'rotate-180 text-[#FF8A00] border-[#FF8A00]/40' : ''
              }`}
            >
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </button>
      </div>

      {/* 2. CONTENIDO DESPLEGABLE CENTRALIZADO */}
      {isMainExpanded && (
        <div
          id={`faq-content-${sectionId}`}
          className="p-3.5 sm:p-6 space-y-4 animate-in fade-in duration-200"
        >
          {/* Barra de Búsqueda Rápida */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar pregunta o palabra clave (ej. 'recargar', '90/10', 'pwa')..."
              className="w-full pl-9 pr-9 py-2 bg-[#131926] border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#FF8A00]/50 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                title="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* VISTA A: RESULTADOS DE BÚSQUEDA DIRECTOS */}
          {searchResults !== null ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>
                  {searchResults.length === 0
                    ? 'No se encontraron resultados'
                    : `Se encontraron ${searchResults.length} pregunta(s)`}
                </span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-[#FF8A00] font-bold hover:underline"
                >
                  Ver todas las categorías
                </button>
              </div>

              {searchResults.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#111722] border border-slate-800/80 text-center space-y-2">
                  <p className="text-xs text-slate-400">
                    No encontramos respuestas para "{searchQuery}".
                  </p>
                  {onOpenSupport && (
                    <button
                      type="button"
                      onClick={onOpenSupport}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2496FF]/15 text-[#2496FF] border border-[#2496FF]/30 text-xs font-bold hover:bg-[#2496FF]/25 transition-all"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      <span>Contactar Soporte 24/7</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map(({ category, question }) => {
                    const isOpen = openQuestionId === question.id;
                    const CatIcon = category.icon;
                    return (
                      <div
                        key={question.id}
                        className={`rounded-xl border transition-all ${
                          isOpen
                            ? 'bg-[#141B26] border-[#FF8A00]/40 shadow-sm'
                            : 'bg-[#0E1420] border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleQuestion(question.id)}
                          className="w-full text-left p-3 sm:p-4 flex items-center justify-between gap-3 text-xs sm:text-sm font-bold text-[#F8FAFC] cursor-pointer"
                          aria-expanded={isOpen}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="p-1 rounded bg-slate-800 text-slate-400 shrink-0">
                              <CatIcon className="w-3.5 h-3.5" />
                            </span>
                            <span className="leading-snug">{question.question}</span>
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                              isOpen ? 'rotate-180 text-[#FF8A00]' : ''
                            }`}
                          />
                        </button>
                        {isOpen && (
                          <div className="px-3 sm:px-4 pb-3.5 pt-1 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 animate-in fade-in duration-150">
                            {question.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* VISTA B: NAVEGACIÓN AGRUPADA POR CATEGORÍAS (CENTRO DE AYUDA) */
            <div className="space-y-3">
              {/* Selector Horizontal de Categorías (Pills con Iconos) */}
              <div
                id="faq-categories-list"
                className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
                role="tablist"
                aria-label="Categorías de preguntas frecuentes"
              >
                {FAQ_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = activeCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      id={`faq-tab-${cat.id}`}
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => {
                        setActiveCategoryId(cat.id);
                        setOpenQuestionId(null);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black shadow-md shadow-amber-500/20 scale-[1.02]'
                          : 'bg-[#121824] border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-slate-950' : ''}`} />
                      <span>{cat.title}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          isSelected ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {cat.questions.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Panel de Preguntas de la Categoría Activa */}
              <div
                id={`faq-panel-${currentCategory.id}`}
                role="tabpanel"
                aria-labelledby={`faq-tab-${currentCategory.id}`}
                className="space-y-2 pt-1"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pb-1">
                  <span>{currentCategory.description}</span>
                  <span className="text-amber-400 font-bold">
                    {currentCategory.questions.length} {currentCategory.questions.length === 1 ? 'pregunta' : 'preguntas'}
                  </span>
                </div>

                <div className="space-y-2">
                  {currentCategory.questions.map((q) => {
                    const isOpen = openQuestionId === q.id;
                    return (
                      <div
                        key={q.id}
                        className={`rounded-xl border transition-all ${
                          isOpen
                            ? 'bg-[#141B26] border-[#FF8A00]/40 shadow-sm'
                            : 'bg-[#0E1420] border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleQuestion(q.id)}
                          className="w-full text-left p-3 sm:p-4 flex items-center justify-between gap-3 text-xs sm:text-sm font-bold text-[#F8FAFC] cursor-pointer"
                          aria-expanded={isOpen}
                        >
                          <span className="leading-snug">{q.question}</span>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                              isOpen ? 'rotate-180 text-[#FF8A00]' : ''
                            }`}
                          />
                        </button>

                        {isOpen && (
                          <div className="px-3 sm:px-4 pb-3.5 pt-1 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 animate-in fade-in duration-150">
                            {q.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 3. SUB-FOOTER DE ATENCIÓN DIRECTA (SOPORTE 24/7) */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-400 text-center sm:text-left">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>¿No encontraste lo que buscabas? Nuestro equipo está en línea.</span>
            </div>

            {onOpenSupport && (
              <button
                type="button"
                onClick={onOpenSupport}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 cursor-pointer active:scale-95 transition-all whitespace-nowrap"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>Atención & Soporte 24/7</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Exportar alias para compatibilidad y centralización
export const FAQSection = FAQAccordion;
