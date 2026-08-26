// ==============================================================================
// RASPANDO LA OLLA — CONTEXTO Y PROVEEDOR DE AUTENTICACIÓN (FASE 21)
// ==============================================================================
// Autenticación real con Google OAuth mediante Supabase Auth y flujo PKCE.
// Manejo seguro de sesiones, redirecciones en producción, roles protegidos y perfiles.
// ==============================================================================

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase/client';
import type { AuthState, AuthSession, AuthErrorDetails } from '../../types/auth';
import type { UserProfile } from '../../types/profile';
import type { UserRole } from '../../types/admin';
import type { TermsAcceptanceRecord } from '../../types/legal';
import { AUTHORIZED_SUPER_ADMIN_EMAILS } from '../../utils/constants';
import { ProfileRepository } from '../../services/repositories/ProfileRepository';
import { AdminRepository } from '../../services/repositories/AdminRepository';
import { TermsService } from '../../services/legal/TermsService';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';

interface AuthContextValue {
  state: AuthState;
  user: User | null;
  session: AuthSession | null;
  profile: UserProfile | null;
  role: UserRole;
  error: AuthErrorDetails | null;
  isSigningIn: boolean;
  isConfigured: boolean;
  hasAcceptedTerms: boolean;
  termsRecord: TermsAcceptanceRecord | null;
  confirmTermsAccepted: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Calcula la URL de redirección absoluta de OAuth respetando:
 * - VITE_APP_URL explícito si está configurado.
 * - Subdirectorios de GitHub Pages (ej. /ve/ o /raspando-la-olla/).
 * - Despliegues en Netlify, entornos locales o dominio personalizado.
 */
export function getOAuthRedirectUrl(): string {
  const explicitUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
  const rawBasePath =
    (import.meta.env.VITE_APP_BASE_PATH as string | undefined)?.trim() ||
    (import.meta.env.BASE_URL as string | undefined)?.trim() ||
    '/';
  const cleanBasePath = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`;
  const normalizedBasePath = cleanBasePath.endsWith('/') ? cleanBasePath : `${cleanBasePath}/`;

  if (explicitUrl && explicitUrl !== '') {
    const cleanUrl = explicitUrl.replace(/\/+$/, '');
    const strippedBasePath = normalizedBasePath.replace(/^\/|\/$/g, '');

    // Si explicitUrl ya incluye el subdirectorio de basePath al final, evitar duplicidad
    if (strippedBasePath && cleanUrl.endsWith(`/${strippedBasePath}`)) {
      return `${cleanUrl}/`;
    }
    return `${cleanUrl}${normalizedBasePath}`;
  }

  if (typeof window !== 'undefined' && window.location) {
    const { origin, pathname } = window.location;
    const cleanOrigin = origin.replace(/\/+$/, '');

    // Normalizar la ruta eliminando nombres de archivo (como index.html o 404.html)
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0 && segments[segments.length - 1].includes('.')) {
      segments.pop();
    }
    const cleanPath = segments.length > 0 ? `/${segments.join('/')}/` : normalizedBasePath;
    return `${cleanOrigin}${cleanPath}`;
  }

  return 'http://localhost:3000/';
}

/**
 * Traduce cualquier mensaje de error técnico de autenticación a un formato estructurado amigable.
 */
function sanitizeAuthError(rawError: unknown): AuthErrorDetails {
  const rawMsg = rawError instanceof Error ? rawError.message : String(rawError || '');
  const lower = rawMsg.toLowerCase();

  const userFriendlyMessage = sanitizeUserErrorMessage(
    rawError,
    'No fue posible iniciar sesión con Google. Verifica tu conexión e inténtalo nuevamente.'
  );

  let code = 'AUTH_ERROR';
  if (
    lower.includes('provider') ||
    lower.includes('not enabled') ||
    lower.includes('unsupported provider') ||
    lower.includes('not_configured')
  ) {
    code = 'PROVIDER_UNAVAILABLE';
  } else if (
    lower.includes('popup closed') ||
    lower.includes('user cancelled') ||
    lower.includes('closed by user') ||
    lower.includes('access_denied')
  ) {
    code = 'OAUTH_CANCELLED';
  } else if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    code = 'NETWORK_ERROR';
  } else if (lower.includes('rate limit') || lower.includes('429')) {
    code = 'RATE_LIMIT';
  } else if (lower.includes('jwt') || lower.includes('expired') || lower.includes('invalid claim')) {
    code = 'SESSION_EXPIRED';
  }

  return {
    code,
    message: rawMsg,
    userFriendlyMessage,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole>('PLAYER');
  const [error, setError] = useState<AuthErrorDetails | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState<boolean>(false);
  const [termsRecord, setTermsRecord] = useState<TermsAcceptanceRecord | null>(null);

  const supabase = getSupabaseClient();

  const handleSession = async (currentSession: Session | null) => {
    if (!currentSession || !currentSession.user) {
      setUser(null);
      setSession(null);
      setProfile(null);
      setRole('PLAYER');
      setHasAcceptedTerms(false);
      setTermsRecord(null);
      setState('unauthenticated');
      setIsSigningIn(false);
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

      // Comprobar estado de aceptación de términos v1.0
      const isTermsAccepted = TermsService.hasAcceptedCurrentTerms(authUser.id, authUser.user_metadata);
      setHasAcceptedTerms(isTermsAccepted);
      const record = TermsService.getAcceptanceRecord(authUser.id);
      setTermsRecord(record);

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

      // Regla de Seguridad Inmutable:
      // Solo los dos correos autorizados pueden ejercer SUPER_ADMIN.
      const isWhitelistedSuperAdmin =
        authUser.email &&
        AUTHORIZED_SUPER_ADMIN_EMAILS.some(
          (adminEmail) => adminEmail.toLowerCase() === authUser.email?.toLowerCase().trim()
        );

      let effectiveRole: UserRole = 'PLAYER';
      if (isWhitelistedSuperAdmin) {
        effectiveRole = 'SUPER_ADMIN';
      } else if (fetchedRole === 'ADMIN' || fetchedRole === 'OPERATOR') {
        effectiveRole = fetchedRole;
      } else {
        effectiveRole = 'PLAYER';
      }

      setRole(effectiveRole);
      setState('authenticated');
      setIsSigningIn(false);
    } catch (err: unknown) {
      console.error('[AuthProvider] Error procesando sesión:', err);
      const sanitized = sanitizeAuthError(err);
      setError(sanitized);
      setState('error');
      setIsSigningIn(false);
    }
  };

  useEffect(() => {
    // 1. Detectar errores de retorno OAuth en parámetros de URL
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash
      );
      const urlError =
        urlParams.get('error_description') ||
        urlParams.get('error') ||
        hashParams.get('error_description') ||
        hashParams.get('error');

      if (urlError) {
        console.error('[AuthProvider] Error retornado en URL de OAuth:', urlError);
        const sanitized = sanitizeAuthError(urlError);
        setError({
          code: 'OAUTH_RETURN_ERROR',
          message: urlError,
          userFriendlyMessage: sanitized.userFriendlyMessage,
        });
        // Limpiar parámetros de error de la barra de direcciones de forma limpia
        window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
      }
    }

    if (!supabase) {
      setState('unauthenticated');
      return;
    }

    // 2. Obtener sesión inicial (procesa automáticamente código PKCE en URL con detectSessionInUrl)
    supabase.auth.getSession().then(({ data: { session: initialSession }, error: sessionError }) => {
      if (sessionError) {
        console.error('[AuthProvider] Error al obtener sesión inicial:', sessionError.message);
        const sanitized = sanitizeAuthError(sessionError);
        setError(sanitized);
        setState('unauthenticated');
        return;
      }
      handleSession(initialSession);

      // Limpiar query params de autenticación si se completó el intercambio de código
      if (typeof window !== 'undefined' && window.location.search.includes('code=')) {
        window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
      }
    });

    // 3. Suscribirse a cambios en el estado de autenticación de Supabase
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, updatedSession) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
          setProfile(null);
          setRole('PLAYER');
          setState('unauthenticated');
          setIsSigningIn(false);
          return;
        }

        if (
          event === 'SIGNED_IN' ||
          event === 'INITIAL_SESSION' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          setIsSigningIn(false);
          await handleSession(updatedSession);
        }
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

  const confirmTermsAccepted = async () => {
    if (!user) return;
    const { success, record } = await TermsService.recordAcceptance(user.id, user.email);
    if (success) {
      setHasAcceptedTerms(true);
      setTermsRecord(record);
    }
  };

  const signInWithGoogle = async () => {
    if (isSigningIn) return; // Impedir doble clic concurrente
    setIsSigningIn(true);
    setError(null);

    if (!supabase || !isSupabaseConfigured) {
      console.warn('[AuthProvider] Supabase client no configurado o ausente.');
      setIsSigningIn(false);
      setError({
        code: 'PROVIDER_UNAVAILABLE',
        message: 'Las variables de entorno de Supabase no están configuradas.',
        userFriendlyMessage: 'El inicio de sesión con Google todavía no está disponible. Inténtalo nuevamente más tarde.',
      });
      return;
    }

    try {
      const redirectUrl = getOAuthRedirectUrl();
      console.info('[AuthProvider] Iniciando flujo OAuth con Google. Redirect URL:', redirectUrl);

      const { data, error: signInError } = await supabase.auth.signInWithOAuth({
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

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      console.error('[AuthProvider] Error iniciando Google OAuth:', err);
      setIsSigningIn(false);
      const sanitized = sanitizeAuthError(err);
      setError(sanitized);
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
      setIsSigningIn(false);
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
      isSigningIn,
      isConfigured: isSupabaseConfigured,
      hasAcceptedTerms,
      termsRecord,
      confirmTermsAccepted,
      signInWithGoogle,
      signOut,
      refreshProfile,
      clearError,
    }),
    [state, user, session, profile, role, error, isSigningIn, hasAcceptedTerms, termsRecord]
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
