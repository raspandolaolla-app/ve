// ==============================================================================
// RASPANDO LA OLLA — CLIENTE CENTRALIZADO DE SUPABASE
// ==============================================================================
// IMPORTANTE:
// 1. Este archivo utiliza ÚNICAMENTE las variables públicas VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
// 2. NUNCA introduzcas SUPABASE_SERVICE_ROLE_KEY en el frontend ni en este cliente.
// 3. Supabase es la fuente de verdad. No se admiten simulaciones ni datos falsos.
// ==============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const env: Record<string, any> = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env) ? process.env : {};

// Configuración canónica oficial del proyecto Supabase "Raspando La Olla".
// La clave anon/publishable es pública por diseño y se utiliza en clientes frontend junto con RLS.
const CANONICAL_SUPABASE_URL = 'https://tncxgwycinbnkjbfwojt.supabase.co';
const CANONICAL_SUPABASE_ANON_KEY = 'sb_publishable_vlxeHnnl_FxJ1ziNqUsytQ_S95ZGawj';

// Obtención de credenciales públicas desde variables de entorno con fallback al proyecto canónico oficial
const rawUrl = ((env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || CANONICAL_SUPABASE_URL) || '') as string | undefined;
const rawAnonKey = ((env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || CANONICAL_SUPABASE_ANON_KEY) || '') as string | undefined;

// Validación de seguridad informativa (solo emite advertencia si faltasen ambas fuentes)
if ((!rawUrl || !rawAnonKey) && typeof window !== 'undefined') {
  console.warn('[AVISO] Variables de entorno de Supabase no configuradas y sin fallback disponible.');
}

const supabaseUrl = rawUrl?.trim();
const supabaseAnonKey = rawAnonKey?.trim();

export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== '' &&
  supabaseAnonKey !== '' &&
  supabaseUrl.startsWith('http')
);

let supabaseInstance: SupabaseClient | null = null;

if (isSupabaseConfigured && supabaseUrl && supabaseAnonKey) {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

/**
 * Diagnóstico seguro de variables públicas del cliente Supabase (sin exponer claves ni secretos).
 */
export interface SafeSupabaseConfigDiagnostics {
  SUPABASE_URL: 'CONFIGURED' | 'MISSING';
  SUPABASE_KEY: 'CONFIGURED' | 'MISSING';
  APP_URL: 'CONFIGURED' | 'MISSING';
  BASE_PATH: 'CONFIGURED' | 'MISSING';
  isReady: boolean;
}

export function getSafeSupabaseConfigDiagnostics(): SafeSupabaseConfigDiagnostics {
  const hasUrl = Boolean(supabaseUrl && supabaseUrl !== '' && supabaseUrl.startsWith('http'));
  const hasKey = Boolean(supabaseAnonKey && supabaseAnonKey !== '');
  const hasAppUrl = Boolean(import.meta.env.VITE_APP_URL);
  const hasBasePath = Boolean(import.meta.env.VITE_APP_BASE_PATH || import.meta.env.BASE_URL);

  return {
    SUPABASE_URL: hasUrl ? 'CONFIGURED' : 'MISSING',
    SUPABASE_KEY: hasKey ? 'CONFIGURED' : 'MISSING',
    APP_URL: hasAppUrl ? 'CONFIGURED' : 'MISSING',
    BASE_PATH: hasBasePath ? 'CONFIGURED' : 'MISSING',
    isReady: hasUrl && hasKey,
  };
}

// Registro diagnóstico seguro en desarrollo/staging
if (typeof window !== 'undefined') {
  const diag = getSafeSupabaseConfigDiagnostics();
  if (!diag.isReady) {
    console.warn('[Supabase Config Diagnostic]', {
      SUPABASE_URL: diag.SUPABASE_URL,
      SUPABASE_KEY: diag.SUPABASE_KEY,
      APP_URL: diag.APP_URL,
      BASE_PATH: diag.BASE_PATH,
    });
  }
}

/**
 * Obtiene la instancia del cliente Supabase.
 * Devuelve `null` si las variables de entorno aún no han sido configuradas.
 */
export function getSupabaseClient(): SupabaseClient | null {
  return supabaseInstance;
}

/**
 * Cliente Supabase principal exportado para uso directo en la capa de servicios.
 * Si las variables no están configuradas, se exporta null para evitar llamadas silenciosas.
 */
export const supabase = supabaseInstance;
