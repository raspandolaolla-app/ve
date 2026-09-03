import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import pg from "pg";
import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = 3000;

// Configurar pool de conexión a PostgreSQL
let connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();

// Sanitizar contraseñas con corchetes accidentales de plantillas (ej: postgres:[mypassword]@ -> postgres:mypassword@)
if (connectionString) {
  connectionString = connectionString.replace(/:\/\/([^:]+):\[([^\]]+)\]@/, '://$1:$2@');
}

let pool: pg.Pool | null = null;
let drawWorkerDisabled = false;
let isRunningDraws = false;
let authErrorLogged = false;

if (connectionString && connectionString !== "") {
  try {
    const isSupabaseOrRemote = connectionString.includes("supabase.co") || 
      connectionString.includes("sslmode=require") || 
      !connectionString.includes("localhost");

    // Configuración SSL: Si se especifica CA personalizado, usar verificación estricta.
    // Para conexiones Supabase/remotas sin CA personalizado montado, permitir TLS
    // evitando el bloqueo por certificados autofirmados de la cadena intermedia.
    let sslConfig: any = false;
    if (isSupabaseOrRemote) {
      const caPath = process.env.DATABASE_SSL_CA_PATH || process.env.PGSSLROOTCERT;
      let caContent = process.env.DATABASE_SSL_CA;
      if (!caContent && caPath && fs.existsSync(caPath)) {
        try {
          caContent = fs.readFileSync(caPath, "utf8");
        } catch (e) {
          console.warn("[BINGO_SERVER] No se pudo leer el archivo de certificado CA:", e);
        }
      }

      if (caContent) {
        sslConfig = { rejectUnauthorized: true, ca: caContent };
      } else if (process.env.DATABASE_SSL_STRICT === "true") {
        sslConfig = { rejectUnauthorized: true };
      } else {
        sslConfig = { rejectUnauthorized: false };
      }
    }

    pool = new pg.Pool({
      connectionString,
      ssl: sslConfig,
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 10000,
      max: 3,
    });

    // Capturar errores no controlados del pool para evitar caídas del proceso
    pool.on("error", (err: any) => {
      const msg = err?.message || String(err);
      if (
        !authErrorLogged &&
        (msg.includes("password authentication failed") ||
          msg.includes("auth") ||
          msg.includes("certificate") ||
          msg.includes("self-signed"))
      ) {
        authErrorLogged = true;
        console.warn(`[BINGO_SERVER] Estado de conexión PostgreSQL (${msg}). Sorteo autónomo local pausado.`);
        drawWorkerDisabled = true;
      }
    });

    // Verificación no bloqueante en arranque
    pool.query("SELECT 1")
      .then(() => {
        console.log("[BINGO_SERVER] Conexión a PostgreSQL establecida exitosamente.");
      })
      .catch((err: any) => {
        const msg = err?.message || String(err);
        if (
          msg.includes("password authentication failed") ||
          msg.includes("ECONNREFUSED") ||
          msg.includes("auth") ||
          msg.includes("certificate") ||
          msg.includes("self-signed")
        ) {
          console.warn(`[BINGO_SERVER] Aviso de conexión PostgreSQL: ${msg}. El servidor Express y la app web continuarán funcionando normalmente.`);
          drawWorkerDisabled = true;
        } else {
          console.warn(`[BINGO_SERVER] Aviso de verificación inicial PostgreSQL: ${msg}`);
        }
      });
  } catch (initErr: any) {
    console.warn("[BINGO_SERVER] No se pudo inicializar el pool PostgreSQL:", initErr?.message || initErr);
    pool = null;
    drawWorkerDisabled = true;
  }
} else {
  console.log("[BINGO_SERVER] DATABASE_URL no configurada. El servidor opera en modo estándar.");
}

// API routes FIRST
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    serverTime: new Date().toISOString(),
    dbWorkerActive: Boolean(pool && !drawWorkerDisabled),
  });
});

