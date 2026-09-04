// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: ATRAPAÍTO (PARCHÍS / LUDO VENEZOLANO)
// ==============================================================================
// Componente SVG altamente interactivo, responsivo y adaptativo para Atrapaíto.
// Soporta tableros de 4 y 6 colores, animaciones de dados, casillas seguras,
// barreras, capturas, vidas y resaltado de movimientos legales.
// Rediseñado con estilo Premium Púrpura de Lujo y Chat Reactivo Criollo.
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Dices,
  Heart,
  Shield,
  Sparkles,
  Trophy,
  Zap,
  AlertCircle,
  MessageSquare,
  Send,
  Users,
  Radio,
  Flame,
  User,
  MessageCircle,
  HelpCircle
} from 'lucide-react';
import type { AtrapaitoState, AtrapaitoColor, AtrapaitoPiece } from '../../../types/games';
import type { TablePlayer } from '../../../types/tables';
import { BOARD_CONFIG_4, BOARD_CONFIG_6 } from '../engines/AtrapaitoEngine';

interface AtrapaitoBoardProps {
  state: AtrapaitoState;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
  onRollDice: () => void;
  onMovePiece: (pieceId: string) => void;
  players?: TablePlayer[];
}

interface ChatMessage {
  id: string;
  senderName: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

const COLOR_MAP: Record<AtrapaitoColor, { bg: string; fill: string; border: string; text: string; hex: string; ring: string }> = {
  yellow: { bg: 'bg-yellow-500', fill: 'fill-yellow-500', border: 'border-yellow-400', text: 'text-yellow-400', hex: '#eab308', ring: 'ring-yellow-400/50' },
  red: { bg: 'bg-red-600', fill: 'fill-red-600', border: 'border-red-500', text: 'text-red-400', hex: '#dc2626', ring: 'ring-red-500/50' },
  blue: { bg: 'bg-blue-600', fill: 'fill-blue-600', border: 'border-blue-500', text: 'text-blue-400', hex: '#2563eb', ring: 'ring-blue-500/50' },
  green: { bg: 'bg-emerald-600', fill: 'fill-emerald-600', border: 'border-emerald-500', text: 'text-emerald-400', hex: '#10b981', ring: 'ring-emerald-500/50' },
  orange: { bg: 'bg-orange-500', fill: 'fill-orange-500', border: 'border-orange-400', text: 'text-orange-400', hex: '#f97316', ring: 'ring-orange-400/50' },
  cyan: { bg: 'bg-cyan-500', fill: 'fill-cyan-500', border: 'border-cyan-400', text: 'text-cyan-400', hex: '#06b6d4', ring: 'ring-cyan-400/50' },
};

const QUICK_PHRASES = [
  '¡Chaaacho, qué salado! 🧂',
  '¡Te atrapé, compay! 💀',
  '¡Pendiente con la olla! 🍲',
  '¡A correr piojo! 🏃‍♂️',
  '¡La vieja! 👵',
  '¡Eso fue pura suerte! 🎲',
  '🇻🇪 ¡Fuego con el dado!',
  '👑 ¡Soy el papá de los helados!'
];

export const AtrapaitoBoard: React.FC<AtrapaitoBoardProps> = ({
  state,
  currentUserId,
  turnExpiresAt,
  sessionId,
  onRollDice,
  onMovePiece,
  players = [],
}) => {
  const isMyTurn = state.currentTurnUserId === currentUserId;
  const myPlayer = state.players[currentUserId];
  const activeColor = state.activeColor || 'yellow';
  const activeColorTheme = COLOR_MAP[activeColor] || COLOR_MAP.yellow;

  // Temporizador
  const [timeLeftSec, setTimeLeftSec] = useState<number>(30);
  const [isDiceRolling, setIsDiceRolling] = useState(false);

  // Chat local e interactivo
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 'welcome', senderName: 'SISTEMA', text: '¡Bienvenidos a ATRAPAÍTO! 🇻🇪', timestamp: 'Ahora', isSystem: true },
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Burbujas de chat sobre perfiles
  const [activeBubbles, setActiveBubbles] = useState<Record<string, { text: string; id: number }>>({});

