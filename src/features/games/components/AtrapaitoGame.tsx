import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  RotateCcw,
  HelpCircle,
  Bot,
  Users,
  Flag,
  ShieldAlert,
  ArrowLeft,
  Volume2,
  VolumeX,
  Trophy,
  Swords,
  Scale,
  AlertTriangle,
  Clock,
  Wifi,
  WifiOff,
  Globe,
  LogOut,
} from 'lucide-react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { getGameInfo } from '../../../data/gameInfo';
import { useAtrapaitoOnline } from '../../../hooks/useAtrapaitoOnline';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';

// ==============================================================================
// MOTOR DE AUDIO SINTETIZADO (Web Audio API)
// ==============================================================================
const AudioEngine = {
  ctx: null as AudioContext | null,
  isMuted: false,

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  },

  playMove() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(560, this.ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Silencioso
    }
  },

  playWall() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(70, this.ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch {
      // Silencioso
    }
  },

  playVictory() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const notes = [261.6, 329.6, 392.0, 523.25];
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + idx * 0.1 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + idx * 0.1);
        osc.stop(this.ctx.currentTime + idx * 0.1 + 0.25);
      });
    } catch {
      // Silencioso
    }
  },

  playDraw() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const notes = [440, 415, 392];
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + idx * 0.14 + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + idx * 0.14);
        osc.stop(this.ctx.currentTime + idx * 0.14 + 0.12);
      });
    } catch {
      // Silencioso
    }
  },

  playError() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch {
      // Silencioso
    }
  },
};

// ==============================================================================
// TIPOS Y CONSTANTES
// ==============================================================================
const COLS = 9;
const ROWS = 15;
const INITIAL_WALLS = 10;

interface Position {
  col: number;
  row: number;
}

interface Wall {
  col: number;
  row: number;
  isHorizontal: boolean;
  placedBy: 'BLUE' | 'RED';
}

interface GameState {
  bluePos: Position;
  redPos: Position;
  walls: Wall[];
  blueWalls: number;
  redWalls: number;
  turn: 'BLUE' | 'RED';
  action: 'MOVE' | 'WALL';
  wallOrientation: 'HORIZONTAL' | 'VERTICAL';
  pendingWall: Wall | null;
  winner: 'BLUE' | 'RED' | 'DRAW' | null;
  mode: 'VS_AI' | 'PASS_PLAY';
  isAiThinking: boolean;
  consecutiveDraws: number; // Contador de empates consecutivos
}

export interface AtrapaitoGameProps {
  table?: GameTable;
  players?: TablePlayer[];
  currentUserId?: string;
  onLeave?: () => void;
  onExit?: () => void;
  sessionId?: string;
  userId?: string;
  isOnline?: boolean;
  playerColor?: 'BLUE' | 'RED';
}

