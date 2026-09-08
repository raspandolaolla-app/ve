/**
 * Componente de lista de mesas públicas disponibles
 * Extraído de TablesView.tsx para modularidad y mantenibilidad
 */
import React from 'react';
import { Users } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import type { GameTable } from '../../../types/tables';
import { TableCard } from './TableCard';

export interface TableListProps {
  tables: GameTable[];
  onViewTable: (table: GameTable) => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  onOpenCreateModal: () => void;
}

export const TableList: React.FC<TableListProps> = ({
  tables,
  onViewTable,
  isLoading,
  isAuthenticated,
  onOpenCreateModal,
}) => {
  if (tables.length === 0) {
    return (
      <div className="py-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
        <Users className="w-8 h-8 text-slate-600 mx-auto" />
        <div className="text-slate-400 text-xs">
          {isLoading ? 'Cargando mesas disponibles...' : 'No hay mesas públicas abiertas en este momento.'}
        </div>
        {isAuthenticated && !isLoading && (
          <Button
            variant="outline"
            size="sm"
            className="text-amber-300 border-amber-500/30"
            onClick={onOpenCreateModal}
          >
            Abrir la primera mesa
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {tables.map((table) => (
        <TableCard key={table.id} table={table} onView={onViewTable} />
      ))}
    </div>
  );
};
