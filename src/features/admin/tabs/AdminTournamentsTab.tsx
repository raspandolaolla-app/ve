import React, { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/common/Button';
import {
  Trophy,
  Plus,
  Calendar,
  Users,
  DollarSign,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  Tag,
} from 'lucide-react';

interface Tournament {
  id: string;
  name: string;
  description?: string;
  game_type: string;
  game_variant?: string | null;
  entry_fee: number;
  prize_pool: number;
  status: string;
  start_date: string;
  end_date: string;
  registration_deadline: string;
  current_participants: number;
  max_participants: number;
  created_at?: string;
}

export const AdminTournamentsTab: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    game_type: 'domino',
    game_variant: '',
    entry_fee: 0,
    prize_pool: 0,
    max_participants: 16,
    start_date: '',
    end_date: '',
    registration_deadline: '',
  });

  const loadTournaments = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setTournaments(data as Tournament[]);
      } else if (error) {
        console.error('[AdminTournamentsTab] Error loading tournaments:', error);
      }
    } catch (err) {
      console.error('[AdminTournamentsTab] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTournaments();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel('admin-tournaments-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournaments' },
        () => {
          loadTournaments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTournaments]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) {
      setFeedback({ type: 'error', message: 'Cliente Supabase no disponible.' });
      return;
    }

    if (!formData.name.trim()) {
      setFeedback({ type: 'error', message: 'El nombre del torneo es obligatorio.' });
      return;
    }

    if (!formData.start_date || !formData.end_date || !formData.registration_deadline) {
      setFeedback({ type: 'error', message: 'Debes definir las fechas de inicio, fin y límite de inscripción.' });
      return;
    }

    setActionLoading(true);
    setFeedback(null);

    try {
      const { data, error } = await supabase.rpc('create_tournament', {
        p_name: formData.name.trim(),
        p_description: formData.description.trim() || null,
        p_game_type: formData.game_type,
        p_entry_fee: Number(formData.entry_fee) || 0,
        p_prize_pool: Number(formData.prize_pool) || 0,
        p_max_participants: Number(formData.max_participants) || 16,
        p_start_date: new Date(formData.start_date).toISOString(),
        p_end_date: new Date(formData.end_date).toISOString(),
        p_registration_deadline: new Date(formData.registration_deadline).toISOString(),
        p_game_variant: formData.game_variant.trim() || null,
        p_rules: {},
        p_prize_distribution: [
          { position: 1, percentage: 50 },
          { position: 2, percentage: 30 },
          { position: 3, percentage: 20 },
        ],
      });

      if (error) {
        throw error;
      }

      setFeedback({ type: 'success', message: '¡Torneo creado exitosamente en modo BORRADOR (DRAFT)!' });
      setShowForm(false);
      setFormData({
        name: '',
        description: '',
        game_type: 'domino',
        game_variant: '',
        entry_fee: 0,
        prize_pool: 0,
        max_participants: 16,
        start_date: '',
        end_date: '',
        registration_deadline: '',
      });
      loadTournaments();
    } catch (err: any) {
      console.error('[AdminTournamentsTab] Error creating tournament:', err);
      setFeedback({ type: 'error', message: err.message || 'Error al crear el torneo.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setActionLoading(true);
    setFeedback(null);
    try {
      const { data, error } = await supabase.rpc('update_tournament_status', {
        p_tournament_id: id,
        p_status: newStatus,
      });

      if (error) throw error;

      setFeedback({
        type: 'success',
        message: `Estado actualizado a ${newStatus} correctamente.`,
      });
      loadTournaments();
    } catch (err: any) {
      console.error('[AdminTournamentsTab] Error updating status:', err);
      setFeedback({ type: 'error', message: err.message || 'Error al actualizar el estado.' });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredTournaments = tournaments.filter((t) => {
    if (statusFilter === 'ALL') return true;
    return t.status === statusFilter;
  });

  return (
    <div id="admin-tournaments-tab" className="space-y-6">
      {/* Header y Acciones */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 border border-slate-800 p-4 sm:p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white">Gestión Oficial de Torneos</h2>
              <p className="text-xs text-slate-400">
                Crea campeonatos con pozos acumulados, cuotas de entrada e inscripciones en tiempo real.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Button
            id="btn-refresh-tournaments"
            variant="outline"
            size="sm"
            onClick={loadTournaments}
            isLoading={loading}
            title="Refrescar lista"
          >
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </Button>

          <Button
            id="btn-toggle-create-tournament"
            onClick={() => {
              setShowForm(!showForm);
              setFeedback(null);
            }}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-xs sm:text-sm"
          >
            <Plus className="w-4 h-4 mr-1.5 text-slate-950" />
            {showForm ? 'Ocultar Formulario' : 'Crear Torneo'}
          </Button>
        </div>
      </div>

      {/* Mensajes de Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white text-xs ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Formulario de Creación */}
      {showForm && (
        <form
          id="form-create-tournament"
          onSubmit={handleCreate}
          className="bg-[#131926] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Nuevo Torneo Oficial
            </h3>
            <span className="text-xs text-amber-400/90 font-medium">
              Inicia en estado DRAFT (Borrador)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-slate-300 mb-1 block">
                Nombre del Torneo *
              </label>
              <input
                id="tourn-name-input"
                type="text"
                required
                placeholder="Ej: Gran Copa Criolla de Dominó 2026"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 mb-1 block">
                Juego Principal *
              </label>
              <select
                id="tourn-game-select"
                value={formData.game_type}
                onChange={(e) => setFormData({ ...formData, game_type: e.target.value })}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors"
              >
                <option value="domino">Dominó Venezolano</option>
                <option value="truco">Truco Venezolano</option>
                <option value="bingo">Bingo Virtual</option>
                <option value="atrapaito">Atrapaíto</option>
                <option value="polla">Polla Venezolana</option>
                <option value="chess">Ajedrez</option>
                <option value="checkers">Damas</option>
                <option value="una_olla">UNA-OLLA</option>
                <option value="rock_paper_scissors">Piedra, Papel o Tijera</option>
                <option value="tictactoe">Tic-Tac-Toe</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="text-xs font-bold text-slate-300 mb-1 block">
                Descripción / Bases
              </label>
              <textarea
                id="tourn-desc-input"
                rows={2}
                placeholder="Reglas breves, rondas eliminatorias, premios..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 mb-1 block">
                Entrada (Bs)
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="tourn-entry-fee-input"
                  type="number"
                  min="0"
                  step="any"
                  value={formData.entry_fee}
                  onChange={(e) => setFormData({ ...formData, entry_fee: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">0 Bs = Entrada Gratuita</span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 mb-1 block">
                Pozo Total / Garantizado (Bs) *
              </label>
              <div className="relative">
                <Trophy className="w-4 h-4 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="tourn-prize-pool-input"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={formData.prize_pool}
                  onChange={(e) => setFormData({ ...formData, prize_pool: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 mb-1 block">
                Máximo de Participantes *
              </label>
              <div className="relative">
                <Users className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="tourn-max-players-input"
                  type="number"
                  min="2"
                  max="1024"
                  required
                  value={formData.max_participants}
                  onChange={(e) => setFormData({ ...formData, max_participants: parseInt(e.target.value, 10) || 16 })}
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 mb-1 block">
                Cierre de Inscripciones *
              </label>
              <input
                id="tourn-deadline-input"
                type="datetime-local"
                required
                value={formData.registration_deadline}
                onChange={(e) => setFormData({ ...formData, registration_deadline: e.target.value })}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 mb-1 block">
                Inicio del Torneo *
              </label>
              <input
                id="tourn-start-input"
                type="datetime-local"
                required
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 mb-1 block">
                Fin Estimado *
              </label>
              <input
                id="tourn-end-input"
                type="datetime-local"
                required
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
            <Button
              id="btn-submit-tournament"
              type="submit"
              isLoading={actionLoading}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs sm:text-sm"
            >
              Guardar Torneo
            </Button>
            <Button
              id="btn-cancel-tournament"
              type="button"
              variant="outline"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* Filtros de Estado */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'ALL', label: 'Todos' },
          { id: 'REGISTRATION', label: 'Inscripciones Abiertas' },
          { id: 'ACTIVE', label: 'En Vivo / Activos' },
          { id: 'DRAFT', label: 'Borradores' },
          { id: 'FINISHED', label: 'Finalizados' },
          { id: 'CANCELLED', label: 'Cancelados' },
        ].map((filter) => (
          <button
            key={filter.id}
            id={`filter-tourn-${filter.id.toLowerCase()}`}
            onClick={() => setStatusFilter(filter.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === filter.id
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Lista de Torneos */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredTournaments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center">
          <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-300">
            No se encontraron torneos en esta categoría.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Utiliza el botón "Crear Torneo" para publicar una nueva competencia oficial.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTournaments.map((t) => {
            const isReg = t.status === 'REGISTRATION';
            const isActive = t.status === 'ACTIVE';
            const isDraft = t.status === 'DRAFT';
            const isFinished = t.status === 'FINISHED';

            return (
              <div
                key={t.id}
                id={`admin-tournament-card-${t.id}`}
                className="bg-[#131926] border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition-all shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-white truncate">
                      {t.name}
                    </h3>
                    <span
                      className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        isReg
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                          : isActive
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : isDraft
                          ? 'bg-slate-700/40 text-slate-400 border border-slate-600/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {t.status}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 uppercase">
                      {t.game_type}
                    </span>
                  </div>

                  {t.description && (
                    <p className="text-xs text-slate-400 line-clamp-1">
                      {t.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span>Pozo:</span>
                      <strong className="text-amber-300 font-mono">
                        {Number(t.prize_pool || 0).toLocaleString()} Bs
                      </strong>
                    </div>

                    <div className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-slate-400" />
                      <span>Entrada:</span>
                      <strong className="text-white font-mono">
                        {Number(t.entry_fee) > 0 ? `${t.entry_fee} Bs` : 'Gratis'}
                      </strong>
                    </div>

                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Inscritos:</span>
                      <strong className="text-white font-mono">
                        {t.current_participants} / {t.max_participants}
                      </strong>
                    </div>

                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Inicio:</span>
                      <span className="text-slate-300 font-mono">
                        {new Date(t.start_date).toLocaleDateString('es-VE', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Acciones de Cambio de Estado */}
                <div className="flex items-center gap-2 w-full md:w-auto justify-end shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                  {isDraft && (
                    <Button
                      id={`btn-open-reg-${t.id}`}
                      size="sm"
                      onClick={() => handleUpdateStatus(t.id, 'REGISTRATION')}
                      disabled={actionLoading}
                      className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs"
                    >
                      <Play className="w-3.5 h-3.5 mr-1" />
                      Abrir Inscripciones
                    </Button>
                  )}

                  {isReg && (
                    <Button
                      id={`btn-start-tourn-${t.id}`}
                      size="sm"
                      onClick={() => handleUpdateStatus(t.id, 'ACTIVE')}
                      disabled={actionLoading}
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs"
                    >
                      <Play className="w-3.5 h-3.5 mr-1" />
                      Iniciar Torneo
                    </Button>
                  )}

                  {isActive && (
                    <Button
                      id={`btn-finish-tourn-${t.id}`}
                      size="sm"
                      onClick={() => handleUpdateStatus(t.id, 'FINISHED')}
                      disabled={actionLoading}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Finalizar Torneo
                    </Button>
                  )}

                  {!isFinished && t.status !== 'CANCELLED' && (
                    <Button
                      id={`btn-cancel-tourn-${t.id}`}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (confirm(`¿Estás seguro de cancelar el torneo "${t.name}"?`)) {
                          handleUpdateStatus(t.id, 'CANCELLED');
                        }
                      }}
                      disabled={actionLoading}
                      className="text-red-400 border-red-500/30 hover:bg-red-500/10 text-xs"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
