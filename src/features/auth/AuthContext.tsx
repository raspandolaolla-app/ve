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
import { sanitizeUserErrorMessage, classifyError } from '../../utils/errorSanitizer';

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
  const classified = classifyError(rawError);

  let code = 'AUTH_ERROR';
  let userFriendlyMessage = classified.userMessage;

  if (
    lower.includes('provider') ||
    lower.includes('not enabled') ||
    lower.includes('unsupported provider') ||
    lower.includes('not_configured') ||
    lower.includes('missing supabase')
  ) {
    code = 'PROVIDER_UNAVAILABLE';
    userFriendlyMessage = 'El servicio de autenticación no está disponible temporalmente.';
  } else if (
    lower.includes('popup closed') ||
    lower.includes('user cancelled') ||
    lower.includes('closed by user') ||
    lower.includes('access_denied')
  ) {
    code = 'OAUTH_CANCELLED';
    userFriendlyMessage = 'El inicio de sesión fue cancelado. Puedes intentarlo de nuevo cuando desees.';
  } else if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout') || lower.includes('connection')) {
    code = 'NETWORK_ERROR';
    userFriendlyMessage = 'Problema de conexión con el servidor. Revisa tu acceso a internet e inténtalo de nuevo.';
  } else if (lower.includes('rate limit') || lower.includes('429')) {
    code = 'RATE_LIMIT';
    userFriendlyMessage = 'Demasiados intentos seguidos. Por favor espera unos momentos antes de reintentar.';
  } else if (lower.includes('jwt') || lower.includes('expired') || lower.includes('invalid claim')) {
    code = 'SESSION_EXPIRED';
    userFriendlyMessage = 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.';
  } else if (classified.category === 'MAINTENANCE') {
    code = 'MAINTENANCE';
    userFriendlyMessage = classified.userMessage;
  } else if (classified.category === 'UNKNOWN_ERROR') {
    code = 'AUTH_ERROR';
    userFriendlyMessage = 'No fue posible iniciar sesión con Google. Verifica tu conexión e inténtalo nuevamente.';
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

  const loadedUserIdRef = React.useRef<string | null>(null);
  const supabase = getSupabaseClient();

  const handleSession = async (currentSession: Session | null, forceReload = false) => {
    if (typeof window !== 'undefined' && window.localStorage.getItem('playwright-mock-auth')) {
      console.log('[AUTH] Ignorando handleSession debido a sesión mock de Playwright activa');
      return;
    }

    if (!currentSession || !currentSession.user) {
      console.log('[AUTH] Usuario desconectado (sin sesión activa)');
      loadedUserIdRef.current = null;
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
      const isSameUser = loadedUserIdRef.current === authUser.id;

      setUser(authUser);

      const parsedSession: AuthSession = {
        userId: authUser.id,
        email: authUser.email || null,
        expiresAt: currentSession.expires_at,
      };
      setSession(parsedSession);

      // Comprobar estado de aceptación de términos v1.0
      const isTermsAccepted = TermsService.hasAcceptedCurrentTerms(authUser.id, authUser.user_metadata);
      setHasAcceptedTerms(isTermsAccepted);
      const record = TermsService.getAcceptanceRecord(authUser.id);
      setTermsRecord(record);

      // Evitar recargar perfil innecesariamente si es el mismo usuario y ya está cargado
      if (isSameUser && !forceReload && profile) {
        setState('authenticated');
        setIsSigningIn(false);
        setError(null);
        return;
      }

      console.log('[AUTH] Cargando sesión y perfil para:', authUser.email || authUser.id);
      loadedUserIdRef.current = authUser.id;

      // Cargar perfil y rol de forma segura sin romper la sesión en caso de latencia o error de red
      let fetchedProfile: UserProfile | null = null;
      let fetchedRole: UserRole = 'PLAYER';

      const metadata = authUser.user_metadata || {};
      const googleAvatar = metadata.avatar_url || metadata.picture || null;
      const fullName = metadata.full_name || metadata.name || '';
      const nameParts = fullName.trim().split(' ');
      const googleFirstName = metadata.given_name || nameParts[0] || '';
      const googleLastName = metadata.family_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');

      // Garantizar que exista registro en profiles, wallets y user_roles en Supabase
      try {
        fetchedProfile = await ProfileRepository.ensureProfileExists(
          authUser.id,
          authUser.email || '',
          {
            firstName: googleFirstName || 'Jugador',
            lastName: googleLastName || '',
            avatarUrl: googleAvatar,
          }
        );
      } catch (pErr) {
        console.warn('[AUTH] Error asegurando perfil en DB, reintentando consulta:', pErr);
        try {
          fetchedProfile = await ProfileRepository.getCurrentProfile(authUser.id);
        } catch {
          // fallback
        }
      }

      try {
        fetchedRole = await AdminRepository.getUserRole(authUser.id);
      } catch (rErr) {
        console.warn('[AUTH] Error recuperando rol desde DB, asignando PLAYER por defecto:', rErr);
      }

      if (fetchedProfile) {
        const mergedProfile: UserProfile = {
          ...fetchedProfile,
          firstName: googleFirstName || fetchedProfile.firstName || 'Jugador',
          lastName: googleLastName || fetchedProfile.lastName || '',
          email: authUser.email || fetchedProfile.email || '',
          avatarUrl: googleAvatar || fetchedProfile.avatarUrl || null,
        };
        setProfile(mergedProfile);
        console.log('[AUTH] Perfil garantizado y sincronizado con Google:', mergedProfile.firstName, mergedProfile.lastName);
      } else {
        setProfile({
          id: authUser.id,
          firstName: googleFirstName || 'Jugador',
          lastName: googleLastName || '',
          email: authUser.email || '',
          phoneMasked: '',
          cedulaMasked: '',
          state: 'Distrito Capital',
          birthDate: null,
          isAdult: true,
          avatarUrl: googleAvatar,
          accountStatus: 'active',
          identityVerificationStatus: 'pending',
          humanVerificationStatus: 'approved',
          isMfaEnabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        console.log('[AUTH] Perfil cargado en memoria local');
      }

      // Regla de Seguridad Inmutable:
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
      setError(null);
    } catch (err: unknown) {
      console.error('[AUTH] Error de sesión procesando autenticación:', err);
      if (currentSession?.user) {
        // Garantizar persistencia de sesión si la cuenta está autenticada
        setUser(currentSession.user);
        setState('authenticated');
      } else {
        const sanitized = sanitizeAuthError(err);
        setError(sanitized);
        setState('error');
      }
      setIsSigningIn(false);
    }
  };

  useEffect(() => {
    // 0. Autenticación Mock de Playwright para pruebas E2E sin Google OAuth
    if (typeof window !== 'undefined') {
      const mockAuthStr = window.localStorage.getItem('playwright-mock-auth');
      if (mockAuthStr) {
        try {
          const mockData = JSON.parse(mockAuthStr);
          setUser(mockData.user);
          setSession(mockData.session);
          setProfile(mockData.profile);
          setRole(mockData.role || 'PLAYER');
          setHasAcceptedTerms(true);
          setState('authenticated');
          setIsSigningIn(false);
          console.log('[AUTH] E2E Playwright Mock Auth inicializado con éxito');
          return;
        } catch (e) {
          console.error('[AUTH] Error al cargar sesión mock de Playwright:', e);
        }
      }
    }

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
        console.error('[AUTH] Error de sesión en URL OAuth:', urlError);
        const sanitized = sanitizeAuthError(urlError);
        setError({
          code: 'OAUTH_RETURN_ERROR',
          message: urlError,
          userFriendlyMessage: sanitized.userFriendlyMessage,
        });
        window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
      }
    }

    if (!supabase) {
      setState('unauthenticated');
      return;
    }

    // 2. Obtener sesión inicial (procesa automáticamente código PKCE en URL con detectSessionInUrl)
    supabase.auth.getSession().then(({ data: { session: initialSession }, error: sessionError }) => {
      if (typeof window !== 'undefined' && window.localStorage.getItem('playwright-mock-auth')) {
        console.log('[AUTH] Ignorando resultado de getSession debido a sesión mock de Playwright activa');
        return;
      }

      if (sessionError) {
        console.error('[AUTH] Error de sesión inicial:', sessionError.message);
        if (sessionError.message.toLowerCase().includes('expired') || sessionError.message.toLowerCase().includes('jwt')) {
          console.warn('[AUTH] Token expirado');
        }
        const sanitized = sanitizeAuthError(sessionError);
        setError(sanitized);
        setState('unauthenticated');
        return;
      }

      if (initialSession) {
        console.log('[AUTH] Sesión obtenida al arrancar');
        handleSession(initialSession);
      } else {
        setState('unauthenticated');
      }

      if (typeof window !== 'undefined' && window.location.search.includes('code=')) {
        window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
      }
    });

    // 3. Suscribirse a cambios en el estado de autenticación de Supabase
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, updatedSession) => {
        if (typeof window !== 'undefined' && window.localStorage.getItem('playwright-mock-auth')) {
          console.log('[AUTH] Ignorando evento onAuthStateChange debido a sesión mock de Playwright activa');
          return;
        }
        console.log(`[AUTH] Sesión cambió. Evento: ${event}`, updatedSession?.user?.email || '');

        if (event === 'SIGNED_OUT') {
          console.log('[AUTH] Usuario desconectado');
          setUser(null);
          setSession(null);
          setProfile(null);
          setRole('PLAYER');
          setState('unauthenticated');
          setIsSigningIn(false);
          return;
        }

        if (event === 'SIGNED_IN') {
          console.log('[AUTH] Login correcto');
          setIsSigningIn(false);
          await handleSession(updatedSession);
        } else if (event === 'TOKEN_REFRESHED') {
          console.log('[AUTH] Token renovado');
          await handleSession(updatedSession);
        } else if (event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
          await handleSession(updatedSession);
        } else if (updatedSession) {
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
    try {
      const fetchedProfile = await ProfileRepository.getCurrentProfile(user.id);
      if (fetchedProfile) {
        setProfile(fetchedProfile);
        console.log('[AUTH] Perfil cargado (refresco manual)');
      }
    } catch (err) {
      console.warn('[AUTH] Error al refrescar perfil:', err);
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
    if (isSigningIn) return;
    setIsSigningIn(true);
    setError(null);

    if (!supabase || !isSupabaseConfigured) {
      console.warn('[AUTH] Servicio de autenticación no inicializado.');
      setIsSigningIn(false);
      setError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Authentication service is initializing or credentials are not yet loaded.',
        userFriendlyMessage: 'Estamos preparando la conexión. Intenta nuevamente en unos segundos.',
      });
      return;
    }

    try {
      const redirectUrl = getOAuthRedirectUrl();
      console.info('[AUTH] Iniciando OAuth Google. Redirect URL:', redirectUrl);

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
      console.error('[AUTH] Error de sesión iniciando Google OAuth:', err);
      setIsSigningIn(false);
      const sanitized = sanitizeAuthError(err);
      setError(sanitized);
    }
  };

  const signOut = async () => {
    console.log('[AUTH] Logout solicitado');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('playwright-mock-auth');
    }
    if (!supabase) return;
    try {
      try {
        await AdminRepository.endUserSession();
      } catch (err) {
        // Ignorar fallo en registro de actividad
      }
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setProfile(null);
      setRole('PLAYER');
      setState('unauthenticated');
      setError(null);
      setIsSigningIn(false);
    } catch (err) {
      console.error('[AUTH] Error al cerrar sesión:', err);
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
