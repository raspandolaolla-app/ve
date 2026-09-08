// ==============================================================================
// RASPANDO LA OLLA — TAB 10: NOTIFICACIONES Y ALERTAS OPERATIVAS
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import type { AdminNotificationItem } from '../../../types/admin';
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  Info,
  ShieldAlert,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
} from 'lucide-react';

interface AdminNotificationsTabProps {
  notifications: AdminNotificationItem[];
  onMarkAsRead: (id: string) => Promise<void>;
  onRefresh: () => void;
}

export function AdminNotificationsTab({
  notifications,
  onMarkAsRead,
  onRefresh,
}: AdminNotificationsTabProps) {
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const filtered = notifications.filter((n) => (filter === 'UNREAD' ? !n.isRead : true));

  return (
    <div className="space-y-6" id="tab-admin-notifications">
      <Card id="card-notifications-filter" className="bg-slate-900/90 border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
            <Bell className="w-4 h-4 text-amber-400" />
            <span>Centro de Notificaciones y Alertas ({filtered.length})</span>
          </div>

          <div className="flex gap-2">
            <button
              id="btn-filter-notif-all"
              type="button"
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                filter === 'ALL'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-950/80 border border-slate-800 text-slate-400'
              }`}
            >
              Todas
            </button>
            <button
              id="btn-filter-notif-unread"
              type="button"
              onClick={() => setFilter('UNREAD')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                filter === 'UNREAD'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-950/80 border border-slate-800 text-slate-400'
              }`}
            >
              No Leídas
            </button>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card id="card-empty-notif" className="bg-slate-900/90 border-slate-800 py-12 text-center text-slate-500 text-xs">
            No hay alertas o notificaciones pendientes.
          </Card>
        ) : (
          filtered.map((n) => (
            <Card
              key={n.id}
              id={`card-notif-${n.id}`}
              className={`border transition-all ${
                n.isRead
                  ? 'bg-slate-900/60 border-slate-850'
                  : 'bg-slate-900 border-amber-500/30 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {n.severity === 'CRITICAL' ? (
                      <ShieldAlert className="w-5 h-5 text-red-400" />
                    ) : n.severity === 'WARNING' ? (
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    ) : (
                      <Info className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-xs text-slate-100">{n.title}</h4>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(n.createdAt).toLocaleTimeString('es-VE')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{n.message}</p>
                  </div>
                </div>

                {!n.isRead && (
                  <Button
                    id={`btn-read-notif-${n.id}`}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => onMarkAsRead(n.id)}
                    leftIcon={<Check className="w-3 h-3 text-emerald-400" />}
                  >
                    Marcar Leída
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
