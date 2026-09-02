// ==============================================================================
// RASPANDO LA OLLA — EDGE FUNCTION: SORTEO AUTOMÁTICO DE POLLA VENEZOLANA
// ==============================================================================
// Se ejecuta según el horario oficial de sorteos de animalitos
// Genera resultados oficiales de loterías de animalitos y auditoría
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting simple
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string, maxCalls: number, windowMs: number): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(key)
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  
  if (record.count >= maxCalls) {
    return false
  }
  
  record.count++
  return true
}

// Catálogo de loterías venezolanas con sus horarios oficiales
const LOTTERY_SCHEDULE = [
  { name: 'La Granjita', times: ['08:00', '13:00', '16:00', '19:00'] },
  { name: 'Lotto Activo', times: ['09:00', '13:00', '16:00', '19:00'] },
  { name: 'Lotto Guácharo', times: ['10:00', '13:00', '17:00', '19:00'] },
  { name: 'Lotto Margariteño', times: ['11:00', '13:00', '16:00', '19:00'] },
  { name: 'Chance Táchira', times: ['12:00', '17:00', '19:00'] },
  { name: 'Tripletazo Zulia', times: ['08:00', '13:00', '16:00', '19:00'] },
  { name: 'Lotto Oriente', times: ['09:00', '13:00', '17:00', '19:00'] },
  { name: 'Lotto Falcón', times: ['10:00', '13:00', '16:00', '19:00'] },
  { name: 'Lotto Yaracuy', times: ['11:00', '13:00', '16:00', '19:00'] },
  { name: 'Lotto Carabobo', times: ['12:00', '16:00', '19:00'] },
]

function getVenezuelaTime(): Date {
  const now = new Date()
  const vetOffset = -4 * 60 // UTC-4
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
  return new Date(utc + (vetOffset * 60000))
}

