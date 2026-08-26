// ==============================================================================
// RASPANDO LA OLLA — CLIENTE CENTRALIZADO DE SUPABASE
// ==============================================================================
// IMPORTANTE:
// 1. Este archivo utiliza ÚNICAMENTE las variables públicas VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
// 2. NUNCA introduzcas SUPABASE_SERVICE_ROLE_KEY en el frontend ni en este cliente.
// 3. Supabase es la fuente de verdad. No se admiten simulaciones ni datos falsos.
// ==============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.trim() !== '' &&
  supabaseAnonKey.trim() !== '' &&
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
