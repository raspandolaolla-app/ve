// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: DAMAS VENEZOLANAS
// ==============================================================================
// • Diseño premium de madera real con fichas 3D realistas
// • 3 TEMAS seleccionables en partida: Caoba Clásica / Paño Verde Pro / Tricolor
// • Compatible 100% con Supabase y GameContainer
// ==============================================================================

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Trophy, Zap, Palette } from 'lucide-react';
import type { CheckersState, CheckersMove } from '../../../types/games';
import { PlayerLives } from './PlayerLives';
import { TurnTimer } from './TurnTimer';
import { GameRepository } from '../../../services/repositories/GameRepository';

interface CheckersBoardProps {
  state: CheckersState;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
  onMovePiece: (move: CheckersMove) => void;
}

// ==============================================================================
// SISTEMA DE TEMAS (3 DISEÑOS SELECCIONABLES EN PARTIDA)
// ==============================================================================
type ThemeKey = 'caoba' | 'verde' | 'tricolor';

const THEMES: Record<ThemeKey, any> = {
  caoba: {
    label: 'Caoba Clásica',
    swatch: ['#8B5A2B', '#E8D5B7', '#3A2010'],
    darkCell: 'linear-gradient(135deg, #6D4C33 0%, #5D4027 50%, #4E341E 100%)',
    lightCell: 'linear-gradient(135deg, #EFDFC0 0%, #E8D5B7 50%, #DCC69F 100%)',
    frame: 'linear-gradient(145deg, #8B5A2B 0%, #7A4A22 25%, #6B4423 50%, #5C3A1E 75%, #4E2E17 100%)',
    p1Piece: 'radial-gradient(circle at 32% 28%, #F5E6D3 0%, #E8D5B7 25%, #C9A876 55%, #A8865A 80%, #8B6B43 100%)',
    p2Piece: 'radial-gradient(circle at 32% 28%, #6B4423 0%, #4E2E17 25%, #3A2010 55%, #2A160A 80%, #1A0D05 100%)',
    p1Ring: 'rgba(139, 107, 67, 0.6)',
    p2Ring: 'rgba(201, 168, 118, 0.35)',
    p1Crown: '#B8860B',
    p2Crown: '#FFD700',
    accent: '#FFC94B',
    text: '#F0E2C8',
    sub: '#A8865A',
    panel: 'linear-gradient(145deg, #2B1D14 0%, #1C120C 100%)',
    border: '#3E2B1F',
  },
  verde: {
    label: 'Paño Verde Pro',
    swatch: ['#0E5A34', '#FAF0E1', '#8B3A3A'],
    darkCell: 'linear-gradient(135deg, #0B4A2C 0%, #093D25 50%, #07301D 100%)',
    lightCell: 'linear-gradient(135deg, #F5EFDD 0%, #EAE0C8 50%, #DFD4B8 100%)',
    frame: 'linear-gradient(145deg, #6B4423 0%, #4E2E17 50%, #3A2010 100%)',
    p1Piece: 'radial-gradient(circle at 32% 28%, #FFFFFF 0%, #FAF0E1 25%, #E8DCC8 55%, #D5C7AA 80%, #BFAE8C 100%)',
    p2Piece: 'radial-gradient(circle at 32% 28%, #A0522D 0%, #8B3A3A 30%, #6B2A2A 60%, #4A1D1D 100%)',
    p1Ring: 'rgba(139, 107, 67, 0.5)',
    p2Ring: 'rgba(255, 200, 150, 0.3)',
    p1Crown: '#B8860B',
    p2Crown: '#FFD700',
    accent: '#FFC94B',
    text: '#F5EFDD',
    sub: '#9CC4A8',
    panel: 'linear-gradient(145deg, rgba(10,40,25,0.92) 0%, rgba(5,25,15,0.92) 100%)',
    border: '#147A46',
  },
  tricolor: {
    label: 'Tricolor Noche',
    swatch: ['#FFD100', '#003DA5', '#EF3340'],
    darkCell: 'linear-gradient(135deg, #0A2A5C 0%, #08234C 50%, #061A3A 100%)',
    lightCell: 'linear-gradient(135deg, #F0F4FA 0%, #E2E9F4 50%, #DCE4F0 100%)',
    frame: 'linear-gradient(145deg, #0A2A5C 0%, #061A3A 100%)',
    p1Piece: 'radial-gradient(circle at 32% 28%, #FFFFFF 0%, #F5F8FC 25%, #E2E9F4 55%, #CBD6E6 80%, #AEBDD4 100%)',
    p2Piece: 'radial-gradient(circle at 32% 28%, #B32430 0%, #8B1E2D 30%, #6B1420 60%, #4A0D16 100%)',
    p1Ring: 'rgba(255, 209, 0, 0.55)',
    p2Ring: 'rgba(255, 209, 0, 0.35)',
    p1Crown: '#B8860B',
    p2Crown: '#FFD100',
    accent: '#FFD100',
    text: '#EAF2FF',
    sub: '#8FA8CC',
    panel: 'linear-gradient(145deg, #0A2A5C 0%, #061A3A 100%)',
    border: '#123B7A',
  },
};

