// ==============================================================================
// RASPANDO LA OLLA — REGISTRO CENTRAL DE JUEGOS (GAME REGISTRY)
// ==============================================================================
// Única Fuente de Verdad para identidad, metadata, disponibilidad, CTA y ciclo
// de vida de juegos nuevos en toda la WebApp (Lobby, Publicidad, Mesas, Polla).
// ==============================================================================

import { SUPPORTED_GAMES_METADATA, GLOBAL_DRAWS_METADATA } from '../../utils/constants';
import { GAMES_INFO, type GameInfo } from '../../data/gameInfo';
import { normalizeCanonicalGameId } from '../../context/GameAvailabilityContext';
import type { GameMetadata, GameType } from '../../types/games';

export interface GameCtaConfig {
  label: string;
  guestLabel: string;
  action: 'CREATE_TABLE' | 'PLAY_GAME' | 'OPEN_POLLA' | 'OPEN_TABLES';
  tab: 'tables' | 'polla' | 'atrapaito' | 'home';
}

export class GameRegistry {
  private static allGamesCache: GameMetadata[] | null = null;
  private static gameMap: Map<string, GameMetadata> = new Map();
  private static gameInfoMap: Map<string, GameInfo> = new Map();

  /**
   * Inicializa mapas de búsqueda en memoria para resolución O(1)
   */
  private static ensureInitialized(): void {
    if (this.allGamesCache) return;

    // Combinar juegos de mesa tradicionales y sorteos globales (Polla)
    const combined: GameMetadata[] = [
      ...SUPPORTED_GAMES_METADATA,
      ...GLOBAL_DRAWS_METADATA,
    ];

    this.allGamesCache = combined;

    for (const game of combined) {
      this.gameMap.set(game.id, game);
      const canonical = normalizeCanonicalGameId(game.id);
      if (canonical && canonical !== game.id) {
        this.gameMap.set(canonical, game);
      }
    }

    for (const info of GAMES_INFO) {
      this.gameInfoMap.set(info.id, info);
      if (Array.isArray(info.aliases)) {
        for (const alias of info.aliases) {
          this.gameInfoMap.set(alias, info);
        }
      }
    }
  }

  /**
   * Obtiene la lista completa de todos los juegos registrados en la plataforma
   */
  public static getAllGames(): GameMetadata[] {
    this.ensureInitialized();
    return this.allGamesCache || [];
  }

  /**
   * Normaliza cualquier alias de juego a su identificador canónico estructurado
   */
  public static getCanonicalId(rawId: string): string {
    return normalizeCanonicalGameId(rawId);
  }

  /**
   * Normaliza cualquier alias de juego a su identificador canónico estructurado (alias)
   */
  public static getCanonicalGameId(rawId: string): string {
    return this.getCanonicalId(rawId);
  }

  /**
   * Busca metadata del juego por identificador (canónico o alias)
   */
  public static getGameById(rawId: string): GameMetadata | undefined {
    this.ensureInitialized();
    if (!rawId) return undefined;
    const canonical = normalizeCanonicalGameId(rawId);
    return this.gameMap.get(canonical) || this.gameMap.get(rawId);
  }

  /**
   * Obtiene la ficha informativa detallada (reglas, tips, jugadores, etc.)
   */
  public static getGameInfo(rawId: string): GameInfo | undefined {
    this.ensureInitialized();
    if (!rawId) return undefined;
    const canonical = normalizeCanonicalGameId(rawId);
    return this.gameInfoMap.get(canonical) || this.gameInfoMap.get(rawId);
  }

  /**
   * Determina si un juego tiene clasificación activa de "NUEVO JUEGO"
   * basada en configuración explícita, metadata o fecha de incorporación.
   */
  public static isGameNew(rawId: string): boolean {
    const game = this.getGameById(rawId);
    if (!game) return false;

    // 1. Marca explícita en metadata
    if (game.isNew === true) {
      if (game.newUntil) {
        const untilMs = new Date(game.newUntil).getTime();
        if (!isNaN(untilMs) && Date.now() > untilMs) {
          return false;
        }
      }
      return true;
    }

    // 2. Juegos destacados recientes registrados en la plataforma
    if (game.id === 'una_olla') {
      return true;
    }

    return false;
  }

  /**
   * Obtiene la etiqueta / badge adecuada para el juego
   */
  public static getGameBadge(rawId: string): string | null {
    const game = this.getGameById(rawId);
    if (!game) return null;

    if (this.isGameNew(rawId)) {
      return game.badgeText || '🆕 NUEVO JUEGO';
    }

    if (game.id === 'bingo') {
      return '🔥 SALAS EN VIVO';
    }

    if (game.id === 'polla_venezolana') {
      return '💰 POZO DIARIO';
    }

    if (game.id === 'domino_venezolano' || game.id === 'truco_venezolano') {
      return '⭐ POPULAR';
    }

    return null;
  }

  /**
   * Determina si el juego opera mediante el sistema de Mesas y Salas
   */
  public static isTableGame(rawId: string): boolean {
    const canonical = normalizeCanonicalGameId(rawId);
    if (canonical === 'polla_venezolana') return false;
    return true;
  }

  /**
   * Determina si el juego es un Sorteo Global Permanente (Polla)
   */
  public static isGlobalDraw(rawId: string): boolean {
    const canonical = normalizeCanonicalGameId(rawId);
    return canonical === 'polla_venezolana';
  }

  /**
   * Resuelve el CTA canónico para el juego dependiendo del estado de autenticación
   */
  public static getCtaConfig(rawId: string): GameCtaConfig {
    const canonical = normalizeCanonicalGameId(rawId);

    switch (canonical) {
      case 'polla_venezolana':
        return {
          label: 'JUGAR LA POLLA',
          guestLabel: 'INICIA SESIÓN PARA JUGAR',
          action: 'OPEN_POLLA',
          tab: 'polla',
        };

      case 'atrapaito':
        return {
          label: 'JUGAR ATRAPAÍTO',
          guestLabel: 'INICIA SESIÓN PARA JUGAR',
          action: 'PLAY_GAME',
          tab: 'atrapaito',
        };

      case 'bingo':
        return {
          label: 'ENTRAR AL BINGO',
          guestLabel: 'INICIA SESIÓN PARA CANTAR',
          action: 'OPEN_TABLES',
          tab: 'tables',
        };

      case 'truco_venezolano':
        return {
          label: 'CREAR MESA DE TRUCO',
          guestLabel: 'INICIA SESIÓN PARA JUGAR',
          action: 'CREATE_TABLE',
          tab: 'tables',
        };

      case 'una_olla':
        return {
          label: 'CREAR MESA UNA-OLLA',
          guestLabel: 'INICIA SESIÓN PARA JUGAR',
          action: 'CREATE_TABLE',
          tab: 'tables',
        };

      case 'domino_venezolano':
      default:
        return {
          label: 'CREAR MESA',
          guestLabel: 'INICIA SESIÓN PARA CREAR MESA',
          action: 'CREATE_TABLE',
          tab: 'tables',
        };
    }
  }

  /**
   * Obtiene la etiqueta CTA formateada para el juego según estado de autenticación
   */
  public static getGameCtaLabel(rawId: string, isAuthenticated: boolean = false): string {
    const config = this.getCtaConfig(rawId);
    return isAuthenticated ? config.label : config.guestLabel;
  }

  /**
   * Obtiene la lista de juegos nuevos para promoción destacada automática
   */
  public static getNewGames(): GameMetadata[] {
    return this.getAllGames().filter((g) => this.isGameNew(g.id));
  }
}
