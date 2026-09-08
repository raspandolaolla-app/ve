// ==============================================================================
// RASPANDO LA OLLA — GLOBAL ERROR BOUNDARY COMPONENT
// ==============================================================================
// Evita fallos de "pantalla negra" capturando excepciones de renderizado
// y ofreciendo opciones de recuperación rápida (recarga o redirección al Lobby).
// ==============================================================================

import React, { type ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Capturado un error fatal no controlado:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoToHome = () => {
    // Forzar limpieza y regreso al lobby restableciendo el state de la url si fuese necesario
    window.location.href = window.location.origin;
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-amber-500 selection:text-slate-950">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
            {/* Cabezal de Alerta */}
            <div className="mx-auto w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20">
              <ShieldAlert className="w-8 h-8 text-amber-500" />
            </div>

            {/* Mensajes */}
            <div className="space-y-2">
              <h1 className="text-xl font-black text-amber-400 uppercase tracking-tight">
                Algo no salió bien
              </h1>
              <p className="text-sm text-slate-300">
                La aplicación experimentó un error temporal durante el juego. No te preocupes, tus balances en la billetera y partidas activas están seguros en nuestro servidor.
              </p>
            </div>

            {/* Detalles del error colapsable */}
            {this.state.error && (
              <div className="text-left bg-slate-950/80 border border-slate-850 rounded-2xl p-3 max-h-32 overflow-y-auto font-mono text-[10px] text-slate-400">
                <p className="font-bold text-red-400 mb-1">{this.state.error.name}: {this.state.error.message}</p>
                {this.state.error.stack && (
                  <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
                )}
              </div>
            )}

            {/* Controles de Acción */}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-all uppercase tracking-wider"
              >
                <RefreshCw className="w-4 h-4" />
                Reiniciar App
              </button>
              
              <button
                onClick={this.handleGoToHome}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs border border-slate-700 transition-all uppercase tracking-wider"
              >
                <Home className="w-4 h-4 text-amber-400" />
                Ir al Lobby
              </button>
            </div>

            {/* Pie de Firma Venezolana */}
            <p className="text-[10px] text-slate-500 font-mono">
              RASPANDO LA OLLA 🇻🇪 • Sistema de Resiliencia Activa
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
