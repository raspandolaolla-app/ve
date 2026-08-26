// ==============================================================================
// RASPANDO LA OLLA — TAB 2: GESTIÓN DE USUARIOS Y ROLES (RBAC PROTEGIDO)
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { formatBolivares } from '../../../utils/formatters';
import { AUTHORIZED_SUPER_ADMIN_EMAILS } from '../../../utils/constants';
import type { AdminUserItem, UserRole } from '../../../types/admin';
import {
  Users,
  Search,
  ShieldCheck,
  ShieldAlert,
  UserX,
  UserCheck,
  Lock,
  Wallet,
  Clock,
  Eye,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';

interface AdminUsersTabProps {
  users: AdminUserItem[];
  currentUserRole: UserRole;
  currentUserEmail: string | null;
  onUpdateStatus: (userId: string, newStatus: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED', reason: string) => Promise<void>;
  onUpdateRole: (userId: string, targetEmail: string, newRole: UserRole) => Promise<void>;
  onRefresh: () => void;
}

export function AdminUsersTab({
  users,
  currentUserRole,
  currentUserEmail,
  onUpdateStatus,
  onUpdateRole,
  onRefresh,
}: AdminUsersTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusReason, setStatusReason] = useState('');
  const [targetRole, setTargetRole] = useState<UserRole>('PLAYER');

  const isSuperAdmin =
    currentUserRole === 'SUPER_ADMIN' &&
    currentUserEmail !== null &&
    AUTHORIZED_SUPER_ADMIN_EMAILS.includes(currentUserEmail.toLowerCase());

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.phoneMasked && u.phoneMasked.includes(searchTerm)) ||
      (u.cedulaMasked && u.cedulaMasked.includes(searchTerm));

    const matchesStatus = statusFilter === 'ALL' || u.accountStatus === statusFilter;
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;

    return matchesSearch && matchesStatus && matchesRole;
  });

  const handleApplyStatusChange = async (newStatus: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED') => {
    if (!selectedUser) return;
    const reason = statusReason.trim() || `Acción administrativa aplicada por operador`;
    setActionLoading(true);
    try {
      await onUpdateStatus(selectedUser.id, newStatus, reason);
      setStatusReason('');
      setSelectedUser(null);
      onRefresh();
    } finally {
      setActionLoading(false);
    }
  };

  const handleApplyRoleChange = async () => {
    if (!selectedUser) return;
    if (!isSuperAdmin) {
      alert('Solo los SUPER_ADMIN autorizados pueden gestionar roles.');
      return;
    }
    setActionLoading(true);
    try {
      await onUpdateRole(selectedUser.id, selectedUser.email, targetRole);
      setSelectedUser(null);
      onRefresh();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="tab-admin-users">
      {/* Barra Superior de Filtros y Búsqueda */}
      <Card id="card-users-filter" className="bg-slate-900/90 border-slate-800">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-users"
              type="text"
              placeholder="Buscar por nombre, correo, cédula..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <select
              id="select-filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="ACTIVE">Activos</option>
              <option value="SUSPENDED">Suspendidos</option>
              <option value="BLOCKED">Bloqueados</option>
            </select>

            <select
              id="select-filter-role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
            >
              <option value="ALL">Todos los Roles</option>
              <option value="PLAYER">PLAYER (Jugador)</option>
              <option value="OPERATOR">OPERATOR (Operador)</option>
              <option value="ADMIN">ADMIN (Administrador)</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Tabla de Usuarios Registrados */}
      <Card
        id="card-users-table"
        className="bg-slate-900/90 border-slate-800 overflow-hidden"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <Users className="w-4 h-4 text-amber-400" />
              <span>Directorio de Usuarios ({filteredUsers.length})</span>
            </div>
            <span className="text-xs text-slate-500">Supervisión en Tiempo Real</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Usuario</th>
                <th className="py-2.5 px-3">Rol</th>
                <th className="py-2.5 px-3">Estado Cuenta</th>
                <th className="py-2.5 px-3">Estado KYC</th>
                <th className="py-2.5 px-3">Saldo Total</th>
                <th className="py-2.5 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No se encontraron usuarios que coincidan con los criterios.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3">
                      <div>
                        <div className="font-semibold text-slate-200">
                          {u.firstName} {u.lastName}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                        {u.state && <div className="text-[10px] text-slate-500">{u.state}</div>}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.role === 'SUPER_ADMIN'
                            ? 'bg-purple-500/10 border border-purple-500/30 text-purple-400'
                            : u.role === 'ADMIN'
                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                            : u.role === 'OPERATOR'
                            ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                          u.accountStatus === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : u.accountStatus === 'SUSPENDED'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {u.accountStatus === 'ACTIVE' ? 'ACTIVA' : u.accountStatus === 'SUSPENDED' ? 'SUSPENDIDA' : 'BLOQUEADA'}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                          u.kycStatus === 'VERIFIED'
                            ? 'text-emerald-400'
                            : u.kycStatus === 'PENDING'
                            ? 'text-amber-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {u.kycStatus}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono font-semibold text-slate-200">
                      {formatBolivares(u.totalBalance)}
                      <div className="text-[10px] text-slate-500 font-normal">
                        Disp: {formatBolivares(u.availableBalance)}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <Button
                        id={`btn-view-user-${u.id}`}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2.5"
                        onClick={() => {
                          setSelectedUser(u);
                          setTargetRole(u.role);
                        }}
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                      >
                        Gestionar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de Gestión Detallada de Usuario */}
      {selectedUser && (
        <div
          id="modal-manage-user"
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">
                    {selectedUser.firstName} {selectedUser.lastName}
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">{selectedUser.email}</span>
                </div>
              </div>
              <button
                id="btn-close-user-modal"
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Información Detallada del Perfil */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                <span className="text-slate-500 block mb-1">Estado de Cuenta</span>
                <span className="font-semibold text-slate-200">{selectedUser.accountStatus}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                <span className="text-slate-500 block mb-1">Verificación KYC</span>
                <span className="font-semibold text-slate-200">{selectedUser.kycStatus}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                <span className="text-slate-500 block mb-1">Saldo Disponible</span>
                <span className="font-semibold font-mono text-emerald-400">
                  {formatBolivares(selectedUser.availableBalance)}
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                <span className="text-slate-500 block mb-1">Saldo Retenido</span>
                <span className="font-semibold font-mono text-amber-300">
                  {formatBolivares(selectedUser.heldBalance)}
                </span>
              </div>
            </div>

            {/* Acciones de Suspensión / Reactivación */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Control de Estado de Cuenta
              </h4>
              <textarea
                id="textarea-status-reason"
                rows={2}
                placeholder="Motivo del cambio de estado (requerido para auditoría)..."
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />

              <div className="flex gap-2">
                {selectedUser.accountStatus !== 'ACTIVE' && (
                  <Button
                    id="btn-reactivate-user"
                    variant="primary"
                    size="sm"
                    className="flex-1 text-xs"
                    isLoading={actionLoading}
                    onClick={() => handleApplyStatusChange('ACTIVE')}
                    leftIcon={<UserCheck className="w-3.5 h-3.5" />}
                  >
                    Reactivar Cuenta
                  </Button>
                )}
                {selectedUser.accountStatus === 'ACTIVE' && (
                  <>
                    <Button
                      id="btn-suspend-user"
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                      isLoading={actionLoading}
                      onClick={() => handleApplyStatusChange('SUSPENDED')}
                      leftIcon={<AlertTriangle className="w-3.5 h-3.5" />}
                    >
                      Suspender
                    </Button>
                    <Button
                      id="btn-block-user"
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                      isLoading={actionLoading}
                      onClick={() => handleApplyStatusChange('BLOCKED')}
                      leftIcon={<UserX className="w-3.5 h-3.5" />}
                    >
                      Bloquear
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Asignación de Roles (Solo Super Admin) */}
            {isSuperAdmin && (
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Gestión de Rol (SUPER_ADMIN)</span>
                  </h4>
                  <span className="text-[10px] text-slate-500">Auditado inmutable</span>
                </div>

                <div className="flex gap-2 items-center">
                  <select
                    id="select-user-target-role"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as UserRole)}
                    className="flex-1 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="PLAYER">PLAYER (Jugador)</option>
                    <option value="OPERATOR">OPERATOR (Operador de Pagos/Mesas)</option>
                    <option value="ADMIN">ADMIN (Administrador)</option>
                    {AUTHORIZED_SUPER_ADMIN_EMAILS.includes(selectedUser.email.toLowerCase()) && (
                      <option value="SUPER_ADMIN">SUPER_ADMIN (Exclusivo)</option>
                    )}
                  </select>

                  <Button
                    id="btn-save-user-role"
                    variant="outline"
                    size="sm"
                    className="text-xs text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                    isLoading={actionLoading}
                    onClick={handleApplyRoleChange}
                  >
                    Guardar Rol
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
