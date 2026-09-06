// ==============================================================================
// RASPANDO LA OLLA — TAB 5: BILLETERAS Y LIBRO MAYOR (AUDITORÍA CONTABLE)
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { formatBolivares } from '../../../utils/formatters';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import type { AdminWalletItem, AdminLedgerEntryItem } from '../../../types/admin';
import {
  Wallet,
  Search,
  Eye,
  FileSpreadsheet,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  X,
} from 'lucide-react';

interface AdminWalletsTabProps {
  wallets: AdminWalletItem[];
  onRefresh: () => void;
}

export function AdminWalletsTab({ wallets, onRefresh }: AdminWalletsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWallet, setSelectedWallet] = useState<AdminWalletItem | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<AdminLedgerEntryItem[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const filteredWallets = wallets.filter(
    (w) =>
      w.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.userId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenLedger = async (wallet: AdminWalletItem) => {
    setSelectedWallet(wallet);
    setLoadingLedger(true);
    try {
      const entries = await AdminRepository.getUserLedger(wallet.userId, 50);
      setLedgerEntries(entries);
    } finally {
      setLoadingLedger(false);
    }
  };

  return (
    <div className="space-y-6" id="tab-admin-wallets">
      {/* Filtros y Búsqueda */}
      <Card id="card-wallets-filter" className="bg-slate-900/90 border-slate-800">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-wallets"
              type="text"
              placeholder="Buscar por usuario o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <Button
            id="btn-refresh-wallets"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Actualizar Billeteras
          </Button>
        </div>
      </Card>

      {/* Tabla de Billeteras */}
      <Card
        id="card-wallets-table"
        className="bg-slate-900/90 border-slate-800 overflow-hidden"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <Wallet className="w-4 h-4 text-amber-400" />
              <span>Billeteras de Usuarios ({filteredWallets.length})</span>
            </div>
            <span className="text-xs text-slate-500">Contabilidad de Partida Doble</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Usuario</th>
                <th className="py-2.5 px-3">Moneda</th>
                <th className="py-2.5 px-3">Saldo Disponible</th>
                <th className="py-2.5 px-3">Saldo Retenido</th>
                <th className="py-2.5 px-3">Saldo Total</th>
                <th className="py-2.5 px-3 text-right">Auditoría</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredWallets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No se encontraron billeteras registradas.
                  </td>
                </tr>
              ) : (
                filteredWallets.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-200">{w.userName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{w.userEmail}</div>
                    </td>

                    <td className="py-3 px-3 font-mono font-semibold text-slate-300">
                      {w.currency}
                    </td>

                    <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                      {formatBolivares(w.availableBalance)}
                    </td>

                    <td className="py-3 px-3 font-mono font-semibold text-amber-300">
                      {formatBolivares(w.heldBalance)}
                    </td>

                    <td className="py-3 px-3 font-mono font-black text-slate-100">
                      {formatBolivares(w.totalBalance)}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <Button
                        id={`btn-view-ledger-${w.id}`}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2.5"
                        onClick={() => handleOpenLedger(w)}
                        leftIcon={<FileSpreadsheet className="w-3 h-3 text-amber-400" />}
                      >
                        Ver Ledger
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de Inspección del Ledger */}
      {selectedWallet && (
        <div
          id="modal-ledger-inspector"
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">Libro Mayor (Ledger de Movimientos)</h3>
                  <span className="text-xs text-slate-400 font-mono">Usuario: {selectedWallet.userName}</span>
                </div>
              </div>
              <button
                id="btn-close-ledger-modal"
                type="button"
                onClick={() => setSelectedWallet(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1">
              {loadingLedger ? (
                <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
                  <span>Consultando entradas de libro mayor...</span>
                </div>
              ) : ledgerEntries.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Sin movimientos registrados para esta billetera.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/60">
                      <th className="py-2 px-2.5">Fecha</th>
                      <th className="py-2 px-2.5">Tipo</th>
                      <th className="py-2 px-2.5">Concepto</th>
                      <th className="py-2 px-2.5">Monto</th>
                      <th className="py-2 px-2.5">Saldo Post</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {ledgerEntries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-800/20">
                        <td className="py-2.5 px-2.5 text-slate-400 font-mono text-[11px]">
                          {new Date(e.createdAt).toLocaleString('es-VE')}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <span
                            className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              e.direction === 'CREDIT'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}
                          >
                            {e.entryType}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 text-slate-300">{e.description}</td>
                        <td
                          className={`py-2.5 px-2.5 font-mono font-bold ${
                            e.direction === 'CREDIT' ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {e.direction === 'CREDIT' ? '+' : '-'} {formatBolivares(e.amount)}
                        </td>
                        <td className="py-2.5 px-2.5 font-mono text-slate-300">
                          {formatBolivares(e.balanceAfterAvailable)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
