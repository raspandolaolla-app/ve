// ==============================================================================
// RASPANDO LA OLLA — EDGE FUNCTION: SORTEO AUTOMÁTICO DE BINGO
// ==============================================================================
// Se ejecuta cada 5 segundos desde Supabase Cron o invocación periódica
// Extrae balotas automáticamente de forma autoritativa sin depender del host
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BingoState {
  variant: '75' | '80' | '90'
  drawnBalls: number[]
  currentBall: number | null
  status: string
  automated?: boolean
  callIntervalMs?: number
  winnerUserId?: string | null
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[BINGO_AUTO_DRAW] Iniciando proceso de sorteo automático...')

    // Crear cliente de Supabase con service_role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // 1. Buscar mesas de Bingo activas con sorteo automático habilitado
    const { data: activeTables, error: tablesError } = await supabaseAdmin
      .from('game_tables')
      .select(`
        id,
        config,
        game_sessions!inner (
          id,
          status,
          current_state
        )
      `)
      .eq('game_type', 'bingo')
      .in('status', ['OPEN', 'FULL', 'IN_PROGRESS'])
      .not('game_sessions', 'is', null)

    if (tablesError) {
      console.error('[BINGO_AUTO_DRAW] Error buscando mesas:', tablesError)
      return new Response(
        JSON.stringify({ success: false, error: tablesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!activeTables || activeTables.length === 0) {
      console.log('[BINGO_AUTO_DRAW] No hay mesas de Bingo activas')
      return new Response(
        JSON.stringify({ success: true, message: 'No active bingo tables', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let processedCount = 0
    const drawnBalls: Array<{ tableId: string; sessionId: string; ball: number; variant: string }> = []

    // 2. Procesar cada mesa activa
    for (const table of activeTables) {
      const config = (table.config || {}) as Record<string, any>
      const session = Array.isArray(table.game_sessions) ? table.game_sessions[0] : table.game_sessions

      if (!session || !config?.automated) {
        continue
      }

      const state = (session.current_state || {}) as BingoState

      // Verificar si el sorteo debe continuar
      if (state.status !== 'DRAWING' && state.status !== 'in_progress' && session.status !== 'ACTIVE' && session.status !== 'PLAYING') {
        continue
      }

      if (state.winnerUserId) {
        continue
      }

      const drawnBallsList = state.drawnBalls || []
      const variant = state.variant || '75'
      const maxBalls = variant === '75' ? 75 : variant === '80' ? 80 : 90

      // Verificar si ya se extrajeron todas las balotas
      if (drawnBallsList.length >= maxBalls) {
        console.log(`[BINGO_AUTO_DRAW] Mesa ${table.id}: Todas las balotas extraídas`)
        continue
      }

      // 3. Generar balota aleatoria disponible
      const availableBalls: number[] = []
      for (let i = 1; i <= maxBalls; i++) {
        if (!drawnBallsList.includes(i)) {
          availableBalls.push(i)
        }
      }

      if (availableBalls.length === 0) {
        console.log(`[BINGO_AUTO_DRAW] Mesa ${table.id}: No hay balotas disponibles`)
        continue
      }

      const randomIndex = Math.floor(Math.random() * availableBalls.length)
      const newBall = availableBalls[randomIndex]

      console.log(`[BINGO_AUTO_DRAW] Mesa ${table.id}: Extrayendo balota ${newBall} (${variant} bolas)`)

      // 4. Actualizar estado de la sesión
      const newDrawnBalls = [...drawnBallsList, newBall]
      const newState: BingoState = {
        ...state,
        drawnBalls: newDrawnBalls,
        currentBall: newBall,
        status: 'DRAWING'
      }

      const { error: updateError } = await supabaseAdmin
        .from('game_sessions')
        .update({
          current_state: newState,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.id)

      if (updateError) {
        console.error(`[BINGO_AUTO_DRAW] Error actualizando mesa ${table.id}:`, updateError)
        continue
      }

      // 5. Registrar acción en game_actions para auditoría
      await supabaseAdmin
        .from('game_actions')
        .insert({
          session_id: session.id,
          user_id: '00000000-0000-0000-0000-000000000000', // System user
          action_type: 'AUTO_DRAW_BALL',
          action_data: {
            ball: newBall,
            variant: variant,
            totalDrawn: newDrawnBalls.length,
            automated: true
          },
          is_valid: true,
          created_at: new Date().toISOString()
        })

      processedCount++
      drawnBalls.push({
        tableId: table.id,
        sessionId: session.id,
        ball: newBall,
        variant: variant
      })

      console.log(`[BINGO_AUTO_DRAW] ✓ Mesa ${table.id}: Balota ${newBall} extraída correctamente`)
    }

    console.log(`[BINGO_AUTO_DRAW] Proceso completado: ${processedCount} mesas procesadas`)

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        drawnBalls: drawnBalls,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[BINGO_AUTO_DRAW] Error inesperado:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
