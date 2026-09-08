// ==============================================================================
// RASPANDO LA OLLA — CONSTANTES DE LA PLATAFORMA
// ==============================================================================

import type { VenezuelanState } from '../types/profile';
import type { GameMetadata } from '../types/games';

export const APP_NAME = 'Raspando La Olla';
export const APP_TAGLINE = 'Plataforma Multijugador Online en Tiempo Real';

export const AUTHORIZED_SUPER_ADMIN_EMAILS: readonly string[] = [
  'v19629049@gmail.com',
  'pulsoplay2026@gmail.com',
] as const;

export const FINANCIAL_RULES = {
  WINNER_PERCENT: 90,
  SERVICE_FEE_PERCENT: 10,
  TOTAL_PERCENT: 100,
  MINIMUM_LEGAL_AGE: 18,
  DEFAULT_CURRENCY: 'VES' as const,
  CURRENCY_SYMBOL: 'Bs.',
  MIN_ENTRY_FEE_BS: 25,
  MAX_ENTRY_FEE_BS: 5000,
} as const;

export const VENEZUELAN_STATES: readonly VenezuelanState[] = [
  'Amazonas',
  'Anzoátegui',
  'Apure',
  'Aragua',
  'Barinas',
  'Bolívar',
  'Carabobo',
  'Cojedes',
  'Delta Amacuro',
  'Falcón',
  'Guárico',
  'Lara',
  'La Guaira',
  'Mérida',
  'Miranda',
  'Monagas',
  'Nueva Esparta',
  'Portuguesa',
  'Sucre',
  'Táchira',
  'Trujillo',
  'Yaracuy',
  'Zulia',
  'Distrito Capital',
] as const;

// Juegos con modalidad de Mesa (Excluye Polla Venezolana que es Sorteo Diario Global)
export const SUPPORTED_GAMES_METADATA: readonly GameMetadata[] = [
  {
    id: 'tic_tac_toe',
    name: 'La Vieja',
    shortDescription: 'Clásico duelo estratégico por turnos.',
    minPlayers: 2,
    maxPlayers: 2,
    allowedModes: ['1v1'],
    minEntryFee: 25,
    maxEntryFee: 5000,
    isActive: true,
  },
  {
    id: 'rock_paper_scissors',
    name: 'PulsoPLAY',
    shortDescription: 'Duelo rápido de reflejos y decisión con esquema seguro commit-reveal.',
    minPlayers: 2,
    maxPlayers: 2,
    allowedModes: ['1v1'],
    minEntryFee: 25,
    maxEntryFee: 5000,
    isActive: true,
    requiresCommitReveal: true,
  },
  {
    id: 'checkers',
    name: 'Damas',
    shortDescription: 'Juego de damas con captura y coronación reglamentada.',
    minPlayers: 2,
    maxPlayers: 2,
    allowedModes: ['1v1'],
    minEntryFee: 25,
    maxEntryFee: 5000,
    isActive: true,
  },
  {
    id: 'domino_venezolano',
    name: 'Dominó Venezolano',
    shortDescription: 'Mesa de dominó tradicional por puntos individual o parejas.',
    minPlayers: 2,
    maxPlayers: 4,
    allowedModes: ['1v1', '2v2'],
    minEntryFee: 25,
    maxEntryFee: 5000,
    isActive: true,
  },
  {
    id: 'truco_venezolano',
    name: 'Truco Venezolano',
    shortDescription: 'Truco criollo con envite, flor y señas en tiempo real.',
    minPlayers: 2,
    maxPlayers: 4,
    allowedModes: ['1v1', '2v2'],
    minEntryFee: 25,
    maxEntryFee: 5000,
    isActive: true,
  },
  {
    id: 'bingo',
    name: 'Bingo Online',
    shortDescription: 'Salas comunitarias con balotera digital verificable.',
    minPlayers: 2,
    maxPlayers: 100,
    allowedModes: ['mass_participation'],
    minEntryFee: 25,
    maxEntryFee: 5000,
    isActive: true,
  },
  {
    id: 'atrapaito',
    name: 'Atrapaíto Criollo',
    shortDescription: 'Duelo táctico 1v1: canicas 3D, muros de bloqueo y ley de camino libre.',
    minPlayers: 2,
    maxPlayers: 2,
    allowedModes: ['1v1'],
    minEntryFee: 25,
    maxEntryFee: 5000,
    isActive: true,
  },
  {
    id: 'una_olla',
    name: 'UNA-OLLA',
    shortDescription: 'Juego de cartas multijugador por turnos con colores, números, cartas especiales y botón UNA-OLLA.',
    minPlayers: 2,
    maxPlayers: 4,
    allowedModes: ['1v1', '1v3', '1v4'],
    minEntryFee: 25,
    maxEntryFee: 5000,
    isActive: true,
  },
  {
    id: 'chess',
    name: 'Ajedrez',
    shortDescription: 'El clásico juego de mesa estratégico para dos jugadores en tiempo real.',
    minPlayers: 2,
    maxPlayers: 2,
    allowedModes: ['1v1'],
    minEntryFee: 25,
    maxEntryFee: 5000,
    isActive: true,
  },
] as const;

// Sorteos Diarios Globales Permanentes (Sin Mesa, Sin Creador, Sin Matchmaking)
export const GLOBAL_DRAWS_METADATA: readonly GameMetadata[] = [
  {
    id: 'polla_venezolana',
    name: 'Polla Venezolana',
    shortDescription: 'Quiniela diaria de 6 animalitos (00-76). Sorteos Turno Mañana y Tarde.',
    minPlayers: 1,
    maxPlayers: 999999,
    allowedModes: ['mass_participation'],
    minEntryFee: 250,
    maxEntryFee: 5000,
    isActive: true,
  },
] as const;