function getTodayVenezuelaString(): string {
  const vet = getVenezuelaTime()
  const year = vet.getFullYear()
  const month = String(vet.getMonth() + 1).padStart(2, '0')
  const day = String(vet.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getCurrentTimeVenezuela(): string {
  const vet = getVenezuelaTime()
  const hours = String(vet.getHours()).padStart(2, '0')
  const minutes = String(vet.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ✅ AUTENTICACIÓN: Validar que la petición viene del Cron Job autorizado
  const authHeader = req.headers.get('Authorization')
  const expectedToken = Deno.env.get('CRON_JOB_SECRET')
  
  if (!expectedToken) {
    console.error('[POLLA_AUTO_DRAW] CRON_JOB_SECRET no configurado')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: corsHeaders }
    )
  }

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    console.warn('[POLLA_AUTO_DRAW] Intento de acceso no autorizado')
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: corsHeaders }
    )
  }

  // ✅ CORS: Restringir orígenes permitidos
  const origin = req.headers.get('Origin') || ''
  const ALLOWED_ORIGINS = [
    'https://raspandolaolla-app.github.io',
    'http://localhost:5173',
    'http://localhost:3000'
  ]
  const isAllowedOrigin = ALLOWED_ORIGINS.some(allowed => origin.includes(allowed))
  
  const restrictedCorsHeaders = {
    ...corsHeaders,
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Credentials': 'true'
  }

  // ✅ RATE LIMITING: Prevenir abuso
  const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
  const rateLimitKey = `polla_draw_${clientIP}`
  
  if (!checkRateLimit(rateLimitKey, 10, 60000)) { // Max 10 llamadas por minuto
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      { status: 429, headers: restrictedCorsHeaders }
    )
  }

  try {
    console.log('[POLLA_AUTO_DRAW] Iniciando proceso de sorteo de animalitos...')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const today = getTodayVenezuelaString()
    const currentTime = getCurrentTimeVenezuela()

    console.log(`[POLLA_AUTO_DRAW] Fecha: ${today}, Hora actual: ${currentTime} VET`)

    // Determinar qué bloque está activo
    const currentHour = parseInt(currentTime.split(':')[0])
    const block = currentHour < 12 ? 'MAÑANA' : 'TARDE'

    console.log(`[POLLA_AUTO_DRAW] Bloque activo: ${block}`)

    // Buscar loterías que deben sortearse ahora (dentro de ventana de 15 minutos)
    const lotteriesToDraw: Array<{ name: string; drawTime: string }> = []
    
    for (const lottery of LOTTERY_SCHEDULE) {
      for (const drawTime of lottery.times) {
        const [drawHour, drawMinute] = drawTime.split(':').map(Number)
        const drawMinutes = drawHour * 60 + drawMinute
        const currentMinutes = parseInt(currentTime.split(':')[0]) * 60 + parseInt(currentTime.split(':')[1])
        
        // Ventana de 15 minutos para sortear
        if (currentMinutes >= drawMinutes && currentMinutes <= drawMinutes + 15) {
          lotteriesToDraw.push({
            name: lottery.name,
            drawTime: drawTime
          })
        }
      }
    }

    if (lotteriesToDraw.length === 0) {
      console.log('[POLLA_AUTO_DRAW] No hay sorteos programados para esta hora')
      return new Response(
        JSON.stringify({ success: true, message: 'No scheduled draws', processed: 0 }),
        { headers: { ...restrictedCorsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[POLLA_AUTO_DRAW] ${lotteriesToDraw.length} loterías para sortear`)

    const results: any[] = []

    for (const lottery of lotteriesToDraw) {
      // Verificar si ya existe resultado para esta lotería
      const { data: existing } = await supabaseAdmin
        .from('polla_draw_results')
        .select('id')
        .eq('draw_date', today)
        .eq('draw_time', lottery.drawTime)
        .eq('lottery_name', lottery.name)
        .maybeSingle()

      if (existing) {
        console.log(`[POLLA_AUTO_DRAW] Resultado ya existe para ${lottery.name} a las ${lottery.drawTime}`)
        continue
      }

      // Generar 20 números aleatorios de animalitos (00-76)
      const numbers: string[] = []
      const usedNumbers = new Set<string>()
      
      while (numbers.length < 20) {
        const num = Math.floor(Math.random() * 77) // 0-76
        const numStr = String(num).padStart(2, '0')
        
        if (!usedNumbers.has(numStr)) {
          numbers.push(numStr)
          usedNumbers.add(numStr)
        }
      }

      console.log(`[POLLA_AUTO_DRAW] Generando resultado para ${lottery.name}: ${numbers.slice(0, 5).join(', ')}...`)

      // Insertar resultado oficial
      const { data: result, error } = await supabaseAdmin
        .from('polla_draw_results')
        .insert({
          draw_date: today,
          draw_time: lottery.drawTime,
          block: block,
          lottery_name: lottery.name,
          numbers: numbers,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error(`[POLLA_AUTO_DRAW] Error insertando resultado de ${lottery.name}:`, error)
        continue
      }

      // Registrar también en draw_audit_trail
      await supabaseAdmin
        .from('draw_audit_trail')
        .insert({
          draw_type: 'POLLA',
          draw_date: today,
          draw_time: lottery.drawTime,
          block: block,
          lottery_name: lottery.name,
          result_numbers: numbers,
          automated: true,
          executed_by: 'SYSTEM_POLLA_CRON',
          created_at: new Date().toISOString()
        })
        .catch((e: any) => console.warn('[POLLA_AUTO_DRAW] Audit trail optional insert warning:', e))

      results.push({
        lottery: lottery.name,
        drawTime: lottery.drawTime,
        numbers: numbers.slice(0, 5), // Primeros 5 para log
        totalNumbers: numbers.length
      })

      console.log(`[POLLA_AUTO_DRAW] ✓ Resultado generado para ${lottery.name}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        block: block,
        processed: results.length,
        results: results,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...restrictedCorsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[POLLA_AUTO_DRAW] Error inesperado:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...restrictedCorsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
