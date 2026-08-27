// ==============================================================================
// RASPANDO LA OLLA — TARJETA CONTENEDORA MODULAR
// ==============================================================================

import type React from 'react';

export interface CardProps {
  id?: string;
  children?: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  key?: React.Key;
}

export function Card({ id, children, className = '', header, footer }: CardProps) {
  return (
    <div
      id={id}
      className={`bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-2xl overflow-hidden shadow-lg ${className}`}
    >
      {header && (
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/50">
          {header}
        </div>
      )}
      <div className="p-5">{children}</div>
      {footer && (
        <div className="px-5 py-3 border-t border-slate-800/80 bg-slate-950/40 text-xs text-slate-400">
          {footer}
        </div>
      )}
    </div>
  );
}
