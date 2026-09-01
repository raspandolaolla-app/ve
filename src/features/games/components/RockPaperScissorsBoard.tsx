// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: PIEDRA, PAPEL O TIJERA
// ==============================================================================
// Diseño épico 3D con sistema de sonidos inmersivo
// Optimizado para móviles con identidad venezolana
// Compatible 100% con Supabase y GameContainer
// ==============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ShieldCheck, Sparkles, RefreshCw, Flame, Zap, Volume2, VolumeX } from 'lucide-react';
import type { RPSState, RPSChoice } from '../../../types/games';

interface RockPaperScissorsBoardProps {
  state: RPSState;
  currentUserId: string;
  onSubmitChoice: (choice: RPSChoice) => void;
  onNextRound?: () => void;
}

const CHOICES: { id: RPSChoice; label: string; icon: string; beats: string; color: string; sound: string }[] = [
  { id: 'rock', label: 'Piedra', icon: '🪨', beats: 'Tijera', color: 'from-amber-600 to-yellow-600', sound: 'rock' },
  { id: 'paper', label: 'Papel', icon: '📄', beats: 'Piedra', color: 'from-blue-600 to-cyan-600', sound: 'paper' },
  { id: 'scissors', label: 'Tijera', icon: '✂️', beats: 'Papel', color: 'from-emerald-600 to-teal-600', sound: 'scissors' }
];

// Sistema de Sonidos Web Audio API
class SoundManager {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
    if (!this.audioContext || !this.enabled) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  // Sonido al seleccionar una opción
  playSelect() {
    this.playTone(523.25, 0.1, 'sine', 0.3); // C5
    setTimeout(() => this.playTone(659.25, 0.1, 'sine', 0.3), 50); // E5
  }

  // Sonido al comprometer jugada (lock)
  playCommit() {
    this.playTone(440, 0.15, 'square', 0.2); // A4
    setTimeout(() => this.playTone(554.37, 0.15, 'square', 0.2), 100); // C#5
    setTimeout(() => this.playTone(659.25, 0.2, 'square', 0.25), 200); // E5
  }

  // Sonido de revelación (reveal)
  playReveal() {
    this.playTone(392, 0.1, 'sine', 0.25); // G4
    setTimeout(() => this.playTone(523.25, 0.1, 'sine', 0.25), 80); // C5
    setTimeout(() => this.playTone(659.25, 0.15, 'sine', 0.3), 160); // E5
  }

  // Sonido de victoria de ronda
  playWin() {
    this.playTone(523.25, 0.15, 'sine', 0.4); // C5
    setTimeout(() => this.playTone(659.25, 0.15, 'sine', 0.4), 100); // E5
    setTimeout(() => this.playTone(783.99, 0.2, 'sine', 0.5), 200); // G5
    setTimeout(() => this.playTone(1046.5, 0.3, 'sine', 0.6), 300); // C6
  }

  // Sonido de empate
  playDraw() {
    this.playTone(440, 0.2, 'triangle', 0.3); // A4
    setTimeout(() => this.playTone(440, 0.2, 'triangle', 0.3), 200); // A4
  }

  // Sonido de victoria final (match won)
  playMatchWin() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.2, 'sine', 0.5), i * 120);
    });
  }

  // Sonido de sonido de piedra
  playRock() {
    this.playTone(220, 0.3, 'sawtooth', 0.15);
    setTimeout(() => this.playTone(110, 0.2, 'sawtooth', 0.1), 100);
  }

  // Sonido de papel
  playPaper() {
    this.playTone(800, 0.1, 'sine', 0.2);
    setTimeout(() => this.playTone(1200, 0.08, 'sine', 0.15), 50);
    setTimeout(() => this.playTone(600, 0.1, 'sine', 0.15), 100);
  }

  // Sonido de tijeras
  playScissors() {
    this.playTone(1500, 0.05, 'square', 0.2);
    setTimeout(() => this.playTone(1800, 0.05, 'square', 0.2), 60);
    setTimeout(() => this.playTone(2200, 0.05, 'square', 0.15), 120);
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  isEnabled() {
    return this.enabled;
  }
}

