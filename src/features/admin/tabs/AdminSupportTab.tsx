// ==============================================================================
// RASPANDO LA OLLA — TAB 9: CENTRO DE ATENCIÓN, COLA DE SOPORTE Y CHAT EN VIVO
// Panel Profesional para Operadores y Administradores en Tiempo Real
// ==============================================================================

import { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '../../../lib/supabase/client';
import { useAuth } from '../../../hooks/useAuth';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { sanitizeUserErrorMessage } from '../../../utils/errorSanitizer';
import type { AdminSupportTicketItem } from '../../../types/admin';
import {
  MessageCircle,
  MessageSquare,
  Search,
  CheckCircle,
  Clock,
  Send,
  X,
  User,
  Headphones,
  RefreshCw,
  AlertCircle,
  Eye,
  CheckCircle2,
  FileText,
} from 'lucide-react';

interface LiveTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  assigned_operator_id: string | null;
  status: 'WAITING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  queue_position: number;
  created_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  user_display_name?: string;
  user_email?: string;
}

interface LiveChatMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_role: 'USER' | 'OPERATOR' | 'ADMIN' | 'SYSTEM';
  message: string | null;
  image_url: string | null;
  created_at: string;
}

interface AdminSupportTabProps {
  tickets?: AdminSupportTicketItem[];
  onUpdateStatus?: (
    ticketId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED'
  ) => Promise<{ success: boolean; error?: string }>;
  onRefresh?: () => void;
}