// ==============================================================================
// COMPONENTE: FICHA DE DAMA REALISTA 3D (CON TEMA)
// ==============================================================================
const CheckerPiece: React.FC<{
  player: number;
  isKing: boolean;
  isSelected: boolean;
  theme: any;
}> = ({ player, isKing, isSelected, theme }) => {
  const isP1 = player === 1;

  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`relative w-[82%] h-[82%] rounded-full ${isSelected ? 'scale-110' : ''}`}
      style={{
        background: isP1 ? theme.p1Piece : theme.p2Piece,
        boxShadow: `
          0 4px 8px rgba(0, 0, 0, 0.5),
          0 2px 4px rgba(0, 0, 0, 0.4),
          inset 0 2px 3px rgba(255, 255, 255, ${isP1 ? '0.5' : '0.15'}),
          inset 0 -3px 5px rgba(0, 0, 0, 0.4)
        `,
      }}
    >
      {/* Anillo exterior tallado */}
      <div
        className="absolute inset-[8%] rounded-full"
        style={{
          border: `2px solid ${isP1 ? theme.p1Ring : theme.p2Ring}`,
          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.3)',
        }}
      />

      {/* Anillo medio tallado */}
      <div
        className="absolute inset-[20%] rounded-full"
        style={{
          border: `1.5px solid ${isP1 ? theme.p1Ring : theme.p2Ring}`,
          opacity: 0.7,
        }}
      />

      {/* Centro elevado */}
      <div
        className="absolute inset-[32%] rounded-full"
        style={{
          background: isP1 ? theme.p1Piece : theme.p2Piece,
          boxShadow: `
            0 1px 2px rgba(0, 0, 0, 0.3),
            inset 0 1px 2px rgba(255, 255, 255, ${isP1 ? '0.4' : '0.1'})
          `,
        }}
      >
        {/* Corona para Damas */}
        {isKing && (
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Crown
              className="w-[80%] h-[80%]"
              style={{
                color: isP1 ? theme.p1Crown : theme.p2Crown,
                filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))',
                strokeWidth: 2.5,
              }}
            />
          </motion.div>
        )}
      </div>

      {/* Brillo superior */}
      <div
        className="absolute top-[6%] left-[18%] right-[18%] h-[22%] rounded-full pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.45), transparent)',
          filter: 'blur(1px)',
        }}
      />

      {/* Halo de selección */}
      {isSelected && (
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="absolute -inset-1 rounded-full pointer-events-none"
          style={{
            boxShadow: `0 0 0 3px ${theme.accent}CC, 0 0 20px ${theme.accent}99`,
          }}
        />
      )}
    </motion.div>
  );
};

