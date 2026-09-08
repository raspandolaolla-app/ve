// ==============================================================================
// RASPANDO LA OLLA — CENTRO DE NOTIFICACIONES PROFESIONAL (EVENT-DRIVEN)
// Principio: Notificaciones derivadas exclusivamente de eventos reales del sistema
// ==============================================================================

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  X,
  Sparkles,
  Trophy,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Volume2,
  VolumeX,
  Trash2,
  Check,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Headphones,
  Gamepad2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAudio } from '../../hooks/useAudio';
import { useNotifications } from '../../context/NotificationContext';
import type { AppNotification } from '../../types/notifications';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: string) => void;
}

// Formateador de fechas relativo amigable para Venezuela
function formatNotificationDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Reciente';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    const timeStr = date.toLocaleTimeString('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24 && date.getDate() === now.getDate()) {
      return `Hoy, ${timeStr}`;
    }
    if (diffDays === 1 || (diffHours < 48 && date.getDate() === now.getDate() - 1)) {
      return `Ayer, ${timeStr}`;
    }
    return `${date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}, ${timeStr}`;
  } catch {
    return 'Reciente';
  }
}

// Configuración visual por tipo de notificación real
function getNotificationVisuals(type: string) {
  switch (type) {
    case 'DEPOSIT_APPROVED':
      return {
        icon: <ArrowDownLeft className="w-4 h-4 text-emerald-400" />,
        bg: 'bg-emerald-500/10 border-emerald-500/30',
        badge: 'Recarga Aprobada',
        defaultTab: 'wallet',
      };
    case 'DEPOSIT_REJECTED':
      return {
        icon: <ArrowDownLeft className="w-4 h-4 text-rose-400" />,
        bg: 'bg-rose-500/10 border-rose-500/30',
        badge: 'Recarga Rechazada',
        defaultTab: 'wallet',
      };
    case 'WITHDRAWAL_APPROVED':
      return {
        icon: <ArrowUpRight className="w-4 h-4 text-emerald-400" />,
        bg: 'bg-emerald-500/10 border-emerald-500/30',
        badge: 'Retiro Procesado',
        defaultTab: 'wallet',
      };
    case 'WITHDRAWAL_REJECTED':
      return {
        icon: <ArrowUpRight className="w-4 h-4 text-rose-400" />,
        bg: 'bg-rose-500/10 border-rose-500/30',
        badge: 'Retiro Rechazado',
        defaultTab: 'wallet',
      };
    case 'BALANCE_UPDATE':
      return {
        icon: <Wallet className="w-4 h-4 text-[#FF8A00]" />,
        bg: 'bg-[#FF8A00]/10 border-[#FF8A00]/30',
        badge: 'Billetera',
        defaultTab: 'wallet',
      };
    case 'SUPPORT_MESSAGE':
    case 'SUPPORT_TICKET_CREATED':
    case 'SUPPORT_TICKET_UPDATED':
    case 'SUPPORT_TICKET_RESOLVED':
      return {
        icon: <Headphones className="w-4 h-4 text-sky-400" />,
        bg: 'bg-sky-500/10 border-sky-500/30',
        badge: 'Soporte',
        defaultTab: 'support',
      };
    case 'GAME_ENABLED':
    case 'GAME_DISABLED':
    case 'GAME_RULE_CHANGED':
    case 'GAME_ANNOUNCEMENT':
      return {
        icon: <Gamepad2 className="w-4 h-4 text-purple-400" />,
        bg: 'bg-purple-500/10 border-purple-500/30',
        badge: 'Juegos',
        defaultTab: 'tables',
      };
    case 'SECURITY_ALERT':
      return {
        icon: <ShieldAlert className="w-4 h-4 text-red-400" />,
        bg: 'bg-red-500/10 border-red-500/30',
        badge: 'Seguridad',
        defaultTab: 'profile',
      };
    case 'ADMIN_BROADCAST':
    case 'OPERATOR_BROADCAST':
    case 'SYSTEM_ANNOUNCEMENT':
    case 'MAINTENANCE_ANNOUNCEMENT':
    default:
      return {
        icon: <Sparkles className="w-4 h-4 text-[#F5B942]" />,
        bg: 'bg-[#F5B942]/10 border-[#F5B942]/30',
        badge: 'Oficial',
        defaultTab: 'home',
      };
  }
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  const { user } = useAuth();
  const { playSound, toggleMute, isMuted } = useAudio();
  const [muted, setMuted] = useState(false);

  // Consumir el estado real del NotificationContext
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllRead,
    refreshNotifications,
  } = useNotifications();

  useEffect(() => {
    setMuted(isMuted());
  }, [isMuted]);

  const handleToggleMute = () => {
    const newMuted = toggleMute();
    setMuted(newMuted);
    playSound('click');
  };

  const handleNotificationClick = async (notification: AppNotification) => {
    playSound('click');

    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    const visuals = getNotificationVisuals(notification.type);
    const targetTab = notification.data?.targetTab || visuals.defaultTab;

    if (targetTab) {
      onNavigateTab(targetTab);
    }
    onClose();
  };

  const handleMarkAllAsRead = async () => {
    playSound('click');
    await markAllAsRead();
  };

  const handleClearAllRead = async () => {
    playSound('click');
    await clearAllRead();
  };

  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    playSound('click');
    await deleteNotification(id);
  };

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
        className="relative w-full max-w-sm bg-[#111722] border border-[#1E2938] sm:rounded-2xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[85vh] modal-enter"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#1E2938] flex items-center justify-between bg-gradient-to-r from-[#080B12]/90 to-[#111722]/90 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <motion.div
              whileHover={{ rotate: 12 }}
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF8A00]/20 to-[#F5B942]/20 border border-[#FF8A00]/30 flex items-center justify-center text-[#FF8A00]"
            >
              <Bell className="w-4 h-4" />
            </motion.div>
            <div>
              <h3 className="text-xs font-black text-[#F8FAFC] uppercase tracking-wider">
                Notificaciones
              </h3>
              <p className="text-[10px] text-[#94A3B8]">
                {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todas leídas'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Botón refrescar */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => refreshNotifications()}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors disabled:opacity-50"
              title="Actualizar notificaciones"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#FF8A00]' : ''}`} />
            </motion.button>

            {/* Toggle de sonido */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleToggleMute}
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors"
              title={muted ? 'Activar sonido' : 'Silenciar'}
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </motion.button>

            {/* Botón cerrar */}
            <motion.button
              whileHover={{ scale: 1.05, rotate: 90 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Acciones rápidas */}
        {notifications.length > 0 && (
          <div className="px-3.5 py-2 border-b border-[#1E2938] flex items-center justify-between gap-2 bg-[#080B12]/50">
            {unreadCount > 0 ? (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleMarkAllAsRead}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#FF8A00] hover:bg-[#FF8A00]/10 transition-colors"
              >
                <Check className="w-3 h-3" />
                <span>Marcar todas</span>
              </motion.button>
            ) : (
              <span className="text-[10px] text-emerald-400/90 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Al día
              </span>
            )}

            {notifications.some((n) => n.isRead) && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleClearAllRead}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#94A3B8] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Archivar notificaciones leídas"
              >
                <Trash2 className="w-3 h-3" />
                <span>Limpiar leídas</span>
              </motion.button>
            )}
          </div>
        )}

        {/* Lista de notificaciones reales */}
        <div className="p-3 overflow-y-auto space-y-2 flex-1 divide-y divide-[#1E2938]/30">
          <AnimatePresence>
            {!user ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <div className="w-12 h-12 rounded-full bg-[#171E2A] flex items-center justify-center mb-3">
                  <ShieldCheck className="w-6 h-6 text-[#94A3B8]" />
                </div>
                <p className="text-xs font-bold text-[#F8FAFC] mb-1">
                  Inicia sesión
                </p>
                <p className="text-[11px] text-[#94A3B8] max-w-[220px]">
                  Inicia sesión para recibir alertas de tus partidas, recargas y soporte.
                </p>
              </motion.div>
            ) : notifications.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-14 text-center px-4"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#171E2A] border border-[#1E2938] flex items-center justify-center mb-3 text-[#94A3B8]">
                  <Bell className="w-5 h-5 opacity-60" />
                </div>
                <p className="text-xs font-bold text-[#F8FAFC] mb-1">
                  Bandeja Limpia
                </p>
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                  No hay notificaciones pendientes. Aquí recibirás alertas de recargas, retiros, soporte y avisos oficiales.
                </p>
              </motion.div>
            ) : (
              notifications.map((n, index) => {
                const visuals = getNotificationVisuals(n.type);

                return (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: Math.min(index * 0.03, 0.2) }}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer group relative ${
                      !n.isRead
                        ? 'bg-gradient-to-r from-[#171E2A] to-[#111722] border-[#FF8A00]/40 hover:border-[#FF8A00] shadow-md shadow-[#FF8A00]/5'
                        : 'bg-[#111722] border-[#1E2938] hover:bg-[#171E2A]/70'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icono visual según tipo real */}
                      <div
                        className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${visuals.bg}`}
                      >
                        {visuals.icon}
                      </div>

                      {/* Contenido */}
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {!n.isRead && (
                              <span className="w-2 h-2 rounded-full bg-[#FF8A00] shrink-0" />
                            )}
                            <span className="text-xs font-bold text-[#F8FAFC] truncate">
                              {n.title}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-[#94A3B8] leading-relaxed line-clamp-2 mb-1">
                          {n.message}
                        </p>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] text-[#64748B] flex items-center gap-1 font-mono">
                            <Clock className="w-2.5 h-2.5" />
                            {formatNotificationDate(n.createdAt)}
                          </span>

                          <span className="text-[9px] font-semibold text-[#64748B] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#080B12]/60 border border-[#1E2938]">
                            {visuals.badge}
                          </span>
                        </div>
                      </div>

                      {/* Botón de borrado individual */}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteItem(e, n.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-[#64748B] hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all absolute top-2 right-2"
                        title="Eliminar notificación"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {/* Footer Informativo */}
        <div className="p-2.5 border-t border-[#1E2938] bg-[#080B12]/80 backdrop-blur-sm text-center">
          <span className="text-[10px] text-[#64748B] flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-[#FF8A00]/70" />
            Notificaciones en tiempo real vía eventos de Supabase
          </span>
        </div>
      </motion.div>
    </div>
  );
};