export function AdminSupportTab({ tickets = [], onUpdateStatus, onRefresh }: AdminSupportTabProps) {
  const { user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'live_queue' | 'history'>('live_queue');

  // Estados para la Cola en Vivo
  const [liveTickets, setLiveTickets] = useState<LiveTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<LiveTicket | null>(null);
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [liveStatusFilter, setLiveStatusFilter] = useState<'ACTIVE' | 'RESOLVED' | 'ALL'>('ACTIVE');
  const [searchLive, setSearchLive] = useState('');

  // Estados para la tabla histórica
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [legacySelectedTicket, setLegacySelectedTicket] = useState<AdminSupportTicketItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Cargar tickets en vivo
  useEffect(() => {
    loadLiveTickets();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Suscribirse a cambios en tickets
    const ticketsChannel = supabase
      .channel('admin_support_tickets_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        () => {
          loadLiveTickets();
          if (onRefresh) onRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ticketsChannel);
    };
  }, []);

  // Suscribirse a mensajes del ticket seleccionado
  useEffect(() => {
    if (!selectedTicket?.id) return;
    loadTicketMessages(selectedTicket.id);

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const messagesChannel = supabase
      .channel(`admin_chat_sub_${selectedTicket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `ticket_id=eq.${selectedTicket.id}`,
        },
        (payload) => {
          const newMsg = payload.new as LiveChatMessage;
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.sender_role === 'USER') {
            playDingSound();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [selectedTicket?.id]);

  // Scroll automático en el chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const playDingSound = () => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.6;
      audio.play().catch(() => {});
    } catch {
      // Ignorar restricciones de audio del navegador
    }
  };

  const loadLiveTickets = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsLoadingTickets(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          id,
          ticket_number,
          user_id,
          assigned_operator_id,
          status,
          queue_position,
          created_at,
          first_response_at,
          resolved_at
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        // Enriquecer con nombres de perfiles si es posible
        const userIds = Array.from(new Set(data.map((t) => t.user_id).filter(Boolean)));
        let profileMap: Record<string, { display_name?: string; email?: string }> = {};

        if (userIds.length > 0) {
          try {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, display_name, email')
              .in('id', userIds);

            if (profiles) {
              profiles.forEach((p) => {
                profileMap[p.id] = { display_name: p.display_name, email: p.email };
              });
            }
          } catch {
            // Continuar sin perfiles si falla
          }
        }

        const mapped: LiveTicket[] = data.map((t) => ({
          ...t,
          user_display_name: profileMap[t.user_id]?.display_name || 'Jugador',
          user_email: profileMap[t.user_id]?.email || '',
        }));

        setLiveTickets(mapped);

        // Si el ticket seleccionado está abierto, actualizar su estado
        if (selectedTicket) {
          const fresh = mapped.find((m) => m.id === selectedTicket.id);
          if (fresh) setSelectedTicket(fresh);
        }
      }
    } catch (err) {
      console.warn('[AdminSupportTab] Error loading live tickets:', err);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const loadTicketMessages = async (ticketId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setChatMessages(data);
      }
    } catch (err) {
      console.warn('[AdminSupportTab] Error loading messages:', err);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket?.id || isSending) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsSending(true);
    try {
      const { data, error } = await supabase.rpc('send_chat_message', {
        p_ticket_id: selectedTicket.id,
        p_message: replyText.trim(),
        p_image_url: null,
      });

      if (error) {
        // Fallback: insertar directo si el RPC no estuviera disponible
        await supabase.from('chat_messages').insert({
          ticket_id: selectedTicket.id,
          sender_id: user?.id,
          sender_role: 'OPERATOR',
          message: replyText.trim(),
        });
      }

      setReplyText('');
      loadTicketMessages(selectedTicket.id);
    } catch (err) {
      console.warn('[AdminSupportTab] Error sending reply:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleResolveTicket = async (ticketId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({
          status: 'RESOLVED',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', ticketId);

      if (!error) {
        setLiveTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, status: 'RESOLVED' } : t))
        );
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket((prev) => (prev ? { ...prev, status: 'RESOLVED' } : null));
        }
      }
    } catch (err) {
      console.warn('[AdminSupportTab] Error resolving ticket:', err);
    }
  };

  // Filtrado de la lista en vivo
  const filteredLiveTickets = liveTickets.filter((t) => {
    const matchesFilter =
      liveStatusFilter === 'ALL'
        ? true
        : liveStatusFilter === 'ACTIVE'
        ? t.status === 'WAITING' || t.status === 'IN_PROGRESS'
        : t.status === 'RESOLVED' || t.status === 'CLOSED';

    const matchesSearch =
      searchLive.trim() === '' ||
      t.ticket_number.toLowerCase().includes(searchLive.toLowerCase()) ||
      (t.user_display_name && t.user_display_name.toLowerCase().includes(searchLive.toLowerCase())) ||
      (t.user_email && t.user_email.toLowerCase().includes(searchLive.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  // Filtrado de la tabla histórica
  const filteredLegacyTickets = tickets.filter((t) => {
    const matchesSearch =
      t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleLegacyStatusChange = async (
    newStatus: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED'
  ) => {
    if (!legacySelectedTicket || !onUpdateStatus) return;
    setActionLoading(true);
    try {
      const res = await onUpdateStatus(legacySelectedTicket.id, newStatus);
      if (res.success) {
        setLegacySelectedTicket((prev) => (prev ? { ...prev, status: newStatus } : null));
        if (onRefresh) onRefresh();
      } else {
        alert(sanitizeUserErrorMessage(res.error, 'No fue posible actualizar el estado del ticket.'));
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4" id="tab-admin-support">
      {/* Selector de Sub-Pestañas */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('live_queue')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'live_queue'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>Cola en Vivo ({liveTickets.filter((t) => t.status === 'WAITING' || t.status === 'IN_PROGRESS').length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'history'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Historial de Registros ({tickets.length})</span>
          </button>
        </div>

        <button
          onClick={() => {
            loadLiveTickets();
            if (onRefresh) onRefresh();
          }}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Refrescar datos"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingTickets ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {activeSubTab === 'live_queue' ? (
        /* VISTA DE COLA DE SOPORTE EN VIVO Y CHAT */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-210px)] min-h-[580px]">
          {/* COLUMNA IZQUIERDA: COLA DE TICKETS */}
          <div className="lg:col-span-5 bg-[#111722] border border-slate-800 rounded-2xl flex flex-col overflow-hidden">
            {/* Header de la cola y filtros */}
            <div className="p-3.5 border-b border-slate-800 bg-[#0B0F17] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-black uppercase text-white tracking-wider">
                    Cola de Atención
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {(['ACTIVE', 'RESOLVED', 'ALL'] as const).map((filterKey) => (
                    <button
                      key={filterKey}
                      onClick={() => setLiveStatusFilter(filterKey)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                        liveStatusFilter === filterKey
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      {filterKey === 'ACTIVE' ? 'Activos' : filterKey === 'RESOLVED' ? 'Resueltos' : 'Todos'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Buscador de tickets */}
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por ticket o usuario..."
                  value={searchLive}
                  onChange={(e) => setSearchLive(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* Lista scrollable de tickets */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2 bg-[#080B12]/60">
              {filteredLiveTickets.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  {isLoadingTickets ? 'Cargando cola...' : 'No hay tickets activos en este momento.'}
                </div>
              ) : (
                filteredLiveTickets.map((t) => {
                  const isSelected = selectedTicket?.id === t.id;
                  const waitingMins = Math.max(
                    0,
                    Math.floor((Date.now() - new Date(t.created_at).getTime()) / 60000)
                  );

                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTicket(t)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/50 shadow-sm'
                          : 'bg-[#0E1420] border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-white text-xs truncate">
                          {t.user_display_name || 'Jugador'}
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            t.status === 'WAITING'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                              : t.status === 'IN_PROGRESS'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {t.status === 'WAITING'
                            ? 'EN COLA'
                            : t.status === 'IN_PROGRESS'
                            ? 'ATENDIENDO'
                            : 'RESUELTO'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span className="text-amber-400/90">{t.ticket_number}</span>
                        <span className="flex items-center gap-1 text-slate-400">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {waitingMins} min en espera
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* COLUMNA DERECHA: CHAT EN VIVO CON EL JUGADOR */}
          <div className="lg:col-span-7 bg-[#111722] border border-slate-800 rounded-2xl flex flex-col overflow-hidden">
            {selectedTicket ? (
              <>
                {/* Header del Chat */}
                <div className="p-3.5 border-b border-slate-800 bg-[#0B0F17] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-xs sm:text-sm">
                        {selectedTicket.user_display_name || 'Jugador'}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-mono">
                        Ticket: <strong className="text-amber-400">{selectedTicket.ticket_number}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedTicket.status !== 'RESOLVED' && (
                      <button
                        onClick={() => handleResolveTicket(selectedTicket.id)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Resolver</span>
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedTicket(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-900 border border-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Historial de Mensajes */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#080B12]/90">
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs">
                      <RefreshCw className="w-6 h-6 animate-spin mb-2 text-amber-400" />
                      <span>Cargando mensajes del ticket...</span>
                    </div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isOperator =
                        msg.sender_role === 'OPERATOR' || msg.sender_role === 'ADMIN';
                      const isSystem = msg.sender_role === 'SYSTEM';

                      if (isSystem) {
                        return (
                          <div key={msg.id} className="flex justify-center my-1.5">
                            <span className="bg-slate-900 border border-slate-800 text-slate-400 text-[10px] px-3 py-1 rounded-full text-center">
                              {msg.message}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isOperator ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed ${
                              isOperator
                                ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-br-xs'
                                : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-xs'
                            }`}
                          >
                            <p
                              className={`text-[9px] font-black uppercase mb-1 ${
                                isOperator ? 'text-emerald-200' : 'text-amber-400'
                              }`}
                            >
                              {isOperator ? 'Operador (Tú)' : 'Jugador'}
                            </p>

                            {msg.message && <p className="whitespace-pre-wrap">{msg.message}</p>}

                            {msg.image_url && (
                              <div className="mt-2 rounded-lg overflow-hidden border border-black/30 max-w-xs">
                                <img
                                  src={msg.image_url}
                                  alt="Adjunto del usuario"
                                  className="w-full h-auto max-h-48 object-cover cursor-pointer hover:opacity-95"
                                  onClick={() => window.open(msg.image_url!, '_blank')}
                                />
                              </div>
                            )}

                            <p
                              className={`text-[9px] font-mono mt-1 text-right ${
                                isOperator ? 'text-emerald-300' : 'text-slate-400'
                              }`}
                            >
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Entrada de Respuesta */}
                <div className="p-3 border-t border-slate-800 bg-[#0B0F17]">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      placeholder="Escribe una respuesta al jugador..."
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || isSending}
                      className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-slate-950 font-black text-xs uppercase rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSending ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Responder</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
                <MessageCircle className="w-14 h-14 mb-3 text-slate-700" />
                <p className="text-sm font-bold text-slate-300">
                  Selecciona un ticket de la cola izquierda
                </p>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Atiende consultas en vivo, responde en tiempo real y marca los tickets como resueltos.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VISTA DE HISTORIAL GENERAL (COMPATIBLE CON ADMIN TICKETS) */
        <div className="space-y-4">
          <Card id="card-support-filter" className="bg-slate-900/90 border-slate-800">
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="input-search-support"
                  type="text"
                  placeholder="Buscar por usuario o asunto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
                {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).map((st) => (
                  <button
                    key={st}
                    id={`btn-filter-ticket-${st}`}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      statusFilter === st
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st === 'ALL'
                      ? 'Todos'
                      : st === 'OPEN'
                      ? 'Abiertos'
                      : st === 'IN_PROGRESS'
                      ? 'En Atención'
                      : st === 'RESOLVED'
                      ? 'Resueltos'
                      : 'Cerrados'}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card
            id="card-support-table"
            className="bg-slate-900/90 border-slate-800 overflow-hidden"
            header={
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                  <MessageSquare className="w-4 h-4 text-amber-400" />
                  <span>Tickets Históricos ({filteredLegacyTickets.length})</span>
                </div>
                <span className="text-xs text-slate-500">Auditoría de Soporte</span>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold">
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Usuario</th>
                    <th className="py-2.5 px-3">Categoría</th>
                    <th className="py-2.5 px-3">Asunto</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredLegacyTickets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No hay tickets con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredLegacyTickets.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                          {new Date(t.createdAt).toLocaleDateString('es-VE')}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-200">{t.userName}</td>
                        <td className="py-3 px-3">
                          <span className="bg-slate-950/80 border border-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300 font-mono">
                            {t.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-300 max-w-xs truncate">{t.subject}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.status === 'OPEN'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : t.status === 'IN_PROGRESS'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                                : t.status === 'RESOLVED'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            id={`btn-view-ticket-${t.id}`}
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2.5"
                            onClick={() => setLegacySelectedTicket(t)}
                            leftIcon={<Eye className="w-3 h-3" />}
                          >
                            Atender
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Modal de Ticket Histórico */}
      {legacySelectedTicket && (
        <div
          id="modal-support-ticket"
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-sm">{legacySelectedTicket.subject}</h3>
                <span className="text-xs text-slate-400">Usuario: {legacySelectedTicket.userName}</span>
              </div>
              <button
                id="btn-close-ticket-modal"
                type="button"
                onClick={() => setLegacySelectedTicket(null)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-850 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Categoría: <strong className="text-slate-200">{legacySelectedTicket.category}</strong></span>
                <span>{new Date(legacySelectedTicket.createdAt).toLocaleString('es-VE')}</span>
              </div>
              <p className="text-slate-200 leading-relaxed">{legacySelectedTicket.description}</p>
            </div>

            {onUpdateStatus && (
              <div className="pt-2 space-y-2 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-300 block">Actualizar Estado:</span>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    id="btn-ticket-in-progress"
                    variant="outline"
                    size="sm"
                    className="text-xs text-blue-400 border-blue-500/30"
                    isLoading={actionLoading}
                    onClick={() => handleLegacyStatusChange('IN_PROGRESS')}
                  >
                    En Atención
                  </Button>
                  <Button
                    id="btn-ticket-resolve"
                    variant="outline"
                    size="sm"
                    className="text-xs text-emerald-400 border-emerald-500/30"
                    isLoading={actionLoading}
                    onClick={() => handleLegacyStatusChange('RESOLVED')}
                  >
                    Resolver
                  </Button>
                  <Button
                    id="btn-ticket-close"
                    variant="outline"
                    size="sm"
                    className="text-xs text-slate-400 border-slate-700"
                    isLoading={actionLoading}
                    onClick={() => handleLegacyStatusChange('CLOSED')}
                  >
                    Cerrar
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
