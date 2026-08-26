// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS GLOBALES: AUTENTICACIÓN
// ==============================================================================

export type AuthState = 'loading' | 'unauthenticated' | 'authenticated' | 'error';

export interface AuthSession {
  userId: string;
  email: string | null;
  aal: 'aal1' | 'aal2';
  hasMfaEnrolled: boolean;
  expiresAt?: number;
}

export interface AuthErrorDetails {
  code: string;
  message: string;
  userFriendlyMessage: string;
}

export interface GoogleAuthOptions {
  redirectTo?: string;
  scopes?: string;
}