// ==============================================================================
// COMPONENTE PRINCIPAL DEL TABLERO
// ==============================================================================
export const CheckersBoard: React.FC<CheckersBoardProps> = ({
  state,
  currentUserId,
  turnExpiresAt,
  sessionId,
  onMovePiece,
}) => {
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);

  // ----- Tema (persistente) -----
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    try {
      const saved = localStorage.getItem('rlo_checkers_theme');
      if (saved && THEMES[saved as ThemeKey]) return saved as ThemeKey;
    } catch {}
    return 'caoba';
  });
  const T = THEMES[themeKey];
  const changeTheme = (k: ThemeKey) => {
    setThemeKey(k);
    try { localStorage.setItem('rlo_checkers_theme', k); } catch {}
  };

  const isMyTurn = state.turnUserId === currentUserId && state.status === 'playing';
  const myPlayer = state.players.find((p) => p.userId === currentUserId);
  const isPlayer1 = myPlayer?.playerNumber === 1;

  const getLogicalCoords = (vr: number, vc: number) => {
    return {
      row: isPlayer1 ? 7 - vr : vr,
      col: isPlayer1 ? 7 - vc : vc,
    };
  };

  const handleCellClick = (vr: number, vc: number) => {
    if (!isMyTurn) return;

    const { row, col } = getLogicalCoords(vr, vc);
    const clickedPiece = state.board[row][col];

    if (selectedCell) {
      if (selectedCell.row === row && selectedCell.col === col) {
        setSelectedCell(null);
        return;
      }

      if (!clickedPiece) {
        onMovePiece({
          from: selectedCell,
          to: { row, col },
        });
        setSelectedCell(null);
        return;
      }
    }

    if (clickedPiece && clickedPiece.userId === currentUserId) {
      setSelectedCell({ row, col });
    }
  };

  const handleTimeout = () => {
    if (isMyTurn && sessionId) {
      GameRepository.expireTurn(sessionId);
    }
  };

  const activeTurnPlayer = state.players.find((p) => p.userId === state.turnUserId);

  return (
    <div id="checkers-board-container" className="flex flex-col items-center justify-center p-2 sm:p-4 max-w-xl mx-auto w-full game-immersive-container select-none">

      {/* ===== BARRA DE TEMAS (3 DISEÑOS) ===== */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full mb-2.5 flex items-center justify-between px-3 py-2 rounded-xl border"
        style={{ background: T.panel, borderColor: T.border }}
      >
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4" style={{ color: T.accent }} />
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.sub }}>
            Mesa:
          </span>
          <div className="flex items-center gap-1.5">
            {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => changeTheme(k)}
                title={THEMES[k].label}
                className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg border transition-all"
                style={{
                  borderColor: themeKey === k ? THEMES[k].accent : T.border,
                  background: themeKey === k ? 'rgba(255,255,255,0.1)' : 'transparent',
                  boxShadow: themeKey === k ? `0 0 10px ${THEMES[k].accent}55` : 'none',
                }}
              >
                {THEMES[k].swatch.map((c: string, i: number) => (
                  <span key={i} className="w-2.5 h-2.5 rounded-full border border-black/30" style={{ background: c }} />
                ))}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider" style={{ color: T.accent }}>
          {T.label}
        </span>
      </motion.div>

      {/* ===== MARCADOR SUPERIOR ===== */}
      <div id="checkers-scoreboard" className="grid grid-cols-2 gap-2 sm:gap-3 w-full mb-3">
        {state.players.map((p, index) => {
          const pLives = (state.lives && state.lives[p.userId] !== undefined) ? state.lives[p.userId] : 3;
          const uppercaseName = (p.name || 'JUGADOR').toUpperCase();
          const isActive = state.turnUserId === p.userId && state.status === 'playing';
          const captures = state.capturedCount[p.userId] || 0;
          const isP1 = p.playerNumber === 1;

          return (
            <motion.div
              key={p.userId}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              id={`checkers-player-card-${p.userId}`}
              className={`relative p-3 rounded-xl border-2 transition-all duration-300 overflow-hidden ${
                isActive ? '' : ''
              }`}
              style={{
                background: T.panel,
                borderColor: isActive ? T.accent : T.border,
                boxShadow: isActive
                  ? `0 6px 20px ${T.accent}40, inset 0 1px 0 rgba(255, 220, 150, 0.15)`
                  : '0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 220, 150, 0.08)',
              }}
            >
              {isActive && (
                <motion.div
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: `linear-gradient(to right, transparent, ${T.accent}, transparent)` }}
                />
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate min-w-0">
                  {/* Miniatura de ficha real */}
                  <div
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full shrink-0 relative"
                    style={{
                      background: isP1 ? T.p1Piece : T.p2Piece,
                      boxShadow: '0 3px 6px rgba(0, 0, 0, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.3), inset 0 -2px 3px rgba(0, 0, 0, 0.4)',
                    }}
                  >
                    <div
                      className="absolute inset-[25%] rounded-full"
                      style={{ border: `1.5px solid ${isP1 ? T.p1Ring : T.p2Ring}` }}
                    />
                  </div>

                  <div className="truncate min-w-0">
                    <div className="text-xs sm:text-sm font-bold truncate max-w-[90px] sm:max-w-[110px] leading-tight" style={{ color: T.text }}>
                      {uppercaseName}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {p.userId === currentUserId && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-mono font-bold uppercase" style={{ color: T.accent }}>
                          <Zap className="w-2.5 h-2.5" />
                          TÚ
                        </span>
                      )}
                      {isActive && (
                        <span className="text-[9px] font-mono uppercase animate-pulse" style={{ color: T.accent }}>
                          • Turno
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Capturas */}
                <div className="flex flex-col items-end">
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: T.sub }}>Capturas</span>
                  <motion.span
                    key={captures}
                    initial={{ scale: 1.4, color: T.accent }}
                    animate={{ scale: 1, color: T.text }}
                    className="text-xl sm:text-2xl font-black font-mono leading-none"
                  >
                    {captures}
                  </motion.span>
                </div>
              </div>

              {/* Vidas */}
              <div className="pt-2 mt-2 border-t" style={{ borderColor: T.border }}>
                <PlayerLives lives={pLives} size="sm" showText={false} />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ===== TEMPORIZADOR ===== */}
      <div className="w-full mb-3">
        <TurnTimer
          turnExpiresAt={turnExpiresAt}
          durationSeconds={30}
          isMyTurn={isMyTurn}
          activePlayerName={activeTurnPlayer?.name || 'OPONENTE'}
          status={state.status}
          onTimeout={handleTimeout}
        />
      </div>

      {/* ===== INDICADOR DE COLOR ===== */}
      <div
        id="checkers-color-indicator"
        className="w-full flex items-center justify-between px-3 py-2 mb-3 rounded-xl border"
        style={{
          background: T.panel,
          borderColor: T.border,
          boxShadow: 'inset 0 1px 0 rgba(255, 220, 150, 0.08)',
        }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.sub }}>Tu color:</span>
        <span className="flex items-center space-x-1.5">
          <span
            className="w-3.5 h-3.5 rounded-full inline-block"
            style={{
              background: isPlayer1 ? T.p1Piece : T.p2Piece,
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.3)',
            }}
          />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider" style={{ color: T.text }}>
            {isPlayer1 ? 'Claras (abajo)' : 'Oscuras (abajo)'}
          </span>
        </span>
      </div>

      {/* ===== BANNER DE VICTORIA ===== */}
      <AnimatePresence>
        {state.status !== 'playing' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="mb-3 text-center"
          >
            <div
              className="inline-flex items-center space-x-2 px-5 py-3 rounded-xl font-black text-sm relative overflow-hidden"
              style={{
                background: `linear-gradient(145deg, ${T.accent} 0%, ${T.accent}CC 100%)`,
                color: '#1A120C',
                boxShadow: `0 8px 24px ${T.accent}66, inset 0 2px 3px rgba(255, 255, 255, 0.5)`,
              }}
            >
              <Trophy className="w-5 h-5" />
              <span>
                ¡PARTIDA CONCLUIDA! GANADOR: {(state.players.find((p) => p.userId === state.winnerUserId)?.name || 'EMPATE').toUpperCase()}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== TABLERO DE MADERA PREMIUM (CON TEMA) ===== */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="w-full max-w-[380px] sm:max-w-[460px] rounded-xl p-2.5 sm:p-3.5"
        style={{
          background: T.frame,
          boxShadow: `
            0 20px 50px rgba(0, 0, 0, 0.7),
            0 8px 20px rgba(0, 0, 0, 0.5),
            inset 0 2px 3px rgba(255, 220, 150, 0.3),
            inset 0 -2px 4px rgba(0, 0, 0, 0.5)
          `,
        }}
      >
        <div
          className="rounded-lg p-1.5 sm:p-2"
          style={{
            background: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0px, transparent 2px, transparent 6px, rgba(0,0,0,0.06) 8px)',
          }}
        >
          <div
            id="checkers-grid"
            className="grid grid-cols-8 gap-0 rounded-md overflow-hidden w-full aspect-square"
            style={{ boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.6)' }}
          >
            {Array.from({ length: 8 }).map((_, vr) =>
              Array.from({ length: 8 }).map((_, vc) => {
                const { row: rIdx, col: cIdx } = getLogicalCoords(vr, vc);
                const piece = state.board[rIdx][cIdx];
                const isDarkCell = (rIdx + cIdx) % 2 === 1;
                const isSelected = selectedCell?.row === rIdx && selectedCell?.col === cIdx;
                const isLastMove =
                  (state.lastMove?.from.row === rIdx && state.lastMove?.from.col === cIdx) ||
                  (state.lastMove?.to.row === rIdx && state.lastMove?.to.col === cIdx);
                const isMyPiece = piece && piece.userId === currentUserId;

                return (
                  <div
                    key={`${vr}_${vc}`}
                    id={`checkers-cell-${vr}-${vc}`}
                    onClick={() => handleCellClick(vr, vc)}
                    className={`relative flex items-center justify-center select-none aspect-square ${
                      isMyTurn && (isMyPiece || (!piece && isDarkCell)) ? 'cursor-pointer' : 'cursor-default'
                    }`}
                    style={{
                      background: isDarkCell ? T.darkCell : T.lightCell,
                      boxShadow: isDarkCell
                        ? 'inset 0 1px 2px rgba(0, 0, 0, 0.25)'
                        : 'inset 0 1px 1px rgba(255, 255, 255, 0.4)',
                    }}
                  >
                    {/* Textura sutil de veta */}
                    <div
                      className="absolute inset-0 pointer-events-none opacity-30"
                      style={{
                        background: isDarkCell
                          ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.08) 0px, transparent 1px, transparent 4px, rgba(0,0,0,0.08) 5px)'
                          : 'repeating-linear-gradient(45deg, rgba(139,107,67,0.08) 0px, transparent 1px, transparent 4px, rgba(139,107,67,0.08) 5px)',
                      }}
                    />

                    {/* Resaltado de último movimiento */}
                    {isLastMove && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: `radial-gradient(circle, ${T.accent}59 0%, ${T.accent}26 100%)`,
                        }}
                      />
                    )}

                    {/* Punto de destino válido */}
                    {isMyTurn && selectedCell && !piece && isDarkCell && (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="absolute w-[30%] h-[30%] rounded-full pointer-events-none"
                        style={{
                          background: `radial-gradient(circle, ${T.accent}E6 0%, ${T.accent}80 60%, transparent 100%)`,
                          boxShadow: `0 0 12px ${T.accent}B3`,
                        }}
                      />
                    )}

                    {/* Ficha */}
                    <AnimatePresence>
                      {piece && (
                        <CheckerPiece
                          player={piece.player}
                          isKing={piece.isKing}
                          isSelected={isSelected}
                          theme={T}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </motion.div>

      {/* ===== PIE DE TABLERO ===== */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-3 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest"
        style={{ color: T.sub }}
      >
        <div className="w-10 h-px" style={{ background: `linear-gradient(to right, transparent, ${T.accent})` }} />
        <span>🇻🇪 Damas Venezolanas 🇻🇪</span>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to left, transparent, ${T.accent})` }} />
      </motion.div>
    </div>
  );
};
