// ==============================================================================
// RASPANDO LA OLLA — CENTRO DE NOTIFICACIONES Y ANUNCIOS
// ==============================================================================

import React from 'react';
import {
  Bell,
  X,
  Sparkles,
  Trophy,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  const { user, profile } = useAuth();

  if (!isOpen) return null;

  const notifications = [
    {
      id: 'notif-1',
      title: '¡Polla Venezolana Activa!',
      description: 'Próximo sorteo en vivo hoy a las 05:55 PM. Pozo acumulado con regla 90/10.',
      time: 'Hoy',
      type: 'game',
      action: 'polla',
      isUnread: true,
    },
    {
      id: 'notif-2',
      title: 'Seguridad en Billetera',
      description: 'Recuerda habilitar 2FA y verificar tu cédula para retiros instantáneos por Pago Móvil.',
      time: 'Ayer',
      type: 'security',
      action: 'profile',
      isUnread: false,
    },
    {
      id: 'notif-3',
      title: 'Salas Multijugador en Vivo',
      description: 'Nuevas mesas públicas de Dominó, Truco y Bingo listas para jugar.',
      time: 'Esta semana',
      type: 'tables',
      action: 'tables',
      isUnread: false,
    },
  ];

  return (
    <div
      id="notifications-modal-container"
      className="fixed inset-0 z-50 flex items-start justify-end sm:p-4 pt-16 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-[#080B12]/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-sm bg-[#111722] border border-[#1E2938] sm:rounded-2xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-[#1E2938] flex items-center justify-between bg-[#080B12]/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#FF8A00]/10 border border-[#FF8A00]/30 flex items-center justify-center text-[#FF8A00]">
              <Bell className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-black text-[#F8FAFC] uppercase tracking-wider">
              Notificaciones
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 overflow-y-auto space-y-2 flex-1">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                onNavigateTab(n.action);
                onClose();
              }}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                n.isUnread
                  ? 'bg-[#171E2A] border-[#FF8A00]/40 hover:border-[#FF8A00]'
                  : 'bg-[#111722] border-[#1E2938] hover:bg-[#171E2A]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {n.isUnread && (
                    <span className="w-2 h-2 rounded-full bg-[#FF8A00] animate-pulse" />
                  )}
                  <span className="text-xs font-bold text-[#F8FAFC]">{n.title}</span>
                </div>
                <span className="text-[10px] text-[#94A3B8] flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {n.time}
                </span>
              </div>
              <p className="text-[11px] text-[#94A3B8] mt-1 leading-relaxed">
                {n.description}
              </p>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-[#1E2938] bg-[#080B12]/80 text-center">
          <span className="text-[10px] text-[#94A3B8]">
            Notificaciones del sistema en tiempo real
          </span>
        </div>
      </div>
    </div>
  );
};