// ==============================================================================
// COMPONENTE PRINCIPAL
// ==============================================================================
export const AtrapaitoGame: React.FC<AtrapaitoGameProps> = ({
  table,
  players = [],
  currentUserId,
  onLeave,
  onExit,
  sessionId,
  userId,
  isOnline,
  playerColor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const gameInfo = getGameInfo('atrapaito');

  // Detección de conectividad de red local (Fase 4)
  const networkStatus = useNetworkStatus();
  const isNetworkOffline = networkStatus === 'offline';

  // Identificación de sesión y usuario para el modo Online
  const effectiveUserId = userId || currentUserId || players[0]?.userId || null;
  const effectiveSessionId = sessionId || table?.id || null;
  const effectiveIsOnline = Boolean(
    isOnline ||
      (table &&
        !table.config?.isPractice &&
        !table.id.startsWith('practice_') &&
        (table.entryFee ?? 0) > 0 &&
        table.status !== 'waiting' &&
        table.status !== 'CANCELLED')
  );

  const effectivePlayerColor: 'BLUE' | 'RED' =
    playerColor ||
    (players.length > 1 && players[1]?.userId === effectiveUserId ? 'RED' : 'BLUE');

  const bluePlayerName = players[0]?.displayName || (currentUserId ? 'Tú (Azul)' : 'Jugador Azul');
  const redPlayerName = players[1]?.displayName || 'Jugador Rojo';

  const stateRef = useRef<GameState>({
    bluePos: { col: 4, row: 14 },
    redPos: { col: 3, row: 14 },
    walls: [],
    blueWalls: INITIAL_WALLS,
    redWalls: INITIAL_WALLS,
    turn: 'BLUE',
    action: 'MOVE',
    wallOrientation: 'HORIZONTAL',
    pendingWall: null,
    winner: null,
    mode: effectiveIsOnline ? 'PASS_PLAY' : 'PASS_PLAY',
    isAiThinking: false,
    consecutiveDraws: 0,
  });

  const [ui, setUi] = useState({
    blueWalls: INITIAL_WALLS,
    redWalls: INITIAL_WALLS,
    turn: 'BLUE' as 'BLUE' | 'RED',
    action: 'MOVE' as 'MOVE' | 'WALL',
    wallOrientation: 'HORIZONTAL' as 'HORIZONTAL' | 'VERTICAL',
    winner: null as 'BLUE' | 'RED' | 'DRAW' | null,
    mode: 'PASS_PLAY' as 'VS_AI' | 'PASS_PLAY',
    isAiThinking: false,
    statusMsg: effectiveIsOnline
      ? (effectivePlayerColor === 'BLUE' ? '¡Tu turno! Toca una casilla resaltada.' : 'Turno del rival. Esperando...')
      : 'Toca una casilla resaltada para avanzar tu canica.',
    showRules: false,
    showWin: false,
    showDraw: false,
    consecutiveDraws: 0,
    isMuted: false,
    winReason: '',
  });

  const syncUi = useCallback(() => {
    const s = stateRef.current;
    setUi((prev) => ({
      ...prev,
      blueWalls: s.blueWalls,
      redWalls: s.redWalls,
      turn: s.turn,
      action: s.action,
      wallOrientation: s.wallOrientation,
      winner: s.winner,
      mode: s.mode,
      isAiThinking: s.isAiThinking,
      consecutiveDraws: s.consecutiveDraws,
    }));
  }, []);

  // --- LÓGICA DEL JUEGO: BLOQUEO POR MUROS ---
  const isMoveBlocked = useCallback((from: Position, to: Position, walls: Wall[]) => {
    const dc = to.col - from.col;
    const dr = to.row - from.row;
    if (dc === 0 && dr === -1) {
      const r = from.row - 1;
      return walls.some((w) => w.isHorizontal && w.row === r && (w.col === from.col || w.col === from.col - 1));
    }
    if (dc === 0 && dr === 1) {
      const r = from.row;
      return walls.some((w) => w.isHorizontal && w.row === r && (w.col === from.col || w.col === from.col - 1));
    }
    if (dc === -1 && dr === 0) {
      const c = from.col - 1;
      return walls.some((w) => !w.isHorizontal && w.col === c && (w.row === from.row || w.row === from.row - 1));
    }
    if (dc === 1 && dr === 0) {
      const c = from.col;
      return walls.some((w) => !w.isHorizontal && w.col === c && (w.row === from.row || w.row === from.row - 1));
    }
    return true;
  }, []);

  // --- MOVIMIENTOS VÁLIDOS CON SALTO DE CANICAS RIVALES ---
  const getValidMoves = useCallback((currentPos: Position, oppPos: Position, walls: Wall[]) => {
    const moves: Position[] = [];
    const dirs = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];

    for (const [dc, dr] of dirs) {
      const nc = currentPos.col + dc;
      const nr = currentPos.row + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const target = { col: nc, row: nr };
      if (isMoveBlocked(currentPos, target, walls)) continue;

      if (target.col === oppPos.col && target.row === oppPos.row) {
        const jc = nc + dc;
        const jr = nr + dr;
        const jumpTarget = { col: jc, row: jr };
        if (jc >= 0 && jc < COLS && jr >= 0 && jr < ROWS && !isMoveBlocked(oppPos, jumpTarget, walls)) {
          moves.push(jumpTarget);
        } else {
          const perpDirs = dc === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
          for (const [pdc, pdr] of perpDirs) {
            const diagTarget = { col: nc + pdc, row: nr + pdr };
            if (diagTarget.col >= 0 && diagTarget.col < COLS && diagTarget.row >= 0 && diagTarget.row < ROWS) {
              if (!isMoveBlocked(oppPos, diagTarget, walls)) {
                moves.push(diagTarget);
              }
            }
          }
        }
      } else {
        moves.push(target);
      }
    }
    return moves;
  }, [isMoveBlocked]);

  // --- LEY DE CAMINO LIBRE (BFS) ---
  const canReachFinish = useCallback((startPos: Position, walls: Wall[]) => {
    const visited = Array.from({ length: COLS }, () => Array(ROWS).fill(false));
    const queue: Position[] = [startPos];
    visited[startPos.col][startPos.row] = true;
    const dirs = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr.row === 0) return true;

      for (const [dc, dr] of dirs) {
        const nc = curr.col + dc;
        const nr = curr.row + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        if (visited[nc][nr]) continue;
        const next = { col: nc, row: nr };
        if (!isMoveBlocked(curr, next, walls)) {
          visited[nc][nr] = true;
          queue.push(next);
        }
      }
    }
    return false;
  }, [isMoveBlocked]);

  // --- DISTANCIA MÁS CORTA A LA META (BFS) ---
  const getShortestPath = useCallback((startPos: Position, walls: Wall[]) => {
    const visited = Array.from({ length: COLS }, () => Array(ROWS).fill(-1));
    const queue: Position[] = [startPos];
    visited[startPos.col][startPos.row] = 0;
    const dirs = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const d = visited[curr.col][curr.row];
      if (curr.row === 0) return d;

      for (const [dc, dr] of dirs) {
        const nc = curr.col + dc;
        const nr = curr.row + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        if (visited[nc][nr] !== -1) continue;
        const next = { col: nc, row: nr };
        if (!isMoveBlocked(curr, next, walls)) {
          visited[nc][nr] = d + 1;
          queue.push(next);
        }
      }
    }
    return 999;
  }, [isMoveBlocked]);

  // --- VALIDACIÓN DE COLOCACIÓN DE MURO ---
  const isValidWall = useCallback((candidate: Wall, currentWalls: Wall[], bluePos: Position, redPos: Position) => {
    if (candidate.col < 0 || candidate.col >= COLS - 1 || candidate.row < 0 || candidate.row >= ROWS - 1) {
      return false;
    }
    for (const w of currentWalls) {
      if (w.isHorizontal === candidate.isHorizontal) {
        if (candidate.isHorizontal && w.row === candidate.row) {
          if (w.col === candidate.col || w.col === candidate.col - 1 || w.col === candidate.col + 1) return false;
        } else if (!candidate.isHorizontal && w.col === candidate.col) {
          if (w.row === candidate.row || w.row === candidate.row - 1 || w.row === candidate.row + 1) return false;
        }
      } else {
        if (w.col === candidate.col && w.row === candidate.row) return false;
      }
    }
    const simulated = [...currentWalls, candidate];
    if (!canReachFinish(bluePos, simulated)) return false;
    if (!canReachFinish(redPos, simulated)) return false;
    return true;
  }, [canReachFinish]);

  // --- NUEVA LÓGICA: DETECCIÓN DE AMBOS JUGADORES ATRAPADOS ---
  const checkBothPlayersTrapped = useCallback(() => {
    const s = stateRef.current;
    const blueMoves = getValidMoves(s.bluePos, s.redPos, s.walls);
    const redMoves = getValidMoves(s.redPos, s.bluePos, s.walls);

    const blueCanPlaceWall = s.blueWalls > 0;
    const redCanPlaceWall = s.redWalls > 0;

    let blueHasValidWall = false;
    let redHasValidWall = false;

    if (blueCanPlaceWall) {
      for (let c = 0; c < COLS - 1 && !blueHasValidWall; c++) {
        for (let r = 0; r < ROWS - 1 && !blueHasValidWall; r++) {
          for (const isHoriz of [true, false]) {
            const candidate: Wall = { col: c, row: r, isHorizontal: isHoriz, placedBy: 'BLUE' };
            if (isValidWall(candidate, s.walls, s.bluePos, s.redPos)) {
              blueHasValidWall = true;
              break;
            }
          }
        }
      }
    }

    if (redCanPlaceWall) {
      for (let c = 0; c < COLS - 1 && !redHasValidWall; c++) {
        for (let r = 0; r < ROWS - 1 && !redHasValidWall; r++) {
          for (const isHoriz of [true, false]) {
            const candidate: Wall = { col: c, row: r, isHorizontal: isHoriz, placedBy: 'RED' };
            if (isValidWall(candidate, s.walls, s.bluePos, s.redPos)) {
              redHasValidWall = true;
              break;
            }
          }
        }
      }
    }

    const blueTrapped = blueMoves.length === 0 && !blueHasValidWall;
    const redTrapped = redMoves.length === 0 && !redHasValidWall;

    return blueTrapped && redTrapped;
  }, [getValidMoves, isValidWall]);

  // --- RENDERIZADO CANVAS RETINA CON EFECTOS 3D ---
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext('2d');
    }
    const ctx = ctxRef.current;
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const cellW = rect.width / COLS;
    const cellH = rect.height / ROWS;
    const s = stateRef.current;

    ctx.clearRect(0, 0, rect.width, rect.height);

    // 1. Rejilla y Casillas
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellW, 0);
      ctx.lineTo(c * cellW, rect.height);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellH);
      ctx.lineTo(rect.width, r * cellH);
      ctx.stroke();
    }

    // 2. Resaltar movimientos válidos
    if (s.action === 'MOVE' && !s.isAiThinking && !s.winner) {
      const curPos = s.turn === 'BLUE' ? s.bluePos : s.redPos;
      const oppPos = s.turn === 'BLUE' ? s.redPos : s.bluePos;
      const moves = getValidMoves(curPos, oppPos, s.walls);

      moves.forEach((m) => {
        const cx = (m.col + 0.5) * cellW;
        const cy = (m.row + 0.5) * cellH;
        const radius = Math.min(cellW, cellH) * 0.36;

        ctx.fillStyle = s.turn === 'BLUE' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(239, 68, 68, 0.25)';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = s.turn === 'BLUE' ? 'rgba(59, 130, 246, 0.85)' : 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = s.turn === 'BLUE' ? '#2563eb' : '#dc2626';
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 3. Puntos de intersección (Modo Muro)
    if (s.action === 'WALL' && !s.isAiThinking && !s.winner) {
      ctx.fillStyle = 'rgba(100, 116, 139, 0.45)';
      for (let c = 0; c < COLS - 1; c++) {
        for (let r = 0; r < ROWS - 1; r++) {
          ctx.beginPath();
          ctx.arc((c + 1) * cellW, (r + 1) * cellH, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 4. Muros fijados y previo en 3D
    const draw3DWall = (w: Wall, alpha: number, overrideColor?: string) => {
      const isBlue = w.placedBy === 'BLUE';
      const baseCol = overrideColor || (isBlue ? '#2563eb' : '#dc2626');
      const lightCol = isBlue ? '#93c5fd' : '#fca5a5';
      const thick = 8;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';

      if (w.isHorizontal) {
        const x1 = w.col * cellW + 4;
        const x2 = (w.col + 2) * cellW - 4;
        const y = (w.row + 1) * cellH;

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = thick + 2;
        ctx.beginPath();
        ctx.moveTo(x1 + 1, y + 3);
        ctx.lineTo(x2 + 1, y + 3);
        ctx.stroke();

        ctx.strokeStyle = baseCol;
        ctx.lineWidth = thick;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();

        ctx.strokeStyle = lightCol;
        ctx.lineWidth = thick * 0.35;
        ctx.beginPath();
        ctx.moveTo(x1 + 4, y - 2);
        ctx.lineTo(x2 - 4, y - 2);
        ctx.stroke();
      } else {
        const x = (w.col + 1) * cellW;
        const y1 = w.row * cellH + 4;
        const y2 = (w.row + 2) * cellH - 4;

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = thick + 2;
        ctx.beginPath();
        ctx.moveTo(x + 2, y1 + 2);
        ctx.lineTo(x + 2, y2 + 2);
        ctx.stroke();

        ctx.strokeStyle = baseCol;
        ctx.lineWidth = thick;
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.stroke();

        ctx.strokeStyle = lightCol;
        ctx.lineWidth = thick * 0.35;
        ctx.beginPath();
        ctx.moveTo(x - 2, y1 + 4);
        ctx.lineTo(x - 2, y2 - 4);
        ctx.stroke();
      }
      ctx.restore();
    };

    s.walls.forEach((w) => draw3DWall(w, 1.0));

    if (s.action === 'WALL' && s.pendingWall) {
      const isValid = isValidWall(s.pendingWall, s.walls, s.bluePos, s.redPos);
      draw3DWall(s.pendingWall, 0.65, isValid ? undefined : '#ef4444');
    }

    // 5. Canicas 3D
    const draw3DMarble = (pos: Position, type: 'BLUE' | 'RED', isCurrent: boolean) => {
      const cx = (pos.col + 0.5) * cellW;
      const cy = (pos.row + 0.5) * cellH;
      const r = Math.min(cellW, cellH) * 0.36;

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.beginPath();
      ctx.ellipse(cx + 2, cy + r * 0.6, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      if (type === 'BLUE') {
        grad.addColorStop(0, '#dbeafe');
        grad.addColorStop(0.3, '#60a5fa');
        grad.addColorStop(0.75, '#2563eb');
        grad.addColorStop(1, '#0f172a');
      } else {
        grad.addColorStop(0, '#fee2e2');
        grad.addColorStop(0.3, '#f87171');
        grad.addColorStop(0.75, '#dc2626');
        grad.addColorStop(1, '#450a0a');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.22, 0, Math.PI * 2);
      ctx.fill();

      if (isCurrent && !s.winner) {
        ctx.strokeStyle = type === 'BLUE' ? '#3b82f6' : '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    };

    draw3DMarble(s.bluePos, 'BLUE', s.turn === 'BLUE');
    draw3DMarble(s.redPos, 'RED', s.turn === 'RED');
  }, [getValidMoves, isValidWall]);

  // --- GESTIÓN DE EMPATES TÉCNICOS (REGLAS 1 Y 2) ---
  const handleDraw = useCallback(() => {
    const s = stateRef.current;
    s.consecutiveDraws++;
    syncUi();
    AudioEngine.playDraw();

    if (s.consecutiveDraws >= 2) {
      // SEGUNDO EMPATE CONSECUTIVO: Gana quien esté más cerca de la meta (fila 0)
      const blueDist = getShortestPath(s.bluePos, s.walls);
      const redDist = getShortestPath(s.redPos, s.walls);

      if (blueDist < redDist) {
        s.winner = 'BLUE';
        setUi((prev) => ({
          ...prev,
          showWin: true,
          winner: 'BLUE',
          statusMsg: '¡Segundo empate! Gana AZUL por estar más cerca de la META.',
          winReason: `¡Desempate por proximidad! Azul a ${blueDist} pasos vs Rojo a ${redDist} pasos de la meta.`,
        }));
      } else if (redDist < blueDist) {
        s.winner = 'RED';
        setUi((prev) => ({
          ...prev,
          showWin: true,
          winner: 'RED',
          statusMsg: '¡Segundo empate! Gana ROJO por estar más cerca de la META.',
          winReason: `¡Desempate por proximidad! Rojo a ${redDist} pasos vs Azul a ${blueDist} pasos de la meta.`,
        }));
      } else {
        s.winner = 'DRAW';
        setUi((prev) => ({
          ...prev,
          showWin: true,
          winner: 'DRAW',
          statusMsg: '¡Empate definitivo! Ambos jugadores están a la misma distancia de la meta.',
          winReason: `Ambos jugadores a ${blueDist} pasos de la meta. ¡Empate técnico absoluto!`,
        }));
      }
    } else {
      // PRIMER EMPATE: Repetir partida de inmediato
      s.winner = 'DRAW';
      setUi((prev) => ({
        ...prev,
        showDraw: true,
        winner: 'DRAW',
        statusMsg: '¡Empate! Ambos jugadores atrapados. Se repetirá la partida.',
      }));
    }

    render();
  }, [getShortestPath, render, syncUi]);

  // --- REINICIO TRAS EMPATE (MANTENIENDO CONTADOR) ---
  const resetAfterDraw = useCallback(() => {
    const s = stateRef.current;
    s.bluePos = { col: 4, row: 14 };
    s.redPos = { col: 3, row: 14 };
    s.walls = [];
    s.blueWalls = INITIAL_WALLS;
    s.redWalls = INITIAL_WALLS;
    s.turn = 'BLUE';
    s.action = 'MOVE';
    s.wallOrientation = 'HORIZONTAL';
    s.pendingWall = null;
    s.winner = null;
    s.isAiThinking = false;

    setUi((prev) => ({
      ...prev,
      blueWalls: INITIAL_WALLS,
      redWalls: INITIAL_WALLS,
      turn: 'BLUE',
      action: 'MOVE',
      wallOrientation: 'HORIZONTAL',
      winner: null,
      showDraw: false,
      showWin: false,
      statusMsg: 'Partida de revancha iniciada. Avanza tu canica.',
    }));

    render();
  }, [render]);

  // --- REINICIO COMPLETO (RESETEAR EMPATES) ---
  const fullReset = useCallback(() => {
    stateRef.current = {
      bluePos: { col: 4, row: 14 },
      redPos: { col: 3, row: 14 },
      walls: [],
      blueWalls: INITIAL_WALLS,
      redWalls: INITIAL_WALLS,
      turn: 'BLUE',
      action: 'MOVE',
      wallOrientation: 'HORIZONTAL',
      pendingWall: null,
      winner: null,
      mode: stateRef.current.mode,
      isAiThinking: false,
      consecutiveDraws: 0,
    };

    setUi((prev) => ({
      ...prev,
      blueWalls: INITIAL_WALLS,
      redWalls: INITIAL_WALLS,
      turn: 'BLUE',
      action: 'MOVE',
      wallOrientation: 'HORIZONTAL',
      winner: null,
      showWin: false,
      showDraw: false,
      showRules: false,
      consecutiveDraws: 0,
      winReason: '',
      statusMsg: 'Toca una casilla resaltada para avanzar tu canica.',
    }));

    render();
  }, [render]);

  // --- MOTOR DE IA TÁCTICA (STENKA72) ---
  const performAiTurn = useCallback(() => {
    const s = stateRef.current;
    if (s.winner) return;

    const redDist = getShortestPath(s.redPos, s.walls);
    const blueDist = getShortestPath(s.bluePos, s.walls);
    let placeWall = false;
    let bestWall: Wall | null = null;

    if (s.redWalls > 0 && (blueDist <= 4 || blueDist < redDist)) {
      const candidates: { cand: Wall; score: number }[] = [];
      const minC = Math.max(0, s.bluePos.col - 2);
      const maxC = Math.min(COLS - 2, s.bluePos.col + 1);
      const minR = Math.max(0, s.bluePos.row - 2);
      const maxR = Math.min(ROWS - 2, s.bluePos.row + 1);

      for (let c = minC; c <= maxC; c++) {
        for (let r = minR; r <= maxR; r++) {
          for (const isHoriz of [true, false]) {
            const cand: Wall = { col: c, row: r, isHorizontal: isHoriz, placedBy: 'RED' };
            if (isValidWall(cand, s.walls, s.bluePos, s.redPos)) {
              const simWalls = [...s.walls, cand];
              const newBlueD = getShortestPath(s.bluePos, simWalls);
              const newRedD = getShortestPath(s.redPos, simWalls);
              const delay = newBlueD - blueDist;
              const penalty = newRedD - redDist;
              if (delay > 0 && penalty <= 1) {
                candidates.push({ cand, score: delay * 3 - penalty * 2 });
              }
            }
          }
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        bestWall = candidates[0].cand;
        placeWall = true;
      }
    }

    if (placeWall && bestWall) {
      s.walls.push(bestWall);
      s.redWalls--;
      AudioEngine.playWall();
      setUi((prev) => ({ ...prev, statusMsg: 'STENKA72 colocó una barrera táctica.' }));
    } else {
      const validMoves = getValidMoves(s.redPos, s.bluePos, s.walls);
      if (validMoves.length > 0) {
        validMoves.sort((a, b) => {
          const da = getShortestPath(a, s.walls) * 10 + a.row;
          const db = getShortestPath(b, s.walls) * 10 + b.row;
          return da - db;
        });
        const bestMove = validMoves[0];
        s.redPos = bestMove;
        AudioEngine.playMove();

        if (bestMove.row === 0) {
          s.winner = 'RED';
          s.consecutiveDraws = 0;
          s.isAiThinking = false;
          syncUi();
          setUi((prev) => ({
            ...prev,
            showWin: true,
            winner: 'RED',
            statusMsg: '¡Victoria de la IA STENKA72!',
            winReason: '¡STENKA72 cruzó la meta primero!',
          }));
          AudioEngine.playVictory();
          render();
          return;
        }
      }
    }

    s.isAiThinking = false;
    s.turn = 'BLUE';
    syncUi();
    render();

    if (checkBothPlayersTrapped()) {
      setTimeout(handleDraw, 500);
      return;
    }

    setUi((prev) => ({ ...prev, statusMsg: 'Tu turno (Azul). Mueve tu canica o pon un muro.' }));
  }, [
    checkBothPlayersTrapped,
    getShortestPath,
    getValidMoves,
    handleDraw,
    isValidWall,
    render,
    syncUi,
  ]);

  // --- HOOK DE SINCRONIZACIÓN ONLINE (Fases 1, 2, 3 y 4) ---
  const { submitMove, submitWall, abandonGame, isConnected, secondsLeft, isMyTurn } = useAtrapaitoOnline({
    sessionId: effectiveIsOnline ? effectiveSessionId : null,
    userId: effectiveIsOnline ? effectiveUserId : null,
    playerColor: effectivePlayerColor,
    onStateUpdate: (newState) => {
      if (!newState) return;
      const s = stateRef.current;
      if (newState.bluePos) s.bluePos = newState.bluePos;
      if (newState.redPos) s.redPos = newState.redPos;
      if (Array.isArray(newState.walls)) s.walls = newState.walls;
      if (typeof newState.blueWalls === 'number') s.blueWalls = newState.blueWalls;
      if (typeof newState.redWalls === 'number') s.redWalls = newState.redWalls;
      if (newState.turn) s.turn = newState.turn;
      if (newState.winner !== undefined) s.winner = newState.winner;
      if (newState.consecutiveDraws !== undefined) s.consecutiveDraws = newState.consecutiveDraws;

      syncUi();
      render();
    },
    onTurnTimeout: () => {
      AudioEngine.playError();
      setUi((prev) => ({ ...prev, statusMsg: '¡Se acabó el tiempo! Turno agotado (15 seg).' }));
    },
    onGameEnd: (winnerIdOrColor) => {
      const s = stateRef.current;
      const isWinner =
        winnerIdOrColor === effectiveUserId ||
        winnerIdOrColor === effectivePlayerColor ||
        s.winner === effectivePlayerColor;

      s.winner = isWinner ? effectivePlayerColor : (effectivePlayerColor === 'BLUE' ? 'RED' : 'BLUE');
      syncUi();
      setUi((prev) => ({
        ...prev,
        showWin: true,
        winner: s.winner,
        statusMsg: isWinner
          ? '¡Ganaste la partida! Pozo neto 90% acreditado.'
          : 'Partida finalizada. Tu rival ha ganado la partida.',
        winReason: isWinner ? '¡Victoria autoritativa en línea!' : 'El rival logró la meta o ganancia.',
      }));
      if (isWinner) {
        AudioEngine.playVictory();
      } else {
        AudioEngine.playError();
      }
      render();
    },
    onReconnect: () => {
      setUi((prev) => ({ ...prev, statusMsg: 'Conexión restablecida con el servidor.' }));
    },
  });

  // --- CONFIRMAR MURO ---
  const confirmWall = useCallback(() => {
    const s = stateRef.current;
    if (!s.pendingWall) return;

    if (effectiveIsOnline && s.turn !== effectivePlayerColor) {
      AudioEngine.playError();
      setUi((prev) => ({ ...prev, statusMsg: 'No es tu turno para colocar muros.' }));
      return;
    }

    const valid = isValidWall(s.pendingWall, s.walls, s.bluePos, s.redPos);
    if (!valid) {
      AudioEngine.playError();
      setUi((prev) => ({ ...prev, statusMsg: '¡Posición inválida! Ambos deben tener acceso a la meta.' }));
      return;
    }

    if (effectiveIsOnline) {
      submitWall({
        col: s.pendingWall.col,
        row: s.pendingWall.row,
        isHorizontal: s.pendingWall.isHorizontal,
        placedBy: effectivePlayerColor,
      });
    }

    s.walls.push(s.pendingWall);
    if (s.turn === 'BLUE') s.blueWalls--;
    else s.redWalls--;

    AudioEngine.playWall();
    s.pendingWall = null;
    s.action = 'MOVE';
    s.turn = s.turn === 'BLUE' ? 'RED' : 'BLUE';
    syncUi();
    render();

    if (checkBothPlayersTrapped()) {
      setTimeout(handleDraw, 500);
      return;
    }

    if (s.mode === 'VS_AI' && s.turn === 'RED' && !s.winner) {
      s.isAiThinking = true;
      syncUi();
      setUi((prev) => ({ ...prev, statusMsg: 'STENKA72 calculando jugada...' }));
      setTimeout(performAiTurn, 600);
    } else {
      setUi((prev) => ({
        ...prev,
        statusMsg: effectiveIsOnline
          ? (s.turn === effectivePlayerColor ? '¡Tu turno! Mueve o pon un muro.' : 'Turno del rival. Esperando...')
          : `Turno de ${s.turn === 'BLUE' ? bluePlayerName : redPlayerName}.`,
      }));
    }
  }, [
    effectiveIsOnline,
    effectivePlayerColor,
    submitMove,
    bluePlayerName,
    checkBothPlayersTrapped,
    handleDraw,
    isValidWall,
    performAiTurn,
    redPlayerName,
    render,
    syncUi,
  ]);

  // --- INTERACCIÓN EN CANVAS ---
  const handleCanvasInteraction = useCallback((clientX: number, clientY: number) => {
    const s = stateRef.current;
    if (s.winner || s.isAiThinking) return;

    // En modo online, validar que sea el turno de este jugador
    if (effectiveIsOnline && s.turn !== effectivePlayerColor) {
      AudioEngine.playError();
      setUi((prev) => ({
        ...prev,
        statusMsg: `Es el turno de tu rival (${s.turn === 'BLUE' ? bluePlayerName : redPlayerName}). Espera tu turno.`,
      }));
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cellW = rect.width / COLS;
    const cellH = rect.height / ROWS;

    if (s.action === 'MOVE') {
      const col = Math.floor(x / cellW);
      const row = Math.floor(y / cellH);
      const curPos = s.turn === 'BLUE' ? s.bluePos : s.redPos;
      const oppPos = s.turn === 'BLUE' ? s.redPos : s.bluePos;
      const moves = getValidMoves(curPos, oppPos, s.walls);
      const isValid = moves.some((m) => m.col === col && m.row === row);

      if (!isValid) return;

      if (effectiveIsOnline) {
        submitMove('MOVE_MARBLE', { col, row });
      }

      if (s.turn === 'BLUE') s.bluePos = { col, row };
      else s.redPos = { col, row };

      AudioEngine.playMove();

      if (row === 0) {
        s.winner = s.turn;
        s.consecutiveDraws = 0;
        syncUi();
        setUi((prev) => ({
          ...prev,
          showWin: true,
          winner: s.turn,
          statusMsg: `¡${s.turn === 'BLUE' ? bluePlayerName : redPlayerName} ha cruzado la meta!`,
          winReason: `¡${s.turn === 'BLUE' ? bluePlayerName : redPlayerName} alcanzó la Fila 0 primero!`,
        }));
        AudioEngine.playVictory();
        render();
        return;
      }

      s.turn = s.turn === 'BLUE' ? 'RED' : 'BLUE';
      syncUi();
      render();

      if (checkBothPlayersTrapped()) {
        setTimeout(handleDraw, 500);
        return;
      }

      if (s.mode === 'VS_AI' && s.turn === 'RED' && !s.winner) {
        s.isAiThinking = true;
        syncUi();
        setUi((prev) => ({ ...prev, statusMsg: 'STENKA72 calculando jugada...' }));
        setTimeout(performAiTurn, 650);
      } else {
        setUi((prev) => ({
          ...prev,
          statusMsg: effectiveIsOnline
            ? (s.turn === effectivePlayerColor ? '¡Tu turno! Mueve o pon un muro.' : 'Turno del rival. Esperando...')
            : `Turno de ${s.turn === 'BLUE' ? bluePlayerName : redPlayerName}. Mueve o pon un muro.`,
        }));
      }
    } else {
      const col = Math.max(0, Math.min(COLS - 2, Math.floor(x / cellW - 0.5)));
      const row = Math.max(0, Math.min(ROWS - 2, Math.floor(y / cellH - 0.5)));
      const wallsLeft = s.turn === 'BLUE' ? s.blueWalls : s.redWalls;

      if (wallsLeft <= 0) {
        AudioEngine.playError();
        setUi((prev) => ({ ...prev, statusMsg: '¡No te quedan más muros disponibles!' }));
        return;
      }

      const isHoriz = s.wallOrientation === 'HORIZONTAL';
      const candidate: Wall = { col, row, isHorizontal: isHoriz, placedBy: s.turn };

      if (
        s.pendingWall &&
        s.pendingWall.col === col &&
        s.pendingWall.row === row &&
        s.pendingWall.isHorizontal === isHoriz
      ) {
        confirmWall();
      } else {
        s.pendingWall = candidate;
        const valid = isValidWall(candidate, s.walls, s.bluePos, s.redPos);
        setUi((prev) => ({
          ...prev,
          statusMsg: valid
            ? "Toca 'Fijar Muro' o presiona la misma posición para asentar."
            : '¡Muro inválido o encierra completamente a un jugador!',
        }));
        render();
      }
    }
  }, [
    effectiveIsOnline,
    effectivePlayerColor,
    submitMove,
    bluePlayerName,
    redPlayerName,
    checkBothPlayersTrapped,
    confirmWall,
    getValidMoves,
    handleDraw,
    isValidWall,
    performAiTurn,
    render,
    syncUi,
  ]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    handleCanvasInteraction(e.clientX, e.clientY);
  };

  const handleCanvasTouch = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      handleCanvasInteraction(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // --- EFFECTS ---
  useEffect(() => {
    const handleResize = () => render();
    window.addEventListener('resize', handleResize);
    render();
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  const toggleMode = () => {
    stateRef.current.mode = stateRef.current.mode === 'VS_AI' ? 'PASS_PLAY' : 'VS_AI';
    fullReset();
  };

  const toggleMute = () => {
    AudioEngine.isMuted = !AudioEngine.isMuted;
    setUi((p) => ({ ...p, isMuted: AudioEngine.isMuted }));
  };

  const handleExitClick = onLeave || onExit;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#080B12] text-slate-100 flex flex-col items-center justify-center p-2 sm:p-4 selection:bg-amber-500 selection:text-black">
      {/* Fase 4: Banner de Desconexión de Red */}
      {isNetworkOffline && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2.5 font-bold z-50 animate-pulse text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          <span>⚠️ Conexión perdida. Reconectando al servidor...</span>
        </div>
      )}

      <div className="w-full max-w-md bg-[#0B0F17]/95 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-3.5 sm:p-5 shadow-2xl relative">
        
        {/* Header de Navegación y Modos */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            {handleExitClick && (
              <button
                onClick={handleExitClick}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors shrink-0 cursor-pointer"
                title="Volver"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base">🇻🇪</span>
                <h1 className="text-lg sm:text-xl font-black tracking-wide bg-gradient-to-r from-sky-400 via-amber-400 to-rose-400 bg-clip-text text-transparent uppercase">
                  Atrapaíto Criollo
                </h1>
                {effectiveIsOnline && (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-black text-emerald-400 uppercase tracking-wider">
                    Online
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider">
                {table ? `Mesa #${table.id.substring(0, 6)} • Modo 1v1` : 'Estrategia Táctica 1v1 • Ley de Camino Libre'}
              </p>
            </div>
          </div>

          {/* Botones de Control */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleMute}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors cursor-pointer"
              title={ui.isMuted ? 'Activar sonido' : 'Silenciar sonido'}
            >
              {ui.isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            {!effectiveIsOnline && (
              <button
                onClick={toggleMode}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors text-amber-400 border border-amber-500/30 cursor-pointer"
                title="Cambiar entre 1v1 y Modo vs IA"
              >
                {ui.mode === 'VS_AI' ? <Bot size={14} /> : <Users size={14} />}
                <span className="text-[11px] hidden xs:inline">{ui.mode === 'VS_AI' ? 'vs IA' : '1v1'}</span>
              </button>
            )}
            <button
              onClick={() => setUi((p) => ({ ...p, showRules: true }))}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors text-slate-300 cursor-pointer"
              title="Reglas del Juego"
            >
              <HelpCircle size={14} />
            </button>
            <button
              onClick={fullReset}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors text-slate-300 cursor-pointer"
              title="Reiniciar Partida Completa"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Fases 1, 2 y 3: Banner de Estado Online y Temporizador Server-Authoritative */}
        {effectiveIsOnline && (
          <div className="mb-2.5 flex items-center justify-between p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400 animate-pulse'
                }`}
              >
                {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
                <span>{isConnected ? 'Conectado' : 'Reconectando...'}</span>
              </span>
              <span className="font-bold text-slate-300">
                Tu color:{' '}
                <span className={effectivePlayerColor === 'BLUE' ? 'text-blue-400' : 'text-rose-400'}>
                  {effectivePlayerColor === 'BLUE' ? '🔵 Azul' : '🔴 Rojo'}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {isMyTurn ? (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-mono font-black text-xs animate-pulse">
                  <Clock size={12} />
                  <span>Tu Turno: {secondsLeft}s</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-semibold text-xs">
                  <Clock size={12} />
                  <span>Turno Rival</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Alerta de Empates Consecutivos */}
        {ui.consecutiveDraws > 0 && (
          <div className="mb-2.5 p-2 bg-amber-500/15 border border-amber-500/40 rounded-xl text-center animate-pulse">
            <div className="flex items-center justify-center gap-1.5 text-xs font-black text-amber-400">
              <Scale size={14} />
              <span>Empates Consecutivos: {ui.consecutiveDraws}/2</span>
            </div>
            <p className="text-[10px] text-amber-300 mt-0.5">
              {ui.consecutiveDraws === 1
                ? '⚠️ Si ocurre otro empate consecutivo, ganará quien esté más cerca de la META.'
                : '⚖️ ¡Segundo empate alcanzado! Se define por distancia.'}
            </p>
          </div>
        )}

        {/* Franja de Meta Final */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-px bg-emerald-500/40"></div>
          <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 font-mono font-black text-[10px] tracking-widest uppercase shadow-[0_0_10px_rgba(16,185,129,0.2)]">
            <Flag size={11} /> META FINAL (CRUZAR PRIMERO)
          </div>
          <div className="flex-1 h-px bg-emerald-500/40"></div>
        </div>

        {/* Tablero Canvas (Proporción exacta 9 columnas x 15 filas) */}
        <div className="w-full aspect-[9/15] bg-slate-200 border-4 border-slate-700 rounded-2xl p-1 shadow-[inset_0_2px_12px_rgba(0,0,0,0.5)] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[12%] bg-gradient-to-b from-emerald-500/25 to-transparent pointer-events-none z-10 border-b border-emerald-500/40"></div>

          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onTouchStart={handleCanvasTouch}
            className="w-full h-full block cursor-pointer relative z-20 touch-none"
          />
        </div>

        {/* Indicador de Turno */}
        <div className="flex items-center justify-between my-2.5 px-2 font-mono text-xs">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all ${
              ui.turn === 'BLUE'
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)] scale-105'
                : 'opacity-40 text-slate-400'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_6px_#3b82f6]"></span>
            <span className="truncate max-w-[110px]">{bluePlayerName}</span>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-bold">
            <Swords className="w-3.5 h-3.5 text-amber-400" />
            <span>VS</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all ${
              ui.turn === 'RED'
                ? 'bg-rose-600/30 text-rose-300 border border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.3)] scale-105'
                : 'opacity-40 text-slate-400'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]"></span>
            <span className="truncate max-w-[110px]">
              {ui.mode === 'VS_AI' ? 'STENKA72 (IA)' : redPlayerName}
            </span>
          </div>
        </div>

        {/* Panel de Acciones Tácticas */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-xl">
          <div className="flex justify-between items-center mb-2.5 text-xs font-bold">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-950/80 border border-blue-800/60 text-blue-300">
              <span>🔵 Muros:</span>
              <span className="font-mono text-white text-sm">{ui.blueWalls}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-800/60 text-rose-300">
              <span>🔴 Muros:</span>
              <span className="font-mono text-white text-sm">{ui.redWalls}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() => {
                stateRef.current.action = 'MOVE';
                stateRef.current.pendingWall = null;
                syncUi();
                render();
              }}
              className={`py-2 px-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                ui.action === 'MOVE'
                  ? ui.turn === 'BLUE'
                    ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] border border-blue-400'
                    : 'bg-rose-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)] border border-rose-400'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-750 border border-slate-700/60'
              }`}
            >
              <span>🚶 Avanzar</span>
            </button>
            <button
              onClick={() => {
                const currentWalls =
                  stateRef.current.turn === 'BLUE' ? stateRef.current.blueWalls : stateRef.current.redWalls;
                if (currentWalls <= 0) {
                  AudioEngine.playError();
                  setUi((p) => ({ ...p, statusMsg: '¡No te quedan más muros disponibles!' }));
                  return;
                }
                stateRef.current.action = 'WALL';
                syncUi();
                render();
              }}
              className={`py-2 px-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                ui.action === 'WALL'
                  ? ui.turn === 'BLUE'
                    ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] border border-blue-400'
                    : 'bg-rose-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)] border border-rose-400'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-750 border border-slate-700/60'
              }`}
            >
              <span>🧱 Poner Muro</span>
            </button>
          </div>

          {ui.action === 'WALL' && (
            <div className="space-y-2 pt-2 border-t border-slate-800 animate-in fade-in duration-200">
              <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold text-slate-400">Giro de Muro:</span>
                <button
                  onClick={() => {
                    stateRef.current.wallOrientation =
                      stateRef.current.wallOrientation === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL';
                    if (stateRef.current.pendingWall) {
                      stateRef.current.pendingWall.isHorizontal =
                        stateRef.current.wallOrientation === 'HORIZONTAL';
                      render();
                    }
                    syncUi();
                  }}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black px-3 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  {ui.wallOrientation === 'HORIZONTAL' ? '━ Horizontal' : '┃ Vertical'}
                </button>
              </div>

              {stateRef.current.pendingWall && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={confirmWall}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black py-2 rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
                  >
                    ✓ Fijar Muro
                  </button>
                  <button
                    onClick={() => {
                      stateRef.current.pendingWall = null;
                      syncUi();
                      render();
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 rounded-xl transition-all cursor-pointer"
                  >
                    ✕ Descartar
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-2.5 py-1.5 px-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center">
            <p className="text-[11px] font-semibold text-slate-300 min-h-[1.2rem]">{ui.statusMsg}</p>
          </div>

          {/* Botón de Abandono Voluntario de Partida Online */}
          {effectiveIsOnline && (
            <button
              id="btn-atrapaito-abandon"
              type="button"
              onClick={() => {
                if (window.confirm('¿Seguro que quieres abandonar? Perderás la partida y tu entrada será asignada al rival.')) {
                  abandonGame();
                  if (onExit) onExit();
                }
              }}
              className="bg-red-600/80 hover:bg-red-500 active:scale-95 text-white px-4 py-2.5 rounded-xl font-bold mt-2.5 w-full text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-red-950/40 border border-red-500/30"
            >
              <LogOut className="w-4 h-4" />
              <span>Abandonar Partida</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal de Reglas Oficiales */}
      {ui.showRules && gameInfo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-[#0B0F17] border border-slate-800 text-slate-200 max-w-sm w-full rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black mb-3 flex items-center gap-2 text-white">
              <ShieldAlert className="text-amber-400 w-5 h-5" /> Reglas de {gameInfo.title}
            </h3>

            <div className="mb-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
              <p className="text-[11px] font-bold text-amber-400 mb-0.5">🎯 OBJETIVO:</p>
              <p className="text-xs text-slate-300">{gameInfo.objective}</p>
            </div>

            <div className="mb-3">
              <p className="text-[11px] font-bold text-sky-400 mb-1.5 uppercase tracking-wider">
                📋 Reglas Oficiales:
              </p>
              <ul className="text-xs text-slate-300 space-y-1.5">
                {gameInfo.rules.map((rule, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="text-amber-400 font-bold">{idx + 1}.</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mb-4">
              <p className="text-[11px] font-bold text-emerald-400 mb-1.5 uppercase tracking-wider">
                💡 Consejos Tácticos:
              </p>
              <ul className="text-xs text-slate-300 space-y-1">
                {gameInfo.tips.map((tip, idx) => (
                  <li key={idx} className="flex gap-1.5 items-start">
                    <span className="text-emerald-400 font-bold shrink-0">✓</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => setUi((p) => ({ ...p, showRules: false }))}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black py-2.5 rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer text-xs uppercase"
            >
              ¡Entendido, a jugar!
            </button>
          </div>
        </div>
      )}

      {/* Modal de Empate (Primer Empate) */}
      {ui.showDraw && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-[#0B0F17] border border-amber-500/40 text-slate-200 max-w-sm w-full rounded-3xl p-6 shadow-2xl text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Scale className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black mb-1 text-amber-400">⚖️ ¡EMPATE TÉCNICO!</h3>
            <p className="text-xs text-slate-300 font-medium mb-3">
              Ambos jugadores se encuentran atrapados sin movimientos ni muros legales posibles.
            </p>
            <div className="bg-amber-950/40 border border-amber-800/60 p-2.5 rounded-xl mb-4 text-[11px] text-amber-200 text-left space-y-1">
              <p className="font-bold flex items-center gap-1 text-amber-300">
                <AlertTriangle size={12} /> Regla Oficial de Desempate:
              </p>
              <p>• Esta primera partida empatada se repite de inmediato.</p>
              <p>• Si ocurre un segundo empate consecutivo, ganará el jugador que se encuentre a menor distancia de la meta.</p>
            </div>
            <button
              onClick={resetAfterDraw}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black py-2.5 rounded-xl transition-all shadow-lg shadow-amber-500/20 text-xs uppercase cursor-pointer"
            >
              Jugar Revancha de Desempate
            </button>
          </div>
        </div>
      )}

      {/* Modal de Victoria o Resolución de Segundo Empate */}
      {ui.showWin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-[#0B0F17] border border-amber-500/40 text-slate-200 max-w-sm w-full rounded-3xl p-6 shadow-[0_0_40px_rgba(245,158,11,0.25)] text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
              <Trophy className="w-8 h-8" />
            </div>
            <h3
              className={`text-2xl font-black mb-1 ${
                ui.winner === 'BLUE'
                  ? 'text-blue-400'
                  : ui.winner === 'RED'
                  ? 'text-rose-400'
                  : 'text-amber-400'
              }`}
            >
              {ui.winner === 'BLUE'
                ? '🏆 ¡VICTORIA AZUL!'
                : ui.winner === 'RED'
                ? '🏆 ¡VICTORIA ROJA!'
                : '⚖️ ¡EMPATE DEFINITIVO!'}
            </h3>
            <p className="text-xs text-slate-300 font-medium mb-2">
              {ui.winner === 'BLUE'
                ? `¡${bluePlayerName} se corona campeón!`
                : ui.winner === 'RED'
                ? ui.mode === 'VS_AI'
                  ? '¡La IA táctica STENKA72 ha triunfado!'
                  : `¡${redPlayerName} ha ganado la partida!`
                : 'Ambos jugadores quedaron exactamente a la misma distancia de la meta.'}
            </p>
            {ui.winReason && (
              <p className="text-[11px] text-amber-300/90 font-semibold bg-amber-950/40 border border-amber-800/40 p-2 rounded-xl mb-4">
                {ui.winReason}
              </p>
            )}
            <div className="space-y-2 mt-4">
              <button
                onClick={fullReset}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black py-2.5 rounded-xl shadow-lg shadow-amber-500/25 transition-all text-xs uppercase cursor-pointer"
              >
                Nueva Partida
              </button>
              {handleExitClick && (
                <button
                  onClick={handleExitClick}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl transition-colors text-xs cursor-pointer"
                >
                  Volver al Menú Principal
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AtrapaitoGame;
