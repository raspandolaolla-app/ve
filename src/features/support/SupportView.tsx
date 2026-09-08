// ==============================================================================
// RASPANDO LA OLLA — CENTRO DE AYUDA INTELIGENTE Y CHAT DE SOPORTE EN VIVO
// Base de Conocimiento FAQ, Cola de Atención en Tiempo Real y Mensajería Directa
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import {
  MessageCircle,
  HelpCircle,
  Clock,
  User,
  Send,
  Image as ImageIcon,
  X,
  Search,
  CheckCircle,
  Headphones,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  is_active: boolean;
}

interface SupportTicket {
  id: string;
  ticket_number: string;
  status: 'WAITING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  queue_position?: number;
  assigned_operator_name?: string;
  estimated_wait?: string;
  created_at: string;
}

interface ChatMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_role: 'USER' | 'OPERATOR' | 'ADMIN' | 'SYSTEM';
  message: string | null;
  image_url: string | null;
  created_at: string;
}

interface SupportViewProps {
  onBack?: () => void;
  initialShowChat?: boolean;
}

export const SupportView: React.FC<SupportViewProps> = ({ onBack, initialShowChat = false }) => {
  const { user } = useAuth();
  const [showChat, setShowChat] = useState<boolean>(initialShowChat);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [faqCategory, setFaqCategory] = useState<string>('TODAS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [ticketInfo, setTicketInfo] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLoadingFaqs, setIsLoadingFaqs] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar FAQs y verificar si el usuario tiene un ticket activo
  useEffect(() => {
    loadFaqs();
    checkActiveTicket();
  }, [user?.id]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    if (showChat) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showChat]);

  // Suscribirse a mensajes en tiempo real cuando hay ticket activo
  useEffect(() => {
    if (!ticketInfo?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channelName = `chat_support_${ticketInfo.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `ticket_id=eq.${ticketInfo.id}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          // Sonido si el mensaje no es del usuario actual
          if (newMsg.sender_id !== user?.id && newMsg.sender_role !== 'USER') {
            playNotificationSound();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `id=eq.${ticketInfo.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setTicketInfo((prev) => (prev ? { ...prev, status: updated.status } : null));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketInfo?.id, user?.id]);

  const playNotificationSound = () => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {
      // Ignorar restricciones de autoplay en navegadores
    }
  };

  const loadFaqs = async () => {
    setIsLoadingFaqs(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsLoadingFaqs(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('faq_items')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true });

      if (!error && data && data.length > 0) {
        setFaqs(data);
      } else {
        // Fallback robusto con preguntas frecuentes clave
        setFaqs([
          {
            id: '1',
            category: 'Cuenta',
            question: '¿Cómo me registro en la plataforma?',
            answer: 'Haz clic en "Ingresar" en la parte superior, selecciona "Continuar con Google" o usa tu correo. El sistema creará tu perfil y billetera automáticamente.',
            is_active: true,
          },
          {
            id: '2',
            category: 'Cuenta',
            question: '¿Cómo recupero mi usuario o contraseña?',
            answer: 'Si usaste Google, solo inicia sesión de nuevo. Si usaste correo, ve a "Ingresar" y selecciona "¿Olvidaste tu contraseña?" para recibir un enlace de recuperación instantáneo.',
            is_active: true,
          },
          {
            id: '3',
            category: 'Finanzas',
            question: '¿Cómo realizo una recarga en bolívares?',
            answer: 'Ve a la pestaña "Billetera", selecciona "Recargar", elige tu método de pago (Pago Móvil bancario nacional), ingresa el monto y sube la captura del comprobante. Un operador lo acreditará en minutos.',
            is_active: true,
          },
          {
            id: '4',
            category: 'Finanzas',
            question: '¿Cómo solicito un retiro a mi cuenta bancaria?',
            answer: 'En "Billetera", haz clic en "Retirar", ingresa el monto en Bs y tus datos de Pago Móvil. El procesamiento se ejecuta de 15 a 60 minutos con liquidación certificada.',
            is_active: true,
          },
          {
            id: '5',
            category: 'Juegos',
            question: '¿Qué pasa si se me va el internet durante una partida?',
            answer: '¡No te preocupes! El estado de las mesas y partidas se almacena en el servidor. Cuentas con un temporizador de reconexión para reanudar tu jugada sin perder tu balance.',
            is_active: true,
          },
          {
            id: '6',
            category: 'Seguridad',
            question: '¿Mis fondos y premios están protegidos?',
            answer: 'Sí. Todo el flujo financiero opera bajo un Libro Mayor inmutable (Ledger) con cifrado bancario y autenticación multifactor opcional.',
            is_active: true,
          },
        ]);
      }
    } catch {
      // Usar defaults
    } finally {
      setIsLoadingFaqs(false);
    }
  };

  const checkActiveTicket = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) return;

    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['WAITING', 'IN_PROGRESS'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const ticket = data[0];
        setTicketInfo({
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          status: ticket.status,
          queue_position: ticket.queue_position,
          created_at: ticket.created_at,
          estimated_wait: ticket.status === 'IN_PROGRESS' ? 'En atención inmediata' : '3 a 5 minutos',
        });
        loadMessages(ticket.id);
        setShowChat(true);
      }
    } catch (err) {
      console.warn('[SupportView] Error checking active ticket:', err);
    }
  };

  const loadMessages = async (ticketId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data);
      }
    } catch (err) {
      console.warn('[SupportView] Error loading messages:', err);
    }
  };

  const handleCreateTicket = async () => {
    if (!user) {
      setErrorMsg('Debes iniciar sesión para abrir un ticket de soporte en vivo.');
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsSubmitting(true);
    try {
      const initialMsg = 'Hola, solicito asistencia de un operador con respecto a mi cuenta o transacciones.';
      const { data, error } = await supabase.rpc('create_support_ticket', {
        p_initial_message: initialMsg,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data && data.success) {
        setTicketInfo({
          id: data.ticket_id,
          ticket_number: data.ticket_number,
          status: 'WAITING',
          queue_position: data.queue_position,
          assigned_operator_name: data.assigned_operator_name,
          estimated_wait: data.estimated_wait,
          created_at: new Date().toISOString(),
        });
        setShowChat(true);
        loadMessages(data.ticket_id);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'No fue posible iniciar el chat de soporte. Intenta nuevamente.');
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !imageFile) || isUploading || isSubmitting) return;
    if (!ticketInfo?.id) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsSubmitting(true);
    let imageUrl: string | null = null;

    try {
      // Subir imagen a storage si existe
      if (imageFile) {
        setIsUploading(true);
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${ticketInfo.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('support_attachments')
          .upload(fileName, imageFile);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('support_attachments')
            .getPublicUrl(fileName);
          imageUrl = urlData?.publicUrl || null;
        }
        setIsUploading(false);
      }

      const { data, error } = await supabase.rpc('send_chat_message', {
        p_ticket_id: ticketInfo.id,
        p_message: newMessage.trim() || (imageUrl ? 'Archivo adjunto enviado' : ''),
        p_image_url: imageUrl,
      });

      if (error) {
        throw new Error(error.message);
      }

      setNewMessage('');
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al enviar el mensaje.');
      setTimeout(() => setErrorMsg(null), 3000);
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  const categories = ['TODAS', ...Array.from(new Set(faqs.map((f) => f.category)))];

  const filteredFaqs = faqs.filter((faq) => {
    const matchesCategory = faqCategory === 'TODAS' || faq.category === faqCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 animate-in fade-in duration-200">
      {/* Botón Volver y Título Superior */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 tracking-tight">
              <Headphones className="w-6 h-6 text-amber-400" />
              Centro de Ayuda & Soporte
            </h1>
            <p className="text-xs text-slate-400">
              Resuelve tus dudas al instante o conéctate con nuestro equipo en vivo 24/7.
            </p>
          </div>
        </div>

        {showChat && (
          <button
            onClick={() => setShowChat(false)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white hover:border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            <span>Ver Preguntas Frecuentes</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="mb-4 p-3.5 bg-red-500/15 border border-red-500/30 rounded-xl text-xs font-bold text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!showChat ? (
        <div className="space-y-6">
          {/* BANNER DESTACADO: CHAT EN VIVO */}
          <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#12231E] via-[#0E1A1B] to-[#0A1116] p-5 sm:p-7 shadow-xl shadow-emerald-500/5 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Operadores en Línea
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-wide">
                ¿Necesitas ayuda personalizada con una recarga, retiro o partida?
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Abre un ticket en tiempo real. Un operador asignado te responderá directamente sin salir de la plataforma.
              </p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-[11px] text-slate-400 pt-1">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-400" /> Tiempo estimado: Menos de 2 min
                </span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Atención 100% segura y auditada
                </span>
              </div>
            </div>

            <button
              onClick={handleCreateTicket}
              disabled={isSubmitting}
              className="w-full md:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm uppercase tracking-wide shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2.5 shrink-0"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <MessageCircle className="w-5 h-5 fill-slate-950" />
                  <span>Chatear con un Operador</span>
                </>
              )}
            </button>
          </div>

          {/* SECCIÓN BASE DE CONOCIMIENTO (FAQ INTELIGENTE) */}
          <div className="bg-[#111722] border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-lg space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wide">
                    Preguntas Frecuentes
                  </h3>
                  <p className="text-xs text-slate-400">
                    Encuentra respuestas rápidas a las consultas más comunes
                  </p>
                </div>
              </div>

              {/* Buscador de preguntas */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar en preguntas frecuentes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* Pestañas de categorías */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFaqCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    faqCategory === cat
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-[#0B0F17] text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Lista de Acordeón */}
            {isLoadingFaqs ? (
              <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                <span>Cargando preguntas frecuentes...</span>
              </div>
            ) : filteredFaqs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No se encontraron preguntas que coincidan con tu búsqueda.
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredFaqs.map((faq) => {
                  const isOpen = openFaqId === faq.id;
                  return (
                    <div
                      key={faq.id}
                      className={`rounded-xl border transition-all ${
                        isOpen
                          ? 'border-amber-500/40 bg-[#0E1420]'
                          : 'border-slate-800/80 bg-[#0B0F17] hover:border-slate-700'
                      }`}
                    >
                      <button
                        onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                        className="w-full text-left p-4 flex items-center justify-between gap-3 font-bold text-xs sm:text-sm text-slate-200 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-bold">
                            {faq.category}
                          </span>
                          <span>{faq.question}</span>
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                            isOpen ? 'rotate-180 text-amber-400' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 pt-1 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 mt-1">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* INTERFAZ DE CHAT EN VIVO CON OPERADOR */
        <div className="bg-[#111722] border border-slate-800 rounded-2xl flex flex-col h-[75vh] shadow-2xl overflow-hidden">
          {/* Header del Chat */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0B0F17]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Headphones className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-white text-sm">Soporte en Vivo</h3>
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black rounded-full uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {ticketInfo?.status === 'WAITING' ? 'En Cola' : 'Conectado'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                  <span>
                    Ticket: <strong className="text-amber-400 font-mono">{ticketInfo?.ticket_number}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Atiende: <strong className="text-slate-200">{ticketInfo?.assigned_operator_name || 'Operador en turno'}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Espera est.: <strong className="text-emerald-400">{ticketInfo?.estimated_wait || 'Menos de 2 min'}</strong>
                  </span>
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowChat(false)}
              className="p-2 rounded-lg bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Minimizar chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Área de Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#080B12]/80">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin mb-3 text-amber-400" />
                <p className="text-xs font-bold text-slate-300">Conectando con el canal de soporte...</p>
                <p className="text-[11px] text-slate-500 mt-1">Escribe tu duda y un operador te responderá al instante.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.sender_role === 'USER';
                const isSystem = msg.sender_role === 'SYSTEM';

                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center my-2">
                      <span className="bg-slate-900 border border-slate-800 text-slate-300 text-[11px] px-3 py-1.5 rounded-full font-medium shadow-xs text-center max-w-md">
                        {msg.message}
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3.5 shadow-md ${
                        isUser
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-medium rounded-br-xs'
                          : 'bg-slate-900 border border-slate-800 text-white rounded-bl-xs'
                      }`}
                    >
                      {!isUser && (
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-black uppercase text-amber-400">
                          <User className="w-3 h-3" />
                          <span>{msg.sender_role === 'ADMIN' ? 'Administrador' : 'Operador de Soporte'}</span>
                        </div>
                      )}

                      {msg.message && (
                        <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap select-text">
                          {msg.message}
                        </p>
                      )}

                      {msg.image_url && (
                        <div className="mt-2 rounded-xl overflow-hidden border border-black/20 max-w-xs">
                          <img
                            src={msg.image_url}
                            alt="Comprobante o captura"
                            className="w-full h-auto max-h-60 object-cover cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => window.open(msg.image_url!, '_blank')}
                          />
                        </div>
                      )}

                      <p
                        className={`text-[9px] font-mono mt-1 text-right ${
                          isUser ? 'text-amber-950/70 font-bold' : 'text-slate-500'
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
            <div ref={messagesEndRef} />
          </div>

          {/* Banner si el ticket ya fue resuelto */}
          {ticketInfo?.status === 'RESOLVED' && (
            <div className="p-3 bg-emerald-500/10 border-t border-emerald-500/30 text-emerald-400 text-xs font-bold text-center flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" />
              <span>Este ticket fue marcado como resuelto. Si necesitas más ayuda, puedes abrir una nueva solicitud.</span>
            </div>
          )}

          {/* Entrada de Mensaje */}
          {ticketInfo?.status !== 'RESOLVED' && ticketInfo?.status !== 'CLOSED' && (
            <div className="p-3 sm:p-4 border-t border-slate-800 bg-[#0B0F17]">
              {imageFile && (
                <div className="mb-2.5 flex items-center gap-2 text-xs text-slate-300 bg-slate-900 border border-slate-800 p-2 rounded-xl">
                  <ImageIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate max-w-xs">{imageFile.name}</span>
                  <button
                    onClick={() => {
                      setImageFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="ml-auto text-red-400 hover:text-red-300 p-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setImageFile(e.target.files[0]);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors cursor-pointer"
                  title="Adjuntar captura o imagen"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>

                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl flex items-center px-3 py-1.5 focus-within:border-amber-500/50">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Escribe tu mensaje a soporte..."
                    className="w-full bg-transparent text-white text-xs sm:text-sm focus:outline-none resize-none max-h-24 py-1.5"
                    rows={1}
                  />
                </div>

                <button
                  onClick={handleSendMessage}
                  disabled={(!newMessage.trim() && !imageFile) || isSubmitting || isUploading}
                  className="p-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-amber-500/20 active:scale-95"
                  title="Enviar mensaje"
                >
                  {isSubmitting || isUploading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  ) : (
                    <Send className="w-4 h-4 fill-slate-950" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