export const RockPaperScissorsBoard: React.FC<RockPaperScissorsBoardProps> = ({
  state,
  currentUserId,
  onSubmitChoice,
  onNextRound,
}) => {
  const [soundManager] = useState(() => new SoundManager());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastPhase, setLastPhase] = useState(state?.phase || 'selecting');
  const prevPhaseRef = useRef(state?.phase);

  const playerNames = state?.playerNames || {};
  const playerChoices = state?.playerChoices || {};
  const scores = state?.scores || {};
  const targetWins = state?.targetWins || 3;
  const phase = state?.phase || 'selecting';
  const playerIds = Object.keys(playerNames);
  const p1Id = playerIds[0] || currentUserId;
  const p2Id = playerIds[1] || '';
  const myChoiceData = playerChoices[currentUserId];
  const hasCommitted = Boolean(myChoiceData?.committed);
  const mySelectedChoice = myChoiceData?.choice;
  const opponentId = playerIds.find((id) => id !== currentUserId) || '';
  const opponentChoiceData = playerChoices[opponentId];
  const opponentHasCommitted = Boolean(opponentChoiceData?.committed);
  const opponentRevealedChoice = opponentChoiceData?.choice;

  const isSelecting = phase === 'selecting';
  const isRoundResult = phase === 'round_result' || phase === 'match_ended';

  // Detectar cambios de fase para reproducir sonidos
  useEffect(() => {
    if (prevPhaseRef.current !== phase) {
      const prevPhase = prevPhaseRef.current;
      prevPhaseRef.current = phase;

      // Sonido al revelar resultados
      if (phase === 'round_result' && prevPhase === 'selecting') {
        setTimeout(() => {
          soundManager.playReveal();
          
          // Determinar si ganó, perdió o empató
          const lastHistory = state.history?.[state.history.length - 1];
          if (lastHistory) {
            setTimeout(() => {
              if (lastHistory.winnerId === currentUserId) {
                soundManager.playWin();
              } else if (lastHistory.winnerId === 'TIE' || !lastHistory.winnerId) {
                soundManager.playDraw();
              }
            }, 300);
          }
        }, 200);
      }

      // Sonido de victoria final
      if (phase === 'match_ended') {
        setTimeout(() => {
          soundManager.playMatchWin();
        }, 500);
      }
    }
  }, [phase, state.history, currentUserId, soundManager]);

  // Sonido al comprometer jugada
  useEffect(() => {
    if (hasCommitted && lastPhase === 'selecting') {
      soundManager.playCommit();
    }
    setLastPhase(phase);
  }, [hasCommitted, phase, soundManager, lastPhase]);

  const handleChoiceSelect = useCallback((choice: RPSChoice) => {
    // Reproducir sonido específico de la opción seleccionada
    if (choice === 'rock') soundManager.playRock();
    else if (choice === 'paper') soundManager.playPaper();
    else if (choice === 'scissors') soundManager.playScissors();

    // Sonido de selección
    setTimeout(() => soundManager.playSelect(), 150);

    // Enviar la elección
    onSubmitChoice(choice);
  }, [onSubmitChoice, soundManager]);

  const handleNextRound = useCallback(() => {
    soundManager.playSelect();
    onNextRound?.();
  }, [onNextRound, soundManager]);

  const toggleSound = useCallback(() => {
    const enabled = soundManager.toggle();
    setSoundEnabled(enabled);
  }, [soundManager]);

  // Componente de partículas para efectos
  const ParticleEffect = ({ color }: { color: string }) => (
    <>
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0, x: 0, y: 0 }}
          animate={{
            scale: [0, 1.5, 0],
            x: Math.cos((i * Math.PI) / 4) * 60,
            y: Math.sin((i * Math.PI) / 4) * 60,
          }}
          transition={{ duration: 0.8, delay: i * 0.05 }}
          className={`absolute w-2 h-2 rounded-full ${color}`}
        />
      ))}
    </>
  );

  return (
    <div id="rps-board-container" className="flex flex-col items-center justify-center p-2 sm:p-4 max-w-xl mx-auto w-full">
      {/* Header con Control de Sonido */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full mb-3 sm:mb-4 relative overflow-hidden rounded-2xl border-2 border-amber-500/30"
        style={{
          background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(59, 130, 246, 0.15) 50%, rgba(239, 68, 68, 0.15) 100%)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="relative z-10 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg"
            >
              <Flame className="w-5 h-5 text-white" />
            </motion.div>
            <div>
              <div className="text-[10px] sm:text-xs font-bold text-amber-400 uppercase tracking-wider">
                Ronda
              </div>
              <div className="text-xl sm:text-2xl font-black text-white font-mono leading-none">
                {state.round}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              className="p-2 rounded-lg bg-neutral-800/60 hover:bg-neutral-700/60 border border-neutral-700/50 transition-all"
              title={soundEnabled ? 'Silenciar' : 'Activar sonido'}
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-amber-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-neutral-500" />
              )}
            </button>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-blue-500/20 to-red-500/20 border border-amber-500/30">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-[10px] sm:text-xs font-black text-white uppercase tracking-wider">
                  Al Mejor de {targetWins * 2 - 1}
                </span>
              </div>
              <div className="text-[9px] sm:text-[10px] text-amber-300/80 font-mono mt-0.5">
                (Primero a {targetWins} victorias)
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
      </motion.div>

      {/* Marcador Épico con Efectos 3D */}
      <div id="rps-scoreboard" className="grid grid-cols-2 gap-2 sm:gap-3 w-full mb-4">
        {/* Jugador 1 */}
        {p1Id && (
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            id="rps-player-1-card"
            className={`relative p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 ${
              (scores[p1Id] || 0) > 0
                ? 'bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent border-amber-500 shadow-lg shadow-amber-500/30'
                : 'bg-gradient-to-br from-neutral-900/80 via-neutral-900/60 to-neutral-950/40 border-neutral-800'
            }`}
            style={{
              backdropFilter: 'blur(10px)',
              boxShadow: (scores[p1Id] || 0) > 0
                ? '0 8px 32px rgba(251, 191, 36, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                : '0 4px 16px rgba(0, 0, 0, 0.3)',
            }}
          >
            {(scores[p1Id] || 0) > 0 && (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/20 to-transparent pointer-events-none"
              />
            )}

            <div className="relative z-10 flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate min-w-0">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-black flex items-center justify-center text-lg sm:text-xl border-2 border-amber-400/50 shadow-lg shrink-0"
                    style={{
                      boxShadow: '0 4px 12px rgba(251, 191, 36, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    🎯
                  </motion.div>

                  <div className="truncate min-w-0">
                    <div className="text-xs sm:text-sm font-black text-white truncate max-w-[80px] sm:max-w-[100px] leading-tight">
                      {(playerNames[p1Id] || 'JUGADOR 1').toUpperCase()}
                    </div>
                    <div className="flex items-center space-x-1 mt-0.5">
                      {p1Id === currentUserId && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] text-yellow-400 font-mono tracking-wider font-black uppercase bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/30"
                        >
                          <Zap className="w-2.5 h-2.5" />
                          TÚ
                        </motion.span>
                      )}
                      {playerChoices[p1Id]?.committed && isSelecting && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="inline-flex items-center text-[9px] sm:text-[10px] text-emerald-400 font-medium space-x-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30"
                        >
                          <ShieldCheck className="w-2.5 h-2.5" />
                          <span>LISTO</span>
                        </motion.span>
                      )}
                    </div>
                  </div>
                </div>

                <motion.div
                  key={scores[p1Id] || 0}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-2xl sm:text-3xl font-black text-white font-mono leading-none"
                  style={{
                    textShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
                  }}
                >
                  {scores[p1Id] || 0}
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Jugador 2 */}
        {p2Id && (
          <motion.div
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            id="rps-player-2-card"
            className={`relative p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 ${
              (scores[p2Id] || 0) > 0
                ? 'bg-gradient-to-br from-blue-500/20 via-blue-600/10 to-transparent border-blue-500 shadow-lg shadow-blue-500/30'
                : 'bg-gradient-to-br from-neutral-900/80 via-neutral-900/60 to-neutral-950/40 border-neutral-800'
            }`}
            style={{
              backdropFilter: 'blur(10px)',
              boxShadow: (scores[p2Id] || 0) > 0
                ? '0 8px 32px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                : '0 4px 16px rgba(0, 0, 0, 0.3)',
            }}
          >
            {(scores[p2Id] || 0) > 0 && (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/20 to-transparent pointer-events-none"
              />
            )}

            <div className="relative z-10 flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate min-w-0">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white font-black flex items-center justify-center text-lg sm:text-xl border-2 border-blue-400/50 shadow-lg shrink-0"
                    style={{
                      boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    🎯
                  </motion.div>

                  <div className="truncate min-w-0">
                    <div className="text-xs sm:text-sm font-black text-white truncate max-w-[80px] sm:max-w-[100px] leading-tight">
                      {(playerNames[p2Id] || 'JUGADOR 2').toUpperCase()}
                    </div>
                    <div className="flex items-center space-x-1 mt-0.5">
                      {p2Id === currentUserId && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] text-yellow-400 font-mono tracking-wider font-black uppercase bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/30"
                        >
                          <Zap className="w-2.5 h-2.5" />
                          TÚ
                        </motion.span>
                      )}
                      {playerChoices[p2Id]?.committed && isSelecting && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="inline-flex items-center text-[9px] sm:text-[10px] text-emerald-400 font-medium space-x-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30"
                        >
                          <ShieldCheck className="w-2.5 h-2.5" />
                          <span>LISTO</span>
                        </motion.span>
                      )}
                    </div>
                  </div>
                </div>

                <motion.div
                  key={scores[p2Id] || 0}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-2xl sm:text-3xl font-black text-white font-mono leading-none"
                  style={{
                    textShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
                  }}
                >
                  {scores[p2Id] || 0}
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Arena de Duelo Épica */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        id="rps-arena"
        className="w-full relative overflow-hidden rounded-3xl border-2 border-amber-500/30 p-4 sm:p-6 mb-4"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Efectos de fondo animados */}
        <div className="absolute inset-0 opacity-20">
          <motion.div
            animate={{
              background: [
                'radial-gradient(circle at 20% 50%, rgba(251, 191, 36, 0.3) 0%, transparent 50%)',
                'radial-gradient(circle at 80% 50%, rgba(59, 130, 246, 0.3) 0%, transparent 50%)',
                'radial-gradient(circle at 20% 50%, rgba(239, 68, 68, 0.3) 0%, transparent 50%)',
              ],
            }}
            transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0"
          />
        </div>

        <div className="relative z-10">
          <div className="text-center mb-4">
            <span className="text-xs font-bold tracking-widest text-amber-400 uppercase font-mono">
              ⚔️ DUELO EN VIVO ⚔️
            </span>
          </div>

          {/* Zona de Confrontación */}
          <div className="flex items-center justify-around py-4">
            {/* Lado Mi Jugador */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] sm:text-xs text-amber-400 mb-2 font-bold uppercase tracking-wider">
                {p1Id === currentUserId ? 'TÚ' : playerNames[p1Id]?.toUpperCase()}
              </span>
              <motion.div
                animate={hasCommitted ? { rotate: [0, -5, 5, -5, 5, 0] } : {}}
                transition={{ duration: 2, repeat: hasCommitted ? Infinity : 0 }}
                className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-neutral-800/80 to-neutral-900/80 border-2 border-amber-500/50 flex items-center justify-center text-3xl sm:text-4xl shadow-inner overflow-hidden"
                style={{
                  boxShadow: hasCommitted
                    ? '0 8px 32px rgba(251, 191, 36, 0.4), inset 0 2px 8px rgba(255, 255, 255, 0.1)'
                    : '0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
              >
                <AnimatePresence mode="wait">
                  {mySelectedChoice ? (
                    <motion.span
                      key="revealed"
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 180 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                      className="relative z-10"
                    >
                      {mySelectedChoice === 'rock' ? '🪨' : mySelectedChoice === 'paper' ? '📄' : '✂️'}
                    </motion.span>
                  ) : hasCommitted ? (
                    <motion.div
                      key="committed"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="flex flex-col items-center gap-1"
                    >
                      <ShieldCheck className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-400 animate-pulse" />
                      <span className="text-[8px] sm:text-[10px] text-emerald-400 font-bold">LISTO</span>
                    </motion.div>
                  ) : (
                    <motion.span
                      key="pending"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="text-neutral-600 text-2xl sm:text-3xl font-mono"
                    >
                      ?
                    </motion.span>
                  )}
                </AnimatePresence>

                {hasCommitted && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-transparent pointer-events-none"
                  />
                )}
              </motion.div>
              <span className="text-[10px] sm:text-xs text-amber-300 mt-2 font-mono font-bold">
                {mySelectedChoice
                  ? mySelectedChoice.toUpperCase()
                  : hasCommitted
                  ? 'BLOQUEADA'
                  : 'PENDIENTE'}
              </span>
            </div>

            {/* VS Icon Animado */}
            <div className="flex flex-col items-center relative">
              <motion.div
                animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-2xl sm:text-3xl font-black text-amber-500 font-mono"
                style={{
                  textShadow: '0 0 20px rgba(251, 191, 36, 0.6)',
                }}
              >
                VS
              </motion.div>
              {isSelecting && (
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-[10px] text-emerald-400 mt-1 font-mono font-bold"
                >
                  EN VIVO
                </motion.span>
              )}

              {/* Efecto de choque cuando ambos comprometieron */}
              {hasCommitted && opponentHasCommitted && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 2, 0], opacity: [0, 1, 0] }}
                  transition={{ duration: 1 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <ParticleEffect color="bg-amber-400" />
                </motion.div>
              )}
            </div>

            {/* Lado Oponente */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] sm:text-xs text-blue-400 mb-2 font-bold uppercase tracking-wider">
                {playerNames[opponentId]?.toUpperCase() || 'OPONENTE'}
              </span>
              <motion.div
                animate={opponentHasCommitted && !isRoundResult ? { rotate: [0, 5, -5, 5, -5, 0] } : {}}
                transition={{ duration: 2, repeat: opponentHasCommitted && !isRoundResult ? Infinity : 0 }}
                className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-neutral-800/80 to-neutral-900/80 border-2 border-blue-500/50 flex items-center justify-center text-3xl sm:text-4xl shadow-inner overflow-hidden"
                style={{
                  boxShadow: opponentHasCommitted
                    ? '0 8px 32px rgba(59, 130, 246, 0.4), inset 0 2px 8px rgba(255, 255, 255, 0.1)'
                    : '0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
              >
                <AnimatePresence mode="wait">
                  {isRoundResult && opponentRevealedChoice ? (
                    <motion.span
                      key="revealed"
                      initial={{ scale: 0, rotate: 180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: -180 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                      className="relative z-10"
                    >
                      {opponentRevealedChoice === 'rock'
                        ? '🪨'
                        : opponentRevealedChoice === 'paper'
                        ? '📄'
                        : '✂️'}
                    </motion.span>
                  ) : opponentHasCommitted ? (
                    <motion.div
                      key="committed"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="flex flex-col items-center gap-1"
                    >
                      <ShieldCheck className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-400" />
                      <span className="text-[8px] sm:text-[10px] text-emerald-400 font-bold">LISTO</span>
                    </motion.div>
                  ) : (
                    <motion.span
                      key="thinking"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="text-neutral-600 text-2xl sm:text-3xl font-mono"
                    >
                      ?
                    </motion.span>
                  )}
                </AnimatePresence>

                {opponentHasCommitted && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent pointer-events-none"
                  />
                )}
              </motion.div>
              <span className="text-[10px] sm:text-xs text-blue-300 mt-2 font-mono font-bold">
                {isRoundResult && opponentRevealedChoice
                  ? opponentRevealedChoice.toUpperCase()
                  : opponentHasCommitted
                  ? 'OCULTA'
                  : 'PENSANDO...'}
              </span>
            </div>
          </div>

          {/* Resumen del Duelo */}
          <AnimatePresence>
            {isRoundResult && state.history && state.history.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-neutral-800/80 to-neutral-900/80 border-2 border-amber-500/50 text-center relative overflow-hidden"
                style={{
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
              >
                <motion.div
                  animate={{ x: [-200, 600] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent skew-x-12 pointer-events-none"
                />
                <p className="relative z-10 text-sm sm:text-base font-black text-white">
                  {state.history[state.history.length - 1].summary}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Selector de Opciones con Animaciones Épicas */}
      <AnimatePresence mode="wait">
        {isSelecting && !hasCommitted && (
          <motion.div
            key="choices-panel"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            id="rps-choices-panel"
            className="w-full"
          >
            <div className="text-center text-xs sm:text-sm font-black text-amber-400 mb-3 uppercase tracking-wider">
              ⚡ Selecciona tu jugada secreta ⚡
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {CHOICES.map((choice, index) => (
                <motion.button
                  key={choice.id}
                  id={`rps-choice-${choice.id}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.08, rotateY: 10 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => handleChoiceSelect(choice.id)}
                  className={`relative flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border-2 bg-gradient-to-b ${choice.color} border-white/30 shadow-2xl text-white transition-all cursor-pointer overflow-hidden group`}
                  style={{
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.3)',
                    perspective: '1000px',
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <motion.div
                    animate={{ x: [-100, 400] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear', delay: index * 0.3 }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12 pointer-events-none"
                  />
                  <motion.span
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="relative z-10 text-4xl sm:text-5xl mb-1 sm:mb-2 drop-shadow-lg"
                  >
                    {choice.icon}
                  </motion.span>
                  <span className="relative z-10 text-xs sm:text-sm font-black uppercase tracking-wider">
                    {choice.label}
                  </span>
                  <span className="relative z-10 text-[9px] sm:text-[10px] text-white/80 mt-0.5 font-mono">
                    Vence a {choice.beats}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mensaje de espera si ya elegí pero falta oponente */}
      <AnimatePresence>
        {isSelecting && hasCommitted && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-neutral-900 to-neutral-800 border-2 border-emerald-500/50 text-center relative overflow-hidden"
            style={{
              boxShadow: '0 8px 32px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <motion.div
              animate={{ x: [-200, 600] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent skew-x-12 pointer-events-none"
            />
            <div className="relative z-10 flex items-center justify-center gap-2">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </motion.div>
              <span className="text-xs sm:text-sm font-bold text-emerald-300">
                ✓ Tu jugada está bloqueada. Esperando al oponente...
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botón Siguiente Ronda */}
      <AnimatePresence>
        {state.phase === 'round_result' && onNextRound && (
          <motion.button
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            id="rps-next-round-btn"
            onClick={handleNextRound}
            className="mt-4 flex items-center space-x-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:via-yellow-300 hover:to-amber-400 text-neutral-950 font-black text-base shadow-2xl shadow-amber-500/40 transition-all duration-300 relative overflow-hidden group"
            style={{
              boxShadow: '0 8px 32px rgba(251, 191, 36, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.3)',
            }}
          >
            <motion.div
              animate={{ x: [-100, 500] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12"
            />
            <RefreshCw className="relative z-10 w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
            <span className="relative z-10 uppercase tracking-wider">SIGUIENTE RONDA</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Si el partido concluyó */}
      <AnimatePresence>
        {state.phase === 'match_ended' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="mt-4 w-full p-5 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-neutral-950 font-black text-base flex items-center justify-center space-x-3 shadow-2xl shadow-amber-500/50 relative overflow-hidden"
            style={{
              boxShadow: '0 8px 32px rgba(251, 191, 36, 0.5), inset 0 2px 4px rgba(255, 255, 255, 0.3)',
            }}
          >
            <motion.div
              animate={{ x: [-200, 800] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12 pointer-events-none"
            />
            <Trophy className="relative z-10 w-6 h-6" />
            <span className="relative z-10 text-center">
              ¡DUELO CONCLUIDO! GANADOR: {playerNames[state.winnerUserId || '']?.toUpperCase()}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer decorativo */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-4 flex items-center justify-center gap-2 text-[10px] text-amber-400/60 font-mono uppercase tracking-wider"
      >
        <div className="w-8 h-px bg-gradient-to-r from-transparent to-amber-500/50" />
        <span>🇻🇪 PIEDRA, PAPEL O TIJERA 🇻🇪</span>
        <div className="w-8 h-px bg-gradient-to-l from-transparent to-amber-500/50" />
      </motion.div>
    </div>
  );
};
