import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import pg from "pg";
import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = 3000;

// Configurar pool de conexión a PostgreSQL
const connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
let pool: pg.Pool | null = null;
let drawWorkerDisabled = false;
let isRunningDraws = false;
let authErrorLogged = false;

if (connectionString && connectionString !== "") {
  try {
    const isSupabaseOrRemote = connectionString.includes("supabase.co") || 
      connectionString.includes("sslmode=require") || 
      !connectionString.includes("localhost");

    pool = new pg.Pool({
      connectionString,
      ssl: isSupabaseOrRemote ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 10000,
      max: 3,
    });

    // Capturar errores no controlados del pool para evitar caídas del proceso
    pool.on("error", (err: any) => {
      const msg = err?.message || String(err);
      if (!authErrorLogged && (msg.includes("password authentication failed") || msg.includes("auth"))) {
        authErrorLogged = true;
        console.warn("[BINGO_SERVER] Credenciales de PostgreSQL no válidas en DATABASE_URL. Sorteo autónomo pausado.");
      }
    });

    // Verificación no bloqueante en arranque
    pool.query("SELECT 1")
      .then(() => {
        console.log("[BINGO_SERVER] Conexión a PostgreSQL establecida exitosamente.");
      })
      .catch((err: any) => {
        const msg = err?.message || String(err);
        if (msg.includes("password authentication failed") || msg.includes("ECONNREFUSED") || msg.includes("auth")) {
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
    
    // 1. INICIAR MESA AUTOMÁTICA EN COUNTDOWN (RECONCILIACIÓN DE INICIO)
    // Busca mesas en READY/OPEN con cronogramas que ya expiraron (tiempo de inicio cumplido)
    const readyQuery = `
      SELECT gt.id as table_id, gs.id as session_id, gt.config
      FROM public.game_tables gt
      JOIN public.game_sessions gs ON gs.table_id = gt.id
      WHERE gt.game_type = 'BINGO'::public.game_type_enum
        AND gt.status IN ('READY'::public.table_status_enum, 'OPEN'::public.table_status_enum)
        AND (gt.config->>'automated')::boolean IS TRUE
        AND (gt.config->>'scheduled_start_at') IS NOT NULL
        AND (gt.config->>'scheduled_start_at')::timestamptz <= NOW()
      LIMIT 5;
    `;
    const readyRes = await client.query(readyQuery);
    
    for (const row of readyRes.rows) {
      console.log(`[BINGO_SERVER] [BINGO] Mesa ${row.table_id} lista para iniciar. Ejecutando extracción inicial...`);
      
      // Establecer JWT claims para simular rol administrativo/sistema de Supabase
      await client.query("BEGIN;");
      await client.query(`
        SELECT set_config('request.jwt.claims', '{"role": "service_role", "sub": "00000000-0000-0000-0000-000000000000"}', true);
      `);
      
      const drawQuery = `SELECT public.rpc_draw_bingo_ball_secure($1, $2) as result;`;
      const idempotencyKey = `server_init_${row.session_id}_${Math.floor(Date.now() / 10000)}`;
      
      const drawRes = await client.query(drawQuery, [row.session_id, idempotencyKey]);
      await client.query("COMMIT;");
      
      const resultObj = drawRes.rows[0]?.result;
      if (resultObj && resultObj.success) {
        console.log(`[BINGO_SERVER] [BINGO_DRAW] Mesa ${row.table_id} iniciada de forma autónoma. Bola extraída: ${resultObj.ball}`);
      } else {
        console.warn(`[BINGO_SERVER] [BINGO_ERROR] No se pudo iniciar mesa ${row.table_id}:`, resultObj?.error || "Error desconocido");
      }
    }

    // 2. EXTRAER SIGUIENTES BALOTAS DE SESIONES ACTIVAS (TEMPORIZADOR AUTÓNOMO)
    // Busca sesiones de juego ACTIVAS de Bingo Automatizado que excedieron su intervalo de sorteo
    const activeQuery = `
      SELECT gs.id as session_id, gt.id as table_id, gt.config, gt.updated_at
      FROM public.game_sessions gs
      JOIN public.game_tables gt ON gt.id = gs.table_id
      WHERE gs.status = 'ACTIVE'::public.session_status_enum
        AND gt.game_type = 'BINGO'::public.game_type_enum
        AND (gt.config->>'automated')::boolean IS TRUE
        AND (gs.current_state->>'status') = 'in_progress'
        AND (gt.updated_at IS NULL OR gt.updated_at <= NOW() - (COALESCE(gt.config->>'call_interval_ms', '3500')::text || ' milliseconds')::interval)
      LIMIT 10;
    `;
    const activeRes = await client.query(activeQuery);
    
    for (const row of activeRes.rows) {
      const intervalMs = parseInt(row.config?.call_interval_ms || "3500", 10);
      console.log(`[BINGO_SERVER] [BINGO_DRAW] Extrayendo balota automática para sesión ${row.session_id} (Intervalo: ${intervalMs}ms)...`);
      
      await client.query("BEGIN;");
      await client.query(`
        SELECT set_config('request.jwt.claims', '{"role": "service_role", "sub": "00000000-0000-0000-0000-000000000000"}', true);
      `);
      
      const drawQuery = `SELECT public.rpc_draw_bingo_ball_secure($1, $2) as result;`;
      const idempotencyKey = `server_auto_${row.session_id}_${Math.floor(Date.now() / intervalMs)}`;
      
      const drawRes = await client.query(drawQuery, [row.session_id, idempotencyKey]);
      await client.query("COMMIT;");
      
      const resultObj = drawRes.rows[0]?.result;
      if (resultObj && resultObj.success) {
        console.log(`[BINGO_SERVER] [BINGO_DRAW] Balota extraída por el servidor para sesión ${row.session_id}: ${resultObj.ball}`);
      } else {
        const errMsg = resultObj?.error || "Error desconocido";
        if (errMsg.includes("todas las balotas") || errMsg.includes("finalizado")) {
          console.log(`[BINGO_SERVER] [BINGO] Sorteo finalizado de forma natural para sesión ${row.session_id}.`);
        } else {
          console.warn(`[BINGO_SERVER] [BINGO_ERROR] Error al extraer bola en sesión ${row.session_id}:`, errMsg);
        }
      }
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("password authentication failed") || msg.includes("ECONNREFUSED") || msg.includes("auth")) {
      if (!authErrorLogged) {
        authErrorLogged = true;
        console.warn(`[BINGO_SERVER] Base de datos no autenticada (${msg}). El daemon en segundo plano se suspende.`);
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

// Registrar el motor en segundo plano (cada 2 segundos) de forma segura
if (pool) {
  setInterval(() => {
    runAutomatedBingoDraws().catch((err) => {
      console.warn("[BINGO_SERVER] Excepción no capturada en worker:", err?.message || err);
    });
  }, 2000);
}

async function startServer() {
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
