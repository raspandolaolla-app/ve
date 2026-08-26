// ==============================================================================
// RASPANDO LA OLLA — CONTEXTO Y PROVEEDOR DE AUTENTICACIÓN (FASE 21)
// ==============================================================================
// Autenticación real con Google OAuth mediante Supabase Auth.
// Manejo seguro de sesiones, redirecciones de producción y resolución de perfiles.
// ==============================================================================

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase/client';
import type { AuthState, AuthSession, AuthErrorDetails } from '../../types/auth';
import type { UserProfile } from '../../types/profile';
import type { UserRole } from '../../types/admin';
import { ProfileRepository } from '../../services/repositories/ProfileRepository';
import { AdminRepository } from '../../services/repositories/AdminRepository';

interface AuthContextValue {
  state: AuthState;
  user: User | null;
  session: AuthSession | null;
  profile: UserProfile | null;
  role: UserRole;
  error: AuthErrorDetails | null;
  isConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Calcula la URL de redirección absoluta de OAuth respetando subdirectorios de GitHub Pages,
 * Netlify o variables de entorno personalizadas.
 */
function getOAuthRedirectUrl(): string {
  const explicitUrl = import.meta.env.VITE_APP_URL as string | undefined;
  if (explicitUrl && explicitUrl.trim() !== '') {
    return explicitUrl.trim();
  }

  if (typeof window !== 'undefined') {
    const { origin, pathname } = window.location;
    // Si la ruta contiene un archivo o hash, tomar la base del directorio
    const cleanPath = pathname.endsWith('/')
      ? pathname
      : pathname.includes('.')
        ? pathname.substring(0, pathname.lastIndexOf('/') + 1)
        : `${pathname}/`;
    return `${origin}${cleanPath}`;
  }

  return 'http://localhost:3000/';
}

/**
 * Traduce cualquier mensaje de error técnico a un texto amigable para el usuario.
 */
function sanitizeAuthError(rawError: unknown): { code: string; message: string; userFriendlyMessage: string } {
  const rawMsg = rawError instanceof Error ? rawError.message : String(rawError || '');
  const lower = rawMsg.toLowerCase();

  let userFriendly = 'Ocurrió un inconveniente al procesar tu acceso. Por favor intenta nuevamente.';
  let code = 'AUTH_ERROR';

  if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('fetch failed')) {
    userFriendly = 'Problema de conexión con el servidor. Revisa tu acceso a internet e inténtalo de nuevo.';
    code = 'NETWORK_ERROR';
  } else if (lower.includes('popup') || lower.includes('closed by user') || lower.includes('user cancelled')) {
    userFriendly = 'La ventana de identificación con Google fue cancelada.';
    code = 'OAUTH_CANCELLED';
  } else if (lower.includes('provider is not enabled') || lower.includes('unsupported provider')) {
    userFriendly = 'El servicio de acceso con Google se encuentra en mantenimiento. Intenta más tarde.';
    code = 'PROVIDER_UNAVAILABLE';
  } else if (lower.includes('invalid claim') || lower.includes('jwt') || lower.includes('expired')) {
    userFriendly = 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.';
    code = 'SESSION_EXPIRED';
  } else if (lower.includes('rate limit') || lower.includes('too many requests')) {
    userFriendly = 'Demasiados intentos seguidos. Por favor espera unos momentos antes de reintentar.';
    code = 'RATE_LIMIT';
  }

