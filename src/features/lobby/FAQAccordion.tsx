// ==============================================================================
// RASPANDO LA OLLA — ACORDEÓN DE PREGUNTAS FRECUENTES (FAQ)
// ==============================================================================

import React, { useState } from 'react';
import { ChevronDown, HelpCircle, ShieldCheck, Scale, Zap } from 'lucide-react';
import { FINANCIAL_RULES } from '../../utils/constants';

interface FAQItem {
  question: string;
  answer: string;
}

export const FAQAccordion: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FAQItem[] = [
    {
      question: '¿Quiénes somos?',
      answer:
        'Raspando La Olla es la plataforma multijugador venezolana creada para disfrutar de nuestros juegos tradicionales (Dominó, Truco, Polla, Bingo, Atrapaíto, Damas, La Vieja y más) en salas seguras y con partidas auditadas en tiempo real.',
    },
    {
      question: '¿Es seguro jugar en Raspando La Olla?',
      answer:
        'Totalmente. Toda la lógica de juego se valida en servidores seguros mediante arquitectura server-authoritative, evitando trampas. Los fondos se mantienen bajo libros contables auditados (double-entry ledger) con soporte de autenticación protegida.',
    },
    {
      question: '¿Por qué debo verificar mi identidad (KYC)?',
      answer:
        'La verificación de mayoría de edad (+18 años) y de cédula de identidad protege la comunidad contra el fraude, garantiza juego responsable y permite procesar tus solicitudes de retiro de fondos directamente a tu cuenta bancaria de manera instantánea.',
    },
    {
      question: '¿Cómo abono fondos a mi billetera?',
      answer:
        'Puedes recargar saldo en Bolívares (Bs.) mediante Pago Móvil o transferencia bancaria nacional. Solo ingresas el monto, banco de origen, número de referencia y adjuntas el comprobante para acreditación rápida.',
    },
    {
      question: '¿Cómo retiro mis ganancias?',
      answer:
        'Ve a Billetera > Retirar o toca el botón "Retirar" en la barra inferior. Selecciona tu cuenta de Pago Móvil registrada, el monto en Bolívares y confirma. Las solicitudes son liquidadas de forma rápida y segura.',
    },
    {
      question: '¿Cómo funcionan las mesas y la regla 90/10?',
      answer: `En cada partida multijugador con entrada en Bolívares, el ${FINANCIAL_RULES.WINNER_PERCENT}% de la olla acumulada se entrega al ganador o equipo victorioso de forma transparente, mientras el ${FINANCIAL_RULES.SERVICE_FEE_PERCENT}% se retiene como tarifa de servicio de la plataforma.`,
    },
    {
      question: '¿Cómo funcionan los torneos y potes acumulados?',
      answer:
        'Los torneos y potes en vivo agrupan a múltiples jugadores en eliminatorias o tablas clasificatorias. El pozo se acumula con las entradas de todos los participantes y se reparte al finalizar el torneo.',
    },
    {
      question: '¿Cómo funciona el Bingo Online y la Polla Venezolana?',
      answer:
        'El Bingo y la Polla Venezolana son sorteos auditados con generadores de números aleatorios verificables. En la Polla seleccionas tus 6 animalitos para los turnos Mañana (07:55 AM) y Tarde (05:55 PM) con pozo comunitario.',
    },
    {
      question: '¿Qué ocurre si pierdo conexión durante una partida?',
      answer:
        'El sistema cuenta con reconexión automática en tiempo real. Si te desconectas temporalmente, la mesa te espera durante una ventana de gracia para que reanudes tu turno sin perder tu avance.',
    },
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div id="faq-accordion-section" className="space-y-4 select-none">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#2496FF]/10 border border-[#2496FF]/30 flex items-center justify-center text-[#2496FF]">
          <HelpCircle className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-black text-[#F8FAFC] tracking-tight">
            Preguntas Frecuentes (FAQ)
          </h2>
          <p className="text-[11px] text-[#94A3B8]">
            Todo lo que necesitas saber sobre reglas, recargas, retiros y seguridad
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={index}
              className={`rounded-2xl border transition-all ${
                isOpen
                  ? 'bg-[#171E2A] border-[#FF8A00]/40 shadow-md'
                  : 'bg-[#111722] border-[#1E2938] hover:border-[#1E2938]/80'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleFAQ(index)}
                className="w-full text-left p-3.5 sm:p-4 flex items-center justify-between gap-3 text-xs sm:text-sm font-bold text-[#F8FAFC] cursor-pointer"
                aria-expanded={isOpen}
              >
                <span className="leading-snug">{faq.question}</span>
                <ChevronDown
                  className={`w-4 h-4 text-[#94A3B8] shrink-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-[#FF8A00]' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div className="px-3.5 sm:px-4 pb-4 pt-1 text-xs text-[#94A3B8] leading-relaxed border-t border-[#1E2938]/50 animate-in fade-in duration-150">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