// Función del Motor de Sorteo Automatizado del Servidor (Cron / Intervalo de Base de Datos)
async function runAutomatedBingoDraws() {
  if (!pool || drawWorkerDisabled || isRunningDraws) return;
  isRunningDraws = true;

  let client: pg.PoolClient | null = null;
  try {
    client = await pool.connect();
    
    // 1. INICIAR MESA AUTOMÁTICA EN COUNTDOWN (PREPARAR SORTEO AUTORITATIVO)
    // Busca mesas en READY/OPEN con cronogramas cumplidos para pre-generar la secuencia completa
    const readyQuery = `
      SELECT gt.id as table_id, gs.id as session_id, gt.config
      FROM public.game_tables gt
      JOIN public.game_sessions gs ON gs.table_id = gt.id
      WHERE gt.game_type = 'BINGO'::public.game_type_enum
        AND gt.status IN ('OPEN'::public.table_status_enum, 'STARTING'::public.table_status_enum)
        AND gs.status IN ('WAITING'::public.session_status_enum, 'READY'::public.session_status_enum, 'STARTING'::public.session_status_enum)
        AND (gt.config->>'automated')::boolean IS TRUE
        AND (gt.config->>'scheduled_start_at') IS NOT NULL
        AND (gt.config->>'scheduled_start_at')::timestamptz <= NOW()
      LIMIT 5;
    `;
    const readyRes = await client.query(readyQuery);
    
    for (const row of readyRes.rows) {
      console.log(`[BINGO_SERVER] [BINGO] Mesa ${row.table_id} lista para iniciar. Pre-generando secuencia con prepare_bingo_draw...`);
      
      const prepQuery = `SELECT public.prepare_bingo_draw($1) as result;`;
      const prepRes = await client.query(prepQuery, [row.session_id]);
      
      const resultObj = prepRes.rows[0]?.result;
      if (resultObj && resultObj.success) {
        console.log(`[BINGO_SERVER] [BINGO_DRAW] Mesa ${row.table_id} preparada autoritativamente. Bolas: ${resultObj.total_balls}, Hash: ${resultObj.hash}`);
        await client.query(
          `UPDATE public.game_tables SET status = 'ACTIVE'::public.table_status_enum, updated_at = NOW() WHERE id = $1;`,
          [row.table_id]
        );
      } else {
        console.warn(`[BINGO_SERVER] [BINGO_ERROR] No se pudo preparar mesa ${row.table_id}:`, resultObj?.error || "Error desconocido");
      }
    }

    // 2. REVELAR SIGUIENTE BOLA CADA 3 SEGUNDOS (MIGRACIÓN 109 - reveal_next_bingo_ball)
    // Busca sesiones en status DRAWING que cumplieron el intervalo de 3 segundos
    const drawingQuery = `
      SELECT gs.id as session_id, gt.id as table_id, gt.config, gs.updated_at
      FROM public.game_sessions gs
      JOIN public.game_tables gt ON gt.id = gs.table_id
      WHERE gs.status = 'DRAWING'::public.session_status_enum
        AND gt.game_type = 'BINGO'::public.game_type_enum
        AND (gs.updated_at IS NULL OR gs.updated_at <= NOW() - INTERVAL '3 seconds')
      LIMIT 10;
    `;
    const drawingRes = await client.query(drawingQuery);

    for (const row of drawingRes.rows) {
      const revealQuery = `SELECT public.reveal_next_bingo_ball($1) as result;`;
      const revealRes = await client.query(revealQuery, [row.session_id]);
      const resultObj = revealRes.rows[0]?.result;

      if (resultObj && resultObj.success) {
        console.log(`[BINGO_SERVER] [CENTRAL_DRAW] Sesión ${row.session_id}: Bola revelada: ${resultObj.ball_number} (Índice: ${resultObj.index})`);
        if (resultObj.has_winner) {
          console.log(`[BINGO_SERVER] [CENTRAL_DRAW] ¡Ganador detectado en sesión ${row.session_id}! Ganador: ${resultObj.winner_user_id}`);
        }
      } else if (resultObj?.reason === 'DRAW_COMPLETE') {
        console.log(`[BINGO_SERVER] [CENTRAL_DRAW] Sorteo completado para sesión ${row.session_id}. Marcando como FINISHED.`);
        await client.query(
          `UPDATE public.game_sessions SET status = 'FINISHED'::public.session_status_enum, updated_at = NOW() WHERE id = $1;`,
          [row.session_id]
        );
      }
    }

    // 3. EXTRAER SIGUIENTES BALOTAS DE SESIONES ACTIVAS LEGACY (COMPATIBILIDAD)
    const activeQuery = `
      SELECT gs.id as session_id, gt.id as table_id, gt.config, gt.updated_at
      FROM public.game_sessions gs
      JOIN public.game_tables gt ON gt.id = gs.table_id
      WHERE gs.status = 'ACTIVE'::public.session_status_enum
        AND gt.game_type = 'BINGO'::public.game_type_enum
        AND (gt.config->>'automated')::boolean IS TRUE
        AND (gs.current_state->>'status') = 'in_progress'
        AND (gt.updated_at IS NULL OR gt.updated_at <= NOW() - (COALESCE(gt.config->>'call_interval_ms', '3500')::text || ' milliseconds')::interval)
      LIMIT 5;
    `;
    const activeRes = await client.query(activeQuery);
    
    for (const row of activeRes.rows) {
      const intervalMs = parseInt(row.config?.call_interval_ms || "3500", 10);
      const drawQuery = `SELECT public.server_bingo_operation('draw_ball', $1) as result;`;
      const drawRes = await client.query(drawQuery, [row.session_id]);
      
      const resultObj = drawRes.rows[0]?.result;
      if (resultObj && resultObj.success) {
        console.log(`[BINGO_SERVER] [BINGO_DRAW] Balota extraída (legacy) para sesión ${row.session_id}: ${resultObj.ball || resultObj.ball_number}`);
      }
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (
      msg.includes("password authentication failed") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("auth") ||
      msg.includes("certificate") ||
      msg.includes("self-signed")
    ) {
      if (!authErrorLogged) {
        authErrorLogged = true;
        console.warn(`[BINGO_SERVER] Conexión PostgreSQL no disponible (${msg}). El daemon en segundo plano se suspende.`);
      }
      drawWorkerDisabled = true;
    } else {
      console.error("[BINGO_SERVER] [BINGO_ERROR] Error en el bucle del motor de sorteo:", msg);
    }
  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseErr) {
        // Ignorar errores al liberar si el cliente ya fue desconectado
      }
    }
    isRunningDraws = false;
  }
}

