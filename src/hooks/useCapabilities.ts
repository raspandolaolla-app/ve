// ==============================================================================
// RASPANDO LA OLLA — SISTEMA CENTRAL DE CAPACIDADES Y ACCESO (USE CAPABILITIES)
// ==============================================================================
// Control centralizado de visibilidad y autorización para visitantes vs usuarios
// autenticados. Previene condiciones aisladas en componentes y asegura que cualquier
// intento de acción protegida por un visitante abra el modal de login contextual
// preservando el juego y la acción prevista.
// ==============================================================================

import { useCallback, useMemo } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { GameRegistry } from '../services/games/GameRegistry';

export type ProtectedActionType =
  | 'CREATE_TABLE'
  | 'JOIN_TABLE'
  | 'WALLET'
  | 'POLLA'
  | 'PLAY_GAME'
  | 'PROFILE'
  | 'ADMIN';

export interface ProtectedActionRequest {
  type: ProtectedActionType;
  gameId?: string;
  tab?: string;
  tableId?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export const PENDING_ACTION_STORAGE_KEY = 'pending_guest_action';

export function useCapabilities() {
  const { state, user, profile, role, openLoginModal } = useAuth();

  const isAuthenticated = state === 'authenticated' && user !== null;
  const isAccountActive = profile?.accountStatus === 'active';

  // ----------------------------------------------------------------------------
  // CAPACIDADES CENTRALIZADAS
  // ----------------------------------------------------------------------------

  // 1. Contenido público para visitantes y jugadores
  const canViewPublicContent = true;
  const canViewGameRules = true;
  const canViewPublicTournaments = true;
  const canViewPublicHistory = true;

  // 2. Operaciones de juego y mesas (Privadas)
  const canCreateTable = isAuthenticated && isAccountActive;
  const canJoinTable = isAuthenticated && isAccountActive;
  const canPlay = isAuthenticated && isAccountActive;

  // 3. Operaciones financieras y billetera (Privadas)
  const canUseWallet = isAuthenticated && isAccountActive;
  const canBuy = isAuthenticated && isAccountActive;

  // 4. Polla Venezolana participación con saldo (Privada)
  const canAccessPolla = isAuthenticated && isAccountActive;

  // 5. Perfil personal
  const canAccessProfile = isAuthenticated;

  // 6. Panel de administración
  const canAccessAdmin = isAuthenticated && (role === 'ADMIN' || role === 'SUPER_ADMIN');

  /**
   * Genera el mensaje contextual amigable para el modal de inicio de sesión
   */
  const getContextualLoginMessage = useCallback((action: ProtectedActionRequest): string => {
    if (action.reason) {
      return action.reason;
    }
    const game = action.gameId ? GameRegistry.getGameById(action.gameId) : undefined;
    const gameName = game ? game.name : 'este juego';

    switch (action.type) {
      case 'CREATE_TABLE':
        return `Inicia sesión para crear una mesa de ${gameName}.`;
      case 'JOIN_TABLE':
        return `Inicia sesión para unirte a la mesa de ${gameName}.`;
      case 'POLLA':
        return 'Inicia sesión para jugar la Polla Venezolana y registrar tus pronósticos.';
      case 'WALLET':
        return 'Inicia sesión para acceder a tu Billetera, consultar saldo y recargar fondos.';
      case 'PLAY_GAME':
        return `Inicia sesión para jugar ${gameName} en tiempo real.`;
      case 'PROFILE':
        return 'Inicia sesión para ver tu perfil de jugador.';
      case 'ADMIN':
        return 'Acceso restringido a administradores autorizados.';
      default:
        return 'Inicia sesión para continuar.';
    }
  }, []);

  /**
   * Ejecuta la acción si el usuario posee la capacidad requerida;
   * si es visitante no autenticado, almacena el contexto en sessionStorage
   * y abre el flujo contextual "Inicia sesión para continuar".
   * Retorna true si fue autorizado de inmediato, false si solicitó login.
   */
  const executeOrPromptLogin = useCallback(
    (action: ProtectedActionRequest, onAuthorized?: () => void): boolean => {
      let isAuthorized = false;

      switch (action.type) {
        case 'CREATE_TABLE':
          isAuthorized = canCreateTable;
          break;
        case 'JOIN_TABLE':
          isAuthorized = canJoinTable;
          break;
        case 'WALLET':
          isAuthorized = canUseWallet;
          break;
        case 'POLLA':
          isAuthorized = canAccessPolla;
          break;
        case 'PLAY_GAME':
          isAuthorized = canPlay;
          break;
        case 'PROFILE':
          isAuthorized = canAccessProfile;
          break;
        case 'ADMIN':
          isAuthorized = canAccessAdmin;
          break;
        default:
          isAuthorized = isAuthenticated;
      }

      if (isAuthorized) {
        if (onAuthorized) onAuthorized();
        return true;
      }

      // No autenticado o no autorizado: guardar acción para retomar tras login
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(
            PENDING_ACTION_STORAGE_KEY,
            JSON.stringify({
              ...action,
              timestamp: Date.now(),
            })
          );
        }
      } catch (err) {
        console.warn('[useCapabilities] No se pudo guardar acción pendiente:', err);
      }

      const promptMessage = getContextualLoginMessage(action);
      openLoginModal(promptMessage);
      return false;
    },
    [
      canCreateTable,
      canJoinTable,
      canUseWallet,
      canAccessPolla,
      canPlay,
      canAccessProfile,
      canAccessAdmin,
      isAuthenticated,
      getContextualLoginMessage,
      openLoginModal,
    ]
  );

  /**
   * Recupera y limpia cualquier acción pendiente guardada en sessionStorage
   */
  const retrievePendingAction = useCallback((): ProtectedActionRequest | null => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY);
        if (raw) {
          window.sessionStorage.removeItem(PENDING_ACTION_STORAGE_KEY);
          const parsed = JSON.parse(raw);
          // Válido si tiene menos de 10 minutos
          if (Date.now() - (parsed.timestamp || 0) < 10 * 60 * 1000) {
            return parsed as ProtectedActionRequest;
          }
        }
      }
    } catch {
      // Ignorar errores de parseo
    }
    return null;
  }, []);

  return useMemo(
    () => ({
      isAuthenticated,
      canViewPublicContent,
      canViewGameRules,
      canViewPublicTournaments,
      canViewPublicHistory,
      canCreateTable,
      canJoinTable,
      canUseWallet,
      canBuy,
      canPlay,
      canAccessPolla,
      canAccessProfile,
      canAccessAdmin,
      executeOrPromptLogin,
      retrievePendingAction,
    }),
    [
      isAuthenticated,
      canViewPublicContent,
      canViewGameRules,
      canViewPublicTournaments,
      canViewPublicHistory,
      canCreateTable,
      canJoinTable,
      canUseWallet,
      canBuy,
      canPlay,
      canAccessPolla,
      canAccessProfile,
      canAccessAdmin,
      executeOrPromptLogin,
      retrievePendingAction,
    ]
  );
}
