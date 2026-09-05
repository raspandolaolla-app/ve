// ==============================================================================
// RASPANDO LA OLLA — CENTRO DE NOTIFICACIONES MEJORADO CON PUSH
// ==============================================================================

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  X,
  Sparkles,
  Trophy,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Volume2,
  VolumeX,
  Trash2,
  Check,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAudio } from '../../hooks/useAudio';
import { notificationService } from '../../services/NotificationService';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: string) => void;
}

interface Notification {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'game' | 'security' | 'tables' | 'wallet' | 'system';
  action: string;
  isUnread: boolean;
  icon?: string;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  const { user, profile } = useAuth();
  const { playSound, toggleMute, isMuted } = useAudio();
  const [muted, setMuted] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 'notif-1',
      title: '🎮 ¡Polla Venezolana Activa!',
      description: 'Próximo sorteo en vivo hoy a las 05:55 PM. Pozo acumulado con regla 90/10.',
      time: 'Hoy',
      type: 'game',
      action: 'polla',
      isUnread: true,
      icon: '🐾'
    },
    {
      id: 'notif-2',
      title: '🔒 Seguridad en Billetera',
      description: 'Recuerda habilitar 2FA y verificar tu cédula para retiros instantáneos por Pago Móvil.',
      time: 'Ayer',
      type: 'security',
      action: 'profile',
      isUnread: false,
      icon: '🛡️'
    },
    {
      id: 'notif-3',
      title: '🎲 Salas Multijugador en Vivo',
      description: 'Nuevas mesas públicas de Dominó, Truco y Bingo listas para jugar.',
      time: 'Esta semana',
      type: 'tables',
      action: 'tables',
      isUnread: false,
      icon: '🎯'
    },
    {
      id: 'notif-4',
      title: '💰 Bono de Bienvenida',
      description: 'Reclama tu bono de Bs. 500 por registrarte. Válido por 24 horas.',
      time: 'Hace 2 días',
      type: 'wallet',
      action: 'wallet',
      isUnread: true,
      icon: '🎁'
    },
    {
      id: 'notif-5',
      title: '🏆 Torneo Semanal',
      description: 'Inscríbete al torneo de Dominó con premio de Bs. 5,000. ¡Inicia el viernes!',
      time: 'Hace 3 días',
      type: 'game',
      action: 'tables',
      isUnread: false,
      icon: '🏆'
    }
  ]);

  useEffect(() => {
    setMuted(isMuted());
  }, [isMuted]);

  const handleToggleMute = () => {
    const newMuted = toggleMute();
    setMuted(newMuted);
    playSound('click');
  };

  const handleNotificationClick = (notification: Notification) => {
    playSound('click');
    
    // Marcar como leída
    setNotifications(prev =>
      prev.map(n =>
        n.id === notification.id ? { ...n, isUnread: false } : n
      )
    );

    onNavigateTab(notification.action);
    onClose();
  };

  const handleMarkAllAsRead = () => {
    playSound('click');
    setNotifications(prev =>
      prev.map(n => ({ ...n, isUnread: false }))
    );
  };

  const handleClearAll = () => {
    playSound('click');
    setNotifications([]);
  };

  const unreadCount = notifications.filter(n => n.isUnread).length;

  if (!isOpen) return null;

  return (
    <div
      id="notifications-modal-container"
      className="fixed inset-0 z-50 flex items-start justify-end sm:p-4 pt-16"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop con animación */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-[#080B12]/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal con animación slide-in */}
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-sm bg-[#111722] border border-[#1E2938] sm:rounded-2xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[80vh] modal-enter"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#1E2938] flex items-center justify-between bg-gradient-to-r from-[#080B12]/80 to-[#111722]/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <motion.div
              whileHover={{ rotate: 15 }}
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF8A00]/20 to-[#F5B942]/20 border border-[#FF8A00]/30 flex items-center justify-center text-[#FF8A00]"
            >
              <Bell className="w-4 h-4" />
            </motion.div>
            <div>
              <h3 className="text-sm font-black text-[#F8FAFC] uppercase tracking-wider">
                Notificaciones
              </h3>
              <p className="text-[10px] text-[#94A3B8]">
                {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todas leídas'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle de sonido */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleToggleMute}
              className="p-2 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors"
              title={muted ? 'Activar sonido' : 'Silenciar'}
            >
              {muted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </motion.button>

            {/* Botón cerrar */}
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="p-2 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Acciones rápidas */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-b border-[#1E2938] flex items-center justify-between gap-2 bg-[#080B12]/40">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-[#FF8A00] hover:bg-[#FF8A00]/10 transition-colors"
            >
              <Check className="w-3 h-3" />
              <span>Marcar todas</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-[#94A3B8] hover:bg-[#1E2938] transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Limpiar</span>
            </motion.button>
          </div>
        )}

        {/* Lista de notificaciones */}
        <div className="p-3 overflow-y-auto space-y-2 flex-1">
          <AnimatePresence>
            {notifications.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-[#171E2A] flex items-center justify-center mb-3">
                  <Bell className="w-8 h-8 text-[#94A3B8]" />
                </div>
                <p className="text-sm font-bold text-[#F8FAFC] mb-1">
                  Sin notificaciones
                </p>
                <p className="text-xs text-[#94A3B8]">
                  Aquí aparecerán tus notificaciones
                </p>
              </motion.div>
            ) : (
              notifications.map((n, index) => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer group ${
                    n.isUnread
                      ? 'bg-gradient-to-r from-[#171E2A] to-[#111722] border-[#FF8A00]/40 hover:border-[#FF8A00] shadow-lg shadow-[#FF8A00]/10'
                      : 'bg-[#111722] border-[#1E2938] hover:bg-[#171E2A]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icono de la notificación */}
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FF8A00]/10 to-[#F5B942]/10 border border-[#FF8A00]/20 flex items-center justify-center text-xl shrink-0">
                      {n.icon || '🔔'}
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {n.isUnread && (
                            <motion.span
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="w-2 h-2 rounded-full bg-[#FF8A00] shrink-0"
                            />
                          )}
                          <span className="text-xs font-black text-[#F8FAFC] truncate">
                            {n.title}
                          </span>
                        </div>
                        <span className="text-[9px] text-[#94A3B8] flex items-center gap-0.5 shrink-0">
                          <Clock className="w-2.5 h-2.5" />
                          {n.time}
                        </span>
                      </div>

                      <p className="text-[11px] text-[#94A3B8] leading-relaxed line-clamp-2">
                        {n.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#1E2938] bg-gradient-to-r from-[#080B12]/80 to-[#111722]/80 backdrop-blur-sm text-center">
          <span className="text-[10px] text-[#94A3B8] flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-[#FF8A00]" />
            Notificaciones en tiempo real con Push
          </span>
        </div>
      </motion.div>
    </div>
  );
};