// Registrar motor de sorteo de Bingo y motor de expiración de turnos
let isRunningTurns = false;

async function runAutomatedTurnExpirations() {
  if (!pool || drawWorkerDisabled || isRunningTurns) return;
  isRunningTurns = true;
  let client: pg.PoolClient | null = null;
  try {
    client = await pool.connect();
    const res = await client.query('SELECT public.expire_game_turn_secure() as result;');
    const resultObj = res.rows[0]?.result;
    if (resultObj && resultObj.success && resultObj.expired_count > 0) {
      console.log(`[GAME_SERVER] [TURN_TIMEOUT] Turnos expirados y avanzados automáticamente: ${resultObj.expired_count}`);
    }
  } catch (err: any) {
    // Si la conexión falla, se gestiona centralizadamente
  } finally {
    if (client) {
      try { client.release(); } catch {}
    }
    isRunningTurns = false;
  }
}

// Registrar workers en segundo plano
if (pool) {
  setInterval(() => {
    runAutomatedBingoDraws().catch((err) => {
      console.warn("[BINGO_SERVER] Excepción no capturada en worker Bingo:", err?.message || err);
    });
  }, 2000);

  setInterval(() => {
    runAutomatedTurnExpirations().catch((err) => {
      console.warn("[GAME_SERVER] Excepción no capturada en worker Turnos:", err?.message || err);
    });
  }, 3000);
}

async function startServer() {
  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "raspando-la-olla" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use("/ve", express.static(distPath));
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BINGO_SERVER] Servidor corriendo en el puerto ${PORT}`);
  });
}

startServer();
