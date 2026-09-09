// ==============================================================================
// RASPANDO LA OLLA — PUENTE DE COMPATIBILIDAD: ATRAPAÍTO / PARCHÍS
// ==============================================================================
// NOTA DE ARQUITECTURA FORENSE:
// Atrapaíto Criollo (muros y canicas) y Parchís / Ludo (fichas y dados) están ahora
// estrictamente desacoplados en motores y componentes independientes:
// - Atrapaíto Criollo: src/features/games/components/AtrapaitoGame.tsx
// - Parchís / Ludo:    src/features/games/components/ParchisBoard.tsx
// Este archivo re-exporta ParchisBoard para compatibilidad transitoria de imports.
// ==============================================================================

export { ParchisBoard as AtrapaitoBoard } from './ParchisBoard';
export type { ParchisBoardProps as AtrapaitoBoardProps } from './ParchisBoard';