  return {
    code,
    message: rawMsg,
    userFriendlyMessage: userFriendly,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole>('PLAYER');
  const [error, setError] = useState<AuthErrorDetails | null>(null);

  const supabase = getSupabaseClient();

  const handleSession = async (currentSession: Session | null) => {
    if (!currentSession || !currentSession.user) {
      setUser(null);
      setSession(null);
      setProfile(null);
      setRole('PLAYER');
      setState('unauthenticated');
      return;
    }

    try {
      const authUser = currentSession.user;
      setUser(authUser);

      const parsedSession: AuthSession = {
        userId: authUser.id,
        email: authUser.email || null,
        aal: (currentSession.user.app_metadata?.aal as 'aal1' | 'aal2') || 'aal1',
        hasMfaEnrolled: Boolean(authUser.factors && authUser.factors.length > 0),
        expiresAt: currentSession.expires_at,
      };
      setSession(parsedSession);

      // Cargar perfil y rol verificados desde Supabase
      const [fetchedProfile, fetchedRole] = await Promise.all([
        ProfileRepository.getCurrentProfile(authUser.id),
        AdminRepository.getUserRole(authUser.id),
      ]);

      // Si el perfil aún no existe en base de datos (primer acceso con Google),
      // construimos un perfil amigable a partir de los metadatos de Google
      if (fetchedProfile) {
        setProfile(fetchedProfile);
      } else {
        const metadata = authUser.user_metadata || {};
        const fullName = metadata.full_name || metadata.name || '';
        const nameParts = fullName.trim().split(' ');
        const firstName = metadata.given_name || nameParts[0] || 'Jugador';
        const lastName = metadata.family_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
        const avatarUrl = metadata.avatar_url || metadata.picture || undefined;

        setProfile({
          id: authUser.id,
          firstName,
          lastName,
          email: authUser.email || '',
          phoneMasked: '',
          cedulaMasked: '',
          state: 'Distrito Capital',
          birthDate: null,
          isAdult: true,
          avatarUrl,
          accountStatus: 'ACTIVE',
          identityVerificationStatus: 'PENDING',
          humanVerificationStatus: 'VERIFIED',
          twoFactorEnabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      setRole(fetchedRole);
      setState('authenticated');
    } catch (err: unknown) {
      console.error('[AuthProvider] Error procesando sesión:', err);
      const sanitized = sanitizeAuthError(err);
      setError({
        code: sanitized.code,
        message: sanitized.message,
        userFriendlyMessage: sanitized.userFriendlyMessage,
      });
      setState('error');
    }
  };

  useEffect(() => {
    // Detectar errores en los parámetros de retorno OAuth de la URL
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const urlError = urlParams.get('error_description') || hashParams.get('error_description');

      if (urlError) {
        const sanitized = sanitizeAuthError(urlError);
        setError({
          code: 'OAUTH_RETURN_ERROR',
          message: urlError,
          userFriendlyMessage: sanitized.userFriendlyMessage,
        });
        // Limpiar parámetros de error de la barra de direcciones
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    if (!supabase) {
      setState('unauthenticated');
      return;
    }

    // 1. Obtener sesión inicial
    supabase.auth.getSession().then(({ data: { session: initialSession }, error: sessionError }) => {
      if (sessionError) {
        console.error('[AuthProvider] Error al obtener sesión inicial:', sessionError.message);
        const sanitized = sanitizeAuthError(sessionError);
        setError({
          code: sanitized.code,
          message: sanitized.message,
          userFriendlyMessage: sanitized.userFriendlyMessage,
        });
        setState('unauthenticated');
        return;
      }
      handleSession(initialSession);
    });

    // 2. Suscribirse a cambios en el estado de autenticación de Supabase
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, updatedSession) => {
        await handleSession(updatedSession);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const refreshProfile = async () => {
    if (!user) return;
    const fetchedProfile = await ProfileRepository.getCurrentProfile(user.id);
    if (fetchedProfile) {
      setProfile(fetchedProfile);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const signInWithGoogle = async () => {
    setError(null);

    if (!supabase) {
      setError({
        code: 'NOT_CONFIGURED',
        message: 'Las variables de entorno no están configuradas.',
        userFriendlyMessage: 'La conexión con el servidor está en proceso de configuración.',
      });
      return;
    }

    try {
      const redirectUrl = getOAuthRedirectUrl();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (signInError) {
        throw signInError;
      }
    } catch (err: unknown) {
      const sanitized = sanitizeAuthError(err);
      setError({
        code: sanitized.code,
        message: sanitized.message,
        userFriendlyMessage: sanitized.userFriendlyMessage,
      });
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setProfile(null);
      setRole('PLAYER');
      setState('unauthenticated');
      setError(null);
    } catch (err) {
      console.error('[AuthProvider] Error al cerrar sesión:', err);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user,
      session,
      profile,
      role,
      error,
      isConfigured: isSupabaseConfigured,
      signInWithGoogle,
      signOut,
      refreshProfile,
      clearError,
    }),
    [state, user, session, profile, role, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
}

