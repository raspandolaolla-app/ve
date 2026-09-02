// ==============================================================================
// RASPANDO LA OLLA — EDGE FUNCTION: EXPIRACIÓN DE TURNOS Y TIMEOUTS
// ==============================================================================
// Ejecuta public.expire_game_turn_secure() y detect_disconnected_players()
// Compatible con Supabase Cron, pg_cron o triggers HTTP externos
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Validar autorización
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_JOB_SECRET')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  const isAuthorized = !cronSecret ||
    authHeader === `Bearer ${cronSecret}` ||
    authHeader === `Bearer ${serviceRoleKey}`

  if (!isAuthorized) {
    return new Response(
      JSON.stringify({ success: false, error: 'No autorizado' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = serviceRoleKey ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

  try {
    // 1. Expirar turnos pendientes
    const { data: expireData, error: expireError } = await supabaseAdmin.rpc('expire_game_turn_secure')
    if (expireError) {
      console.warn('[EXPIRE_TURNS] Error en expire_game_turn_secure:', expireError.message)
    }

    // 2. Detectar jugadores desconectados
    const { data: disconnectData, error: disconnectError } = await supabaseAdmin.rpc('detect_disconnected_players')
    if (disconnectError) {
      console.warn('[EXPIRE_TURNS] Error en detect_disconnected_players:', disconnectError.message)
    }

    return new Response(
      JSON.stringify({
        success: true,
        turns: expireData || { error: expireError?.message },
        disconnected: disconnectData || { error: disconnectError?.message },
        executed_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err: any) {
    console.error('[EXPIRE_TURNS] Excepción inesperada:', err)
    return new Response(
      JSON.stringify({ success: false, error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
