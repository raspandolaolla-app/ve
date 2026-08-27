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

export const SUPPORTED_GAMES_METADATA: readonly GameMetadata[] = [
  {
    id: 'tic_tac_toe',
    name: 'La Vieja',
    shortDescription: 'Clásico duelo estratégico por turnos.',
    minPlayers: 2,
    maxPlayers: 2,
    allowedModes: ['1v1'],
    minEntryFee: 10,
    maxEntryFee: 1000,
    isActive: true,
  },
  {
    id: 'rock_paper_scissors',
    name: 'Piedra, Papel o Tijera',
    shortDescription: 'Duelo rápido con esquema seguro commit-reveal.',
    minPlayers: 2,
    maxPlayers: 2,
    allowedModes: ['1v1'],
    minEntryFee: 10,
    maxEntryFee: 1000,
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
    minEntryFee: 20,
    maxEntryFee: 2000,
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
    minEntryFee: 10,
    maxEntryFee: 500,
    isActive: true,
  },
  {
    id: 'polla_venezolana',
    name: 'Polla Venezolana',
    shortDescription: 'Pronósticos y quinielas de eventos con pozo acumulado.',
    minPlayers: 2,
    maxPlayers: 1000,
    allowedModes: ['mass_participation'],
    minEntryFee: 20,
    maxEntryFee: 2000,
    isActive: true,
  },
  {
    id: 'atrapaito',
    name: 'Atrapaíto',
    shortDescription: 'Juego de reflejos y cálculo matemático en vivo.',
    minPlayers: 2,
    maxPlayers: 4,
    allowedModes: ['1v1', '1v3'],
    minEntryFee: 15,
    maxEntryFee: 1500,
    isActive: true,
  },
] as const;
