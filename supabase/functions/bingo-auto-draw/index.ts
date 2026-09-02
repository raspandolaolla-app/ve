// ==============================================================================
// RASPANDO LA OLLA — EDGE FUNCTION: SORTEO AUTOMÁTICO DE BINGO (SERVER-AUTHORITATIVE)
// ==============================================================================
// Se ejecuta cada 4-5 segundos desde Supabase Cron o invocación autorizada
// Extrae balotas de forma 100% autoritativa en el servidor e inserta en game_actions
// ==============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

serve(async (req: Request) => {
  // Manejo de preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 1. Validar autenticación del Cron Job o Service Role
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_JOB_SECRET')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  const isAuthorized = 
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) ||
    (!cronSecret && !serviceRoleKey) // Solo en testing local si no hay secretos

  if (!isAuthorized && (cronSecret || serviceRoleKey)) {
    return new Response(
      JSON.stringify({ error: 'No autorizado para ejecutar sorteo automático' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = serviceRoleKey || Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  try {
    // 2. Buscar sesiones de Bingo activas que requieran extracción
    const { data: activeSessions, error: sessionsError } = await supabaseAdmin
      .from('game_sessions')
      .select('id, table_id, current_state, status, game_type')
      .in('status', ['ACTIVE', 'PLAYING', 'DRAWING', 'in_progress'])
      .in('game_type', ['BINGO', 'bingo'])

    if (sessionsError) {
      console.error('[BINGO_AUTO_DRAW] Error consultando sesiones activas:', sessionsError)
      return new Response(
        JSON.stringify({ error: sessionsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = []

    // 3. Por cada sesión activa de Bingo, invocar la RPC server_bingo_operation
    for (const session of activeSessions || []) {
      const state = session.current_state || {}

      // Si ya hay ganador o está finalizada, saltar
      if (state.winnerUserId || state.status === 'finished') {
        continue
      }

      // Si las ventas siguen abiertas, saltar hasta que inicien
      if (state.status === 'SALES') {
        continue
      }

      const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('server_bingo_operation', {
        p_session_id: session.id,
        p_operation: 'draw_ball',
      })

      if (rpcError) {
        console.error(`[BINGO_AUTO_DRAW] Error en sesión ${session.id}:`, rpcError)
      } else {
        console.log(`[BINGO_AUTO_DRAW] ✓ Sesión ${session.id} balota extraída:`, rpcData)
        results.push({
          sessionId: session.id,
          result: rpcData,
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        activeCount: activeSessions?.length || 0,
        drawn: results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (err: any) {
    console.error('[BINGO_AUTO_DRAW] Error inesperado:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