  useEffect(() => {
    const deadline = state.turnDeadlineAt || (turnExpiresAt ? new Date(turnExpiresAt).getTime() : Date.now() + 30000);
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeftSec(remaining);
    }, 500);

    return () => clearInterval(interval);
  }, [state.turnDeadlineAt, turnExpiresAt]);

  // Desplazar chat hacia abajo
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Manejar cambios en la descripción del juego para el chat reactivo
  useEffect(() => {
    if (state.lastActionDescription) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `log_${Date.now()}`,
          senderName: 'MESA',
          text: state.lastActionDescription || '',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSystem: true
        }
      ].slice(-40));

      const desc = state.lastActionDescription.toLowerCase();
      
      // Reacciones simuladas criollas
      if (desc.includes('atrapó') || desc.includes('capturó') || desc.includes('comió') || desc.includes('eliminó')) {
        const activeUser = state.currentTurnUserId;
        const otherUsers = state.playerOrder.filter((id) => id !== activeUser);
        
        if (otherUsers.length > 0) {
          const reactor = otherUsers[Math.floor(Math.random() * otherUsers.length)];
          const phrases = [
            '¡Ay papá, tremenda atrapada! 💥',
            '¡Te descuidaste, compay! 💀',
            '¡Eso dolió en el alma! 😂',
            '¡Pa\' la casa a llorar! 🏠'
          ];
          setTimeout(() => {
            const chosen = phrases[Math.floor(Math.random() * phrases.length)];
            triggerBubble(reactor, chosen);
            setChatMessages((prev) => [
              ...prev,
              {
                id: `react_${Date.now()}`,
                senderName: state.playerNames[reactor] || 'Oponente',
                text: chosen,
                timestamp: 'Ahora'
              }
            ]);
          }, 1000);
        }
      } else if (desc.includes('sacó un 6') || desc.includes('sacaste un 6')) {
        setTimeout(() => {
          triggerBubble(state.currentTurnUserId, '¡Un 6 glorioso! 🎲🔥');
        }, 300);
      }
    }
  }, [state.lastActionDescription]);

  const triggerBubble = (userId: string, text: string) => {
    setActiveBubbles((prev) => ({
      ...prev,
      [userId]: { text, id: Date.now() }
    }));
  };

  const handleSendQuickPhrase = (phrase: string) => {
    triggerBubble(currentUserId, phrase);
    setChatMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        senderName: (state.playerNames[currentUserId] || 'Tú').toUpperCase(),
        text: phrase,
        timestamp: 'Ahora'
      }
    ]);
  };

  const handleSendCustomChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    triggerBubble(currentUserId, chatInput);
    setChatMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        senderName: (state.playerNames[currentUserId] || 'Tú').toUpperCase(),
        text: chatInput,
        timestamp: 'Ahora'
      }
    ]);
    setChatInput('');
  };

  const handleRollDiceClick = () => {
    if (isDiceRolling || !isMyTurn) return;
    setIsDiceRolling(true);
    setTimeout(() => {
      setIsDiceRolling(false);
      onRollDice();
    }, 800);
  };

  const legalPieceIds = new Set(state.legalMoves.map((m) => m.pieceId));

  return (
    <div
      id="atrapaito-board-viewport"
      className="w-full max-w-full overflow-x-hidden min-h-[90vh] flex flex-col justify-between bg-gradient-to-br from-[#0c0316] via-[#140828] to-[#06010d] text-white p-2 sm:p-4 md:p-6"
    >
      {/* SECCIÓN 1: CONTENIDO PRINCIPAL */}
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* PANEL IZQUIERDO: INFORMACIÓN DE JUEGO Y TABLERO CENTRAL (COL 8) */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          
          {/* ENCABEZADO DE SALA */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl bg-[#170a2d]/50 backdrop-blur-md border border-purple-500/10 shadow-lg gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-600 to-amber-500 p-0.5 flex items-center justify-center shadow-md shadow-purple-950">
                <span className="text-2xl select-none">🇻🇪</span>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5 font-serif">
                    ATRAPAÍTO
                  </h1>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 font-mono font-bold px-2.5 py-0.5 rounded-full border border-purple-500/30">
                    {state.mode.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-purple-300/70 mt-0.5">
                  El emocionante parchís nacional con el pozo en juego • Respando La Olla
                </p>
              </div>
            </div>

            {/* RELOJ DE TURNO */}
            <div className="flex items-center space-x-3 bg-neutral-950/40 border border-purple-500/10 p-2 rounded-xl shrink-0">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-mono uppercase text-purple-300 tracking-wider">Turno Activo</span>
                <div className={`text-base font-black font-mono ${timeLeftSec <= 5 ? 'text-red-500 animate-pulse' : 'text-amber-400'}`}>
                  {timeLeftSec}s
                </div>
              </div>
              <div className="w-12 h-1 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${timeLeftSec <= 5 ? 'bg-red-500' : 'bg-amber-400'}`}
                  style={{ width: `${Math.min(100, (timeLeftSec / 30) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* MENSAJE DE ESTADO DE TURNO EN CURSO */}
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 shadow-xl transition-all ${
            isMyTurn
              ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 border-amber-500/50 text-amber-300 shadow-amber-950/25 ring-1 ring-amber-500/30'
              : 'bg-[#120723]/80 border-purple-950/60 text-purple-200'
          }`}>
            <div className="flex items-center space-x-3 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${activeColorTheme.bg}`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${activeColorTheme.bg}`}></span>
              </span>
              <span className="text-xs sm:text-sm font-bold truncate">
                {isMyTurn ? (
                  <span className="flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                    ¡ES TU TURNO DE JUGAR!
                  </span>
                ) : (
                  `Turno de: ${(state.playerNames[state.currentTurnUserId] || 'Oponente').toUpperCase()}`
                )}
              </span>
              <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-mono font-bold ${activeColorTheme.bg} text-neutral-950 shrink-0`}>
                {activeColor}
              </span>
            </div>

            {/* DADO E INTERFAZ DEL VALOR ANTERIOR */}
            {state.diceValue !== null && (
              <div className="flex items-center space-x-2 bg-neutral-950/60 px-3 py-1 rounded-xl border border-purple-500/10 font-mono shrink-0">
                <span className="text-[10px] text-purple-300">Dado:</span>
                <span className="text-sm font-black text-amber-400 animate-pulse">{state.diceValue}</span>
              </div>
            )}
          </div>

          {/* TABLERO SVG DE ATRAPAÍTO */}
          <div className="relative w-full aspect-square bg-[#0c0418]/90 rounded-3xl border-2 border-purple-900/40 p-2 sm:p-3 shadow-2xl overflow-hidden flex items-center justify-center">
            {/* Fondo con diseño geométrico sutil */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(88,28,135,0.15),transparent_70%)] pointer-events-none" />
            <AtrapaitoSVG
              state={state}
              currentUserId={currentUserId}
              legalPieceIds={legalPieceIds}
              onMovePiece={onMovePiece}
            />
          </div>

        </div>

        {/* PANEL DERECHO: CONTROLES DE PARTIDA & CHAT (COL 4) */}
        <div className="lg:col-span-4 flex flex-col space-y-4 h-full">

          {/* PANEL DE CONTROL DE LANZAMIENTO / PIEZAS */}
          <div className="bg-[#14092b]/70 backdrop-blur-md border border-purple-500/10 rounded-2xl p-4 shadow-xl flex flex-col space-y-4">
            <h3 className="text-xs font-mono font-bold text-purple-300 uppercase tracking-widest flex items-center gap-1.5 border-b border-purple-500/10 pb-2">
              <Dices className="w-3.5 h-3.5 text-amber-400" />
              Panel de Lanzamiento
            </h3>

            <div className="flex flex-col items-center justify-center py-2">
              <Dice3D value={state.diceValue} isRolling={isDiceRolling} />
              
              {state.turnPhase === 'ROLL_DICE' && isMyTurn ? (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleRollDiceClick}
                  disabled={isDiceRolling}
                  className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:from-amber-400 hover:to-yellow-300 text-neutral-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 border border-white/20 flex items-center justify-center space-x-2 cursor-pointer touch-manipulation active:scale-95 transition-transform"
                >
                  <Dices className="w-4 h-4 animate-spin" />
                  <span>LANZAR DADO</span>
                </motion.button>
              ) : state.turnPhase === 'SELECT_PIECE' && isMyTurn ? (
                <div className="mt-4 w-full p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center space-y-1">
                  <Zap className="w-4 h-4 text-amber-400 mx-auto animate-bounce" />
                  <div className="text-[10px] font-bold text-amber-300 uppercase">
                    SELECCIONA TU FICHA EN EL TABLERO
                  </div>
                  <p className="text-[9px] text-neutral-400">
                    O presiona una de las fichas de abajo:
                  </p>
                </div>
              ) : (
                <div className="mt-4 w-full p-3 rounded-xl bg-neutral-950/50 border border-purple-500/5 text-center text-[10px] text-purple-300/70 font-mono">
                  {isMyTurn ? 'Procesando movimiento...' : `Esperando a ${state.playerNames[state.currentTurnUserId] || 'oponente'}...`}
                </div>
              )}
            </div>

            {/* LISTA DE FICHAS CON MOVIMIENTOS LEGALES */}
            {isMyTurn && state.legalMoves.length > 0 && (
              <div className="bg-neutral-950/60 border border-purple-900/20 rounded-xl p-3 space-y-2">
                <span className="text-[9px] font-bold text-purple-300 uppercase block tracking-wider">
                  Tus Movimientos Disponibles:
                </span>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {state.legalMoves.map((m) => {
                    const piece = state.pieces[m.pieceId];
                    const colorTheme = COLOR_MAP[piece?.color || 'yellow'];
                    return (
                      <motion.button
                        key={m.pieceId}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onMovePiece(m.pieceId)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black font-mono flex items-center space-x-1 cursor-pointer bg-neutral-900 text-${piece?.color}-400 hover:bg-neutral-850 active:scale-95 transition-transform touch-manipulation ${colorTheme.border}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${colorTheme.bg}`} />
                        <span>Ficha #{piece?.pieceNumber}</span>
                        <span className="bg-purple-500/20 text-purple-300 px-1 py-0.5 rounded text-[9px]">+{m.steps}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* LISTA DE JUGADORES, VIDAS Y AVATARES */}
          <div className="bg-[#14092b]/70 backdrop-blur-md border border-purple-500/10 rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-xs font-mono font-bold text-purple-300 uppercase tracking-widest flex items-center gap-1.5 border-b border-purple-500/10 pb-2">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              Jugadores ({state.playerOrder.length}/4)
            </h3>

            <div className="grid grid-cols-1 gap-2">
              {state.playerOrder.map((uId) => {
                const player = state.players[uId];
                if (!player) return null;
                const isCurrent = uId === state.currentTurnUserId;
                const isUser = uId === currentUserId;
                const lives = state.lives[uId] ?? 3;

                // Buscar datos adicionales del perfil real
                const realProfile = players.find((p) => p.userId === uId);
                const avatar = realProfile?.avatarUrl;
                const primaryColor = player.colors[0] || 'yellow';
                const colTheme = COLOR_MAP[primaryColor] || COLOR_MAP.yellow;

                // Iniciales si no tiene avatar
                const initials = (player.name || '?').substring(0, 2).toUpperCase();

                // Revisar burbuja de diálogo flotante activa
                const activeBubble = activeBubbles[uId];
                const showBubble = activeBubble && (Date.now() - activeBubble.id < 3000);

                return (
                  <div
                    key={uId}
                    className={`p-2 rounded-xl border relative transition-all duration-300 ${
                      isCurrent
                        ? 'bg-gradient-to-r from-purple-900/30 to-purple-800/10 border-amber-500/40 ring-1 ring-amber-500/20'
                        : 'bg-neutral-950/60 border-purple-950/80 hover:bg-neutral-950'
                    }`}
                  >
                    {/* BURBUJA DE CHAT FLOTANTE */}
                    <AnimatePresence>
                      {showBubble && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="absolute -top-10 left-10 z-20 bg-amber-400 text-neutral-950 font-extrabold text-[10px] px-3 py-1 rounded-xl shadow-lg border border-amber-300 flex items-center space-x-1"
                        >
                          <MessageCircle className="w-3 h-3 shrink-0" />
                          <span>{activeBubble.text}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        {/* Avatar / Iniciales */}
                        <div className="relative shrink-0">
                          {avatar ? (
                            <img
                              src={avatar}
                              alt={player.name}
                              referrerPolicy="no-referrer"
                              className={`w-8 h-8 rounded-full border-2 object-cover ${colTheme.border}`}
                            />
                          ) : (
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs bg-neutral-800 text-purple-300 ${colTheme.border}`}>
                              {initials}
                            </div>
                          )}
                          {/* Indicador de Turno */}
                          {isCurrent && (
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center space-x-1">
                            <span className="font-extrabold text-white truncate max-w-[100px]">
                              {player.name}
                            </span>
                            {isUser && (
                              <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1 py-0.2 rounded font-mono uppercase font-black shrink-0">
                                TÚ
                              </span>
                            )}
                          </div>
                          
                          {/* Colores asignados */}
                          <div className="flex items-center space-x-1 mt-0.5">
                            {player.colors.map((c) => (
                              <span
                                key={c}
                                className={`text-[8px] font-bold px-1 py-0.2 rounded-full text-neutral-950 ${COLOR_MAP[c]?.bg}`}
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Vidas */}
                      <div className="flex items-center space-x-0.5 shrink-0">
                        {[1, 2, 3].map((heartNum) => (
                          <Heart
                            key={heartNum}
                            className={`w-3.5 h-3.5 transition-all duration-300 ${
                              heartNum <= lives
                                ? 'text-red-500 fill-red-500 drop-shadow-[0_0_2px_rgba(239,68,68,0.5)] animate-pulse'
                                : 'text-neutral-700 fill-neutral-900'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECCIÓN DE CHAT DE VENEZUELA EN VIVO */}
          <div className="bg-[#14092b]/70 backdrop-blur-md border border-purple-500/10 rounded-2xl p-4 shadow-xl flex flex-col space-y-3 h-64">
            <h3 className="text-xs font-mono font-bold text-purple-300 uppercase tracking-widest flex items-center gap-1.5 border-b border-purple-500/10 pb-2">
              <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
              Chat Criollo de Mesa
            </h3>

            {/* Lista de Mensajes */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-[11px] font-mono scrollbar-thin scrollbar-thumb-purple-900">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-1.5 rounded-lg leading-relaxed ${
                    msg.isSystem
                      ? 'bg-purple-950/40 text-purple-300/80 italic text-center text-[10px] border border-purple-950'
                      : 'bg-neutral-950/40 border border-neutral-900'
                  }`}
                >
                  {!msg.isSystem && (
                    <span className="font-extrabold text-amber-400 block mb-0.5">
                      {msg.senderName}:
                    </span>
                  )}
                  <span>{msg.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Envío rápido de frases criollas */}
            <div className="border-t border-purple-500/10 pt-2">
              <div className="flex overflow-x-auto gap-1 pb-1 scrollbar-none">
                {QUICK_PHRASES.map((phrase, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendQuickPhrase(phrase)}
                    className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[9px] font-bold hover:bg-purple-500/25 transition-colors whitespace-nowrap shrink-0 text-purple-300"
                  >
                    {phrase}
                  </button>
                ))}
              </div>

              {/* Input manual */}
              <form onSubmit={handleSendCustomChat} className="flex gap-1.5 mt-1.5">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 bg-neutral-950/80 border border-purple-500/20 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  className="p-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

// ==============================================================================
// TABLERO SVG COMPLETO DE ATRAPAÍTO / PARCHÍS VENEZOLANO
// ==============================================================================
interface AtrapaitoSVGProps {
  state: AtrapaitoState;
  currentUserId: string;
  legalPieceIds: Set<string>;
  onMovePiece: (pieceId: string) => void;
}

const AtrapaitoSVG: React.FC<AtrapaitoSVGProps> = ({
  state,
  currentUserId,
  legalPieceIds,
  onMovePiece,
}) => {
  // Dimensiones del canvas SVG (500x500 para 4 colores)
  return (
    <svg viewBox="0 0 500 500" className="w-full h-full select-none" id="atrapaito-svg-canvas">
      {/* FONDO PRINCIPAL DEL TABLERO */}
      <rect x="0" y="0" width="500" height="500" fill="#0d041c" rx="20" stroke="#581c87" strokeWidth="2" />

      {/* CASAS / BASES DE LOS 4 COLORES CON NEONES GRADIENTES */}
      {/* Top-Left: AMARILLO */}
      <rect x="10" y="10" width="190" height="190" fill="#eab308" rx="16" opacity="0.85" />
      <rect x="30" y="30" width="150" height="150" fill="#090514" rx="12" stroke="#eab308" strokeWidth="2" />

      {/* Top-Right: ROJO */}
      <rect x="300" y="10" width="190" height="190" fill="#dc2626" rx="16" opacity="0.85" />
      <rect x="320" y="30" width="150" height="150" fill="#090514" rx="12" stroke="#dc2626" strokeWidth="2" />

      {/* Bottom-Right: VERDE */}
      <rect x="300" y="300" width="190" height="190" fill="#10b981" rx="16" opacity="0.85" />
      <rect x="320" y="320" width="150" height="150" fill="#090514" rx="12" stroke="#10b981" strokeWidth="2" />

      {/* Bottom-Left: AZUL */}
      <rect x="10" y="300" width="190" height="190" fill="#2563eb" rx="16" opacity="0.85" />
      <rect x="30" y="320" width="150" height="150" fill="#090514" rx="12" stroke="#2563eb" strokeWidth="2" />

      {/* META CENTRAL EN TRIÁNGULOS DE COLORES */}
      <polygon points="200,200 250,250 200,300" fill="#2563eb" opacity="0.9" stroke="#ffffff" strokeWidth="1" />
      <polygon points="200,200 250,250 300,200" fill="#eab308" opacity="0.9" stroke="#ffffff" strokeWidth="1" />
      <polygon points="300,200 250,250 300,300" fill="#dc2626" opacity="0.9" stroke="#ffffff" strokeWidth="1" />
      <polygon points="200,300 250,250 300,300" fill="#10b981" opacity="0.9" stroke="#ffffff" strokeWidth="1" />
      
      <circle cx="250" cy="250" r="24" fill="#0a0214" stroke="#f59e0b" strokeWidth="3" />
      <text x="250" y="254" textAnchor="middle" fill="#f59e0b" fontSize="9" fontWeight="900" letterSpacing="1">OLLA</text>

      {/* CASILLAS Y PASILLOS PRINCIPALES */}
      {/* Pasillo Amarillo Top (X: 200..300, Y: 10..200) */}
      <rect x="200" y="10" width="100" height="190" fill="#0e061b" stroke="#3b0764" strokeWidth="1.5" />
      <rect x="233" y="10" width="34" height="190" fill="#eab308" opacity="0.25" />

      {/* Pasillo Rojo Right (X: 300..490, Y: 200..300) */}
      <rect x="300" y="200" width="190" height="100" fill="#0e061b" stroke="#3b0764" strokeWidth="1.5" />
      <rect x="300" y="233" width="190" height="34" fill="#dc2626" opacity="0.25" />

      {/* Pasillo Verde Bottom (X: 200..300, Y: 300..490) */}
      <rect x="200" y="300" width="100" height="190" fill="#0e061b" stroke="#3b0764" strokeWidth="1.5" />
      <rect x="233" y="300" width="34" height="190" fill="#10b981" opacity="0.25" />

      {/* Pasillo Azul Left (X: 10..200, Y: 200..300) */}
      <rect x="10" y="200" width="190" height="100" fill="#0e061b" stroke="#3b0764" strokeWidth="1.5" />
      <rect x="10" y="233" width="190" height="34" fill="#2563eb" opacity="0.25" />

      {/* DIVISIONES EN CUADRÍCULA DE PASILLOS */}
      {/* Líneas horizontales/verticales sutiles para delimitar casillas */}
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i}>
          {/* Top Column */}
          <line x1="200" y1={10 + i * 27} x2="300" y2={10 + i * 27} stroke="#3b0764" strokeWidth="1" opacity="0.5" />
          {/* Bottom Column */}
          <line x1="200" y1={300 + i * 27} x2="300" y2={300 + i * 27} stroke="#3b0764" strokeWidth="1" opacity="0.5" />
          {/* Left Row */}
          <line x1={10 + i * 27} y1="200" x2={10 + i * 27} y2="300" stroke="#3b0764" strokeWidth="1" opacity="0.5" />
          {/* Right Row */}
          <line x1={300 + i * 27} y1="200" x2={300 + i * 27} y2="300" stroke="#3b0764" strokeWidth="1" opacity="0.5" />
        </g>
      ))}

      {/* SEGURIDADES / CASILLAS SALVAS (Círculos decorativos) */}
      <circle cx="216" cy="37" r="6" fill="#eab308" opacity="0.7 animate-pulse" />
      <circle cx="463" cy="216" r="6" fill="#dc2626" opacity="0.7 animate-pulse" />
      <circle cx="284" cy="463" r="6" fill="#10b981" opacity="0.7 animate-pulse" />
      <circle cx="37" cy="284" r="6" fill="#2563eb" opacity="0.7 animate-pulse" />

      {/* RENDERIZADO DE FICHAS CON HALOS Y DESTELLOS */}
      {(Object.values(state.pieces) as AtrapaitoPiece[]).map((piece) => {
        const isLegal = legalPieceIds.has(piece.id);
        const coords = getPieceSVGCoordinates(piece);

        return (
          <g
            key={piece.id}
            onClick={() => isLegal && onMovePiece(piece.id)}
            className={`transition-all duration-300 ${isLegal ? 'cursor-pointer' : ''}`}
            id={`atrapaito-piece-${piece.id}`}
          >
            {/* Halo brillante para fichas con movimiento legal */}
            {isLegal && (
              <circle
                cx={coords.x}
                cy={coords.y}
                r="18"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.5"
                className="animate-ping"
                style={{ transformOrigin: `${coords.x}px ${coords.y}px` }}
              />
            )}

            <circle
              cx={coords.x}
              cy={coords.y}
              r="13"
              fill={COLOR_MAP[piece.color]?.hex || '#ffffff'}
              stroke="#ffffff"
              strokeWidth="2"
              className="drop-shadow-lg"
            />
            
            <circle
              cx={coords.x}
              cy={coords.y}
              r="9"
              fill="none"
              stroke="rgba(0,0,0,0.25)"
              strokeWidth="1.5"
            />

            <text
              x={coords.x}
              y={coords.y + 3.5}
              textAnchor="middle"
              fill="#090114"
              fontSize="10"
              fontWeight="900"
              fontFamily="monospace"
            >
              {piece.pieceNumber}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// Convierte la posición lógica de una ficha en coordenadas X,Y dentro del canvas SVG (500x500)
function getPieceSVGCoordinates(piece: AtrapaitoPiece): { x: number; y: number } {
  // 1. Casa / Home Base
  if (piece.state === 'HOME' || piece.position === 0) {
    const offsets = [
      { x: 65, y: 65 },
      { x: 135, y: 65 },
      { x: 65, y: 135 },
      { x: 135, y: 135 },
      { x: 100, y: 65 },
      { x: 100, y: 135 },
    ];
    const offset = offsets[(piece.pieceNumber - 1) % offsets.length];

    if (piece.color === 'yellow') return { x: offset.x, y: offset.y };
    if (piece.color === 'red') return { x: 300 + offset.x, y: offset.y };
    if (piece.color === 'green') return { x: 300 + offset.x, y: 300 + offset.y };
    if (piece.color === 'blue') return { x: offset.x, y: 300 + offset.y };
  }

  // 2. Meta final alcanzada
  if (piece.state === 'FINISHED' || piece.position === 999) {
    if (piece.color === 'yellow') return { x: 250, y: 215 };
    if (piece.color === 'red') return { x: 285, y: 250 };
    if (piece.color === 'green') return { x: 250, y: 285 };
    if (piece.color === 'blue') return { x: 215, y: 250 };
  }

  // 3. Pasillo Final (101 a 108)
  if (piece.state === 'FINAL_PATH' || piece.position >= 101) {
    const step = piece.position - 100;
    if (piece.color === 'yellow') return { x: 250, y: 20 + step * 20 };
    if (piece.color === 'red') return { x: 480 - step * 20, y: 250 };
    if (piece.color === 'green') return { x: 250, y: 480 - step * 20 };
    if (piece.color === 'blue') return { x: 20 + step * 20, y: 250 };
  }

  // 4. Recorrido Principal (Circuito 1 a 68)
  const pos = piece.position;
  if (pos >= 1 && pos <= 17) {
    return { x: 200 + (pos % 3) * 33, y: 20 + Math.floor(pos / 3) * 28 };
  } else if (pos >= 18 && pos <= 34) {
    return { x: 320 + Math.floor((pos - 18) / 3) * 28, y: 200 + ((pos - 18) % 3) * 33 };
  } else if (pos >= 35 && pos <= 51) {
    return { x: 280 - (pos % 3) * 33, y: 320 + Math.floor((pos - 35) / 3) * 28 };
  } else {
    return { x: 180 - Math.floor((pos - 52) / 3) * 28, y: 280 - ((pos - 52) % 3) * 33 };
  }
}

// COMPONENTE DADO 3D CON CSS Y ENFOQUE INTERACTIVO TÁCTIL
const Dice3D: React.FC<{ value: number | null; isRolling: boolean }> = ({ value, isRolling }) => {
  const [localRolling, setLocalRolling] = useState(false);

  useEffect(() => {
    if (isRolling) {
      setLocalRolling(true);
      const t = setTimeout(() => setLocalRolling(false), 800);
      return () => clearTimeout(t);
    }
  }, [isRolling]);

  const val = value || 1;

  // Pip positions helpers
  const getPips = (v: number) => {
    switch (v) {
      case 1:
        return [{ row: 2, col: 2 }];
      case 2:
        return [{ row: 1, col: 1 }, { row: 3, col: 3 }];
      case 3:
        return [{ row: 1, col: 1 }, { row: 2, col: 2 }, { row: 3, col: 3 }];
      case 4:
        return [{ row: 1, col: 1 }, { row: 1, col: 3 }, { row: 3, col: 1 }, { row: 3, col: 3 }];
      case 5:
        return [{ row: 1, col: 1 }, { row: 1, col: 3 }, { row: 2, col: 2 }, { row: 3, col: 1 }, { row: 3, col: 3 }];
      case 6:
        return [
          { row: 1, col: 1 }, { row: 1, col: 3 },
          { row: 2, col: 1 }, { row: 2, col: 3 },
          { row: 3, col: 1 }, { row: 3, col: 3 }
        ];
      default:
        return [];
    }
  };

  return (
    <motion.div
      animate={localRolling ? {
        rotate: [0, 180, 360, 540, 720],
        scale: [1, 1.25, 1.1, 0.9, 1],
        x: [0, -10, 15, -5, 0],
        y: [0, -15, 10, -5, 0],
      } : {}}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="w-16 h-16 bg-gradient-to-br from-amber-400 via-yellow-200 to-amber-500 rounded-2xl p-3 shadow-[0_8px_25px_rgba(245,158,11,0.4)] flex items-center justify-center border-2 border-white/40 cursor-pointer relative shrink-0 select-none"
    >
      <div className="grid grid-cols-3 grid-rows-3 gap-1 w-full h-full relative">
        {getPips(val).map((pip, idx) => (
          <div
            key={idx}
            className="bg-neutral-950 rounded-full w-2.5 h-2.5 shadow-inner"
            style={{
              gridRowStart: pip.row,
              gridColumnStart: pip.col,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
};
