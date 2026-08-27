// ==============================================================================
// RASPANDO LA OLLA — MODAL VISOR DE DOCUMENTOS LEGALES
// ==============================================================================

import { useState, useId } from 'react';
import { X, ShieldCheck, FileText, Lock, BookOpen, HeartHandshake, CheckCircle2 } from 'lucide-react';
import { LEGAL_DOCUMENTS } from '../../data/legalDocuments';
import type { LegalDocId } from '../../types/legal';
import { Button } from '../common/Button';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDoc?: LegalDocId;
}

export function LegalModal({ isOpen, onClose, initialDoc = 'terms' }: LegalModalProps) {
  const [activeDocId, setActiveDocId] = useState<LegalDocId>(initialDoc);
  const modalTitleId = useId();

  if (!isOpen) return null;

  const currentDoc = LEGAL_DOCUMENTS[activeDocId] || LEGAL_DOCUMENTS.terms;

  const tabs: { id: LegalDocId; label: string; icon: typeof FileText }[] = [
    { id: 'terms', label: 'Términos de Uso', icon: FileText },
    { id: 'privacy', label: 'Privacidad', icon: Lock },
    { id: 'rules', label: 'Reglas de Juego', icon: BookOpen },
    { id: 'responsible_gaming', label: 'Juego Responsable (+18)', icon: HeartHandshake },
  ];

  return (
    <div
      id="legal-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
    >
      <div
        id="legal-modal-container"
        className="bg-slate-900 border border-slate-800 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
      >
        {/* Encabezado del Modal */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id={modalTitleId} className="text-base sm:text-lg font-bold text-slate-100">
                Centro de Información Legal & Transparencia
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Versión {currentDoc.version}</span>
                <span>•</span>
                <span>Actualizado: {currentDoc.lastUpdated}</span>
              </div>
            </div>
          </div>
          <button
            id="btn-close-legal-modal"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Pestañas de Navegación */}
        <div className="flex overflow-x-auto border-b border-slate-800 bg-slate-950/40 px-6 py-2 gap-2 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeDocId === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-legal-${tab.id}`}
                onClick={() => setActiveDocId(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Resumen del Documento */}
        <div className="bg-amber-950/20 border-b border-amber-800/20 px-6 py-3 text-xs text-amber-200/90 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{currentDoc.summary}</p>
        </div>

        {/* Contenido desplazable del Documento */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 text-sm text-slate-300 leading-relaxed scrollbar-thin scrollbar-thumb-slate-800">
          <div className="space-y-1 pb-2 border-b border-slate-800/60">
            <h3 className="text-xl font-bold text-slate-100">{currentDoc.title}</h3>
            <p className="text-xs text-slate-400">
              Plataforma oficial Raspando La Olla • Registro público de condiciones de servicio
            </p>
          </div>

          {currentDoc.sections.map((section, idx) => (
            <div key={idx} className="space-y-2.5">
              <h4 className="text-base font-semibold text-amber-300/90">{section.title}</h4>
              {section.paragraphs.map((p, pIdx) => (
                <p key={pIdx} className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                  {p}
                </p>
              ))}
              {section.bulletPoints && section.bulletPoints.length > 0 && (
                <ul className="space-y-1.5 pl-4 list-disc marker:text-amber-400/70 text-xs sm:text-sm text-slate-300">
                  {section.bulletPoints.map((item, bIdx) => (
                    <li key={bIdx} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* Pie del Modal con Acción de Cierre */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            <span>Raspando La Olla • Juegos Tradicionales y Entretenimiento</span>
          </div>
          <Button
            id="btn-confirm-read-legal"
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            Cerrar Lectura
          </Button>
        </div>
      </div>
    </div>
  );
}
