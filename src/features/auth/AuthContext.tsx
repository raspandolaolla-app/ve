// ==============================================================================
// RASPANDO LA OLLA — CONTEXTO Y PROVEEDOR DE AUTENTICACIÓN
// ==============================================================================
// Maneja el estado real de autenticación mediante Supabase Auth.
// Si no hay sesión válida en Supabase, el estado es 'unauthenticated'.
// NO se admiten usuarios simulados ni banderas falsas.
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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

      setProfile(fetchedProfile);
      setRole(fetchedRole);
      setState('authenticated');
    } catch (err: unknown) {
      console.error('[AuthProvider] Error procesando sesión:', err);
      setError({
        code: 'SESSION_PROCESSING_ERROR',
        message: err instanceof Error ? err.message : 'Error desconocido al cargar sesión',
        userFriendlyMessage: 'Ocurrió un problema al verificar tu sesión. Por favor intenta nuevamente.',
      });
      setState('error');
    }
  };

  useEffect(() => {
    if (!supabase) {
      setState('unauthenticated');
      return;
    }

    // 1. Obtener sesión inicial
    supabase.auth.getSession().then(({ data: { session: initialSession }, error: sessionError }) => {
      if (sessionError) {
        console.error('[AuthProvider] Error al obtener sesión inicial:', sessionError.message);
        setError({
          code: sessionError.name || 'AUTH_SESSION_ERROR',
          message: sessionError.message,
          userFriendlyMessage: 'No se pudo verificar la sesión actual.',
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
    setProfile(fetchedProfile);
  };

  const signInWithGoogle = async () => {
    if (!supabase) {
      setError({
        code: 'SUPABASE_NOT_CONFIGURED',
        message: 'Las variables de entorno de Supabase no están configuradas.',
        userFriendlyMessage: 'La conexión con el servidor aún no está configurada.',
      });
      return;
    }

    try {
      const redirectUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (signInError) {
        throw signInError;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión con Google';
      setError({
        code: 'GOOGLE_SIGN_IN_ERROR',
        message,
        userFriendlyMessage: 'No se pudo conectar con Google. Verifica tu conexión e intenta de nuevo.',
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
