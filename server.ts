import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import pg from "pg";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = 3000;

// Configurar cliente administrativo y de servidor de Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseServiceKey) {
  console.info('ℹ️ [SEGURIDAD] SUPABASE_SERVICE_ROLE_KEY no está configurada en el servidor. El cliente administrativo completo permanecerá desactivado.');
}

export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  : null;

export const supabaseServerClient = (supabaseUrl && (supabaseServiceKey || supabaseAnonKey))
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, { auth: { persistSession: false } })
  : null;

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
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      max: 2,
    });

    // Capturar errores no controlados del pool para evitar caídas del proceso
    pool.on("error", (err: any) => {
      const msg = err?.message || String(err);
      if (!authErrorLogged) {
        authErrorLogged = true;
        console.warn(`[BINGO_SERVER] Evento de desconexión en PostgreSQL (${msg}). Desactivando worker directo.`);
      }
      drawWorkerDisabled = true;
    });

    // Verificación no bloqueante en arranque
    pool.query("SELECT 1")
      .then(() => {
        console.log("[BINGO_SERVER] Conexión directa a PostgreSQL establecida exitosamente.");
      })
      .catch((err: any) => {
        const msg = err?.message || String(err);
        drawWorkerDisabled = true;
        if (!authErrorLogged) {
          authErrorLogged = true;
          console.warn(`[BINGO_SERVER] Base de datos directa PostgreSQL no alcanzable (${msg}). Worker directo pausado; la app web opera normalmente vía API Supabase.`);
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
    service: "raspando-la-olla",
    serverTime: new Date().toISOString(),
    dbWorkerActive: Boolean(pool && !drawWorkerDisabled),
    supabaseConnected: Boolean(supabaseServerClient),
  });
});

// Función del Motor de Sorteo y Cuenta Regresiva de Bingo (Daemon)
const runAutomatedBingoDraws = () => {
  setInterval(async () => {
    try {
      if (supabaseServerClient) {
        // 1. Ejecutar tick unificado RPC (migración 114) vía HTTPS sin riesgo de timeout TCP
        try {
          const { error: tickErr } = await supabaseServerClient.rpc('run_bingo_engine_tick');
          if (tickErr && tickErr.message && (tickErr.message.includes('function') || tickErr.message.includes('does not exist'))) {
            // Si migración 114 aún no ha sido aplicada en la base de datos remota, ejecutar verificación básica
            await supabaseServerClient.rpc('check_and_start_bingo_countdown');
          }
        } catch {
          // Tolerar fallos de red transitorios
        }

        // 2. Si se cuenta con privilegios administrativos (service_role), revelar balotas directamente
        if (supabaseAdmin) {
          const { data: sessions, error } = await supabaseAdmin
            .from('game_sessions')
            .select('id, countdown_ends_at, status')
            .eq('game_type', 'bingo')
            .in('status', ['WAITING', 'READY', 'SALES', 'DRAWING'])
            .not('countdown_ends_at', 'is', null);

          if (!error && sessions) {
            for (const session of sessions) {
              const countdownEndsAt = new Date(session.countdown_ends_at);
              const now = new Date();
              
              if (countdownEndsAt <= now) {
                const { error: rpcError } = await supabaseAdmin.rpc('reveal_next_bingo_ball', {
                  p_session_id: session.id
                });
                
                if (rpcError && !rpcError.message.includes('TOO_FAST') && !rpcError.message.includes('BINGO_COMPLETE')) {
                  console.warn(`[BINGO_SERVER] Aviso en sesión ${session.id}:`, rpcError.message);
                }
              }
            }
          }
        }
      } else if (pool && !drawWorkerDisabled) {
        // Modo directo vía pool de PostgreSQL solo si el pool está disponible y activo
        let client: pg.PoolClient | null = null;
        try {
          client = await pool.connect();
          await client.query('SELECT public.check_and_start_bingo_countdown();');
          const res = await client.query(`
            SELECT id, countdown_ends_at, status
            FROM public.game_sessions
            WHERE LOWER(game_type::text) = 'bingo'
              AND status::text IN ('WAITING', 'READY', 'SALES', 'DRAWING', 'waiting', 'ready', 'sales', 'drawing')
              AND countdown_ends_at IS NOT NULL
              AND countdown_ends_at <= NOW()
            LIMIT 5;
          `);
          for (const row of res.rows) {
            try {
              await client.query('SELECT public.reveal_next_bingo_ball($1);', [row.id]);
            } catch (drawErr: any) {
              const msg = drawErr?.message || String(drawErr);
              if (!msg.includes('TOO_FAST') && !msg.includes('BINGO_COMPLETE')) {
                console.warn(`[BINGO_SERVER] Aviso en sesión ${row.id}:`, msg);
              }
            }
          }
        } catch (connErr: any) {
          const msg = connErr?.message || String(connErr);
          drawWorkerDisabled = true;
          if (!authErrorLogged) {
            authErrorLogged = true;
            console.warn(`[BINGO_SERVER] Desactivando worker directo PostgreSQL (${msg}).`);
          }
        } finally {
          if (client) {
            try { client.release(); } catch {}
          }
        }
      }
    } catch (err: any) {
      // Capturar cualquier error no previsto y evitar inundar los logs
      const msg = err?.message || String(err);
      if (msg.includes('timeout') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
        drawWorkerDisabled = true;
      } else {
        console.warn('[BINGO_SERVER] Advertencia en ciclo de bingo:', msg);
      }
    }
  }, 2000);
};

// Iniciar el daemon de Bingo
runAutomatedBingoDraws();

// Registrar motor de expiración de turnos
let isRunningTurns = false;

async function runAutomatedTurnExpirations() {
  if (isRunningTurns) return;
  isRunningTurns = true;

  try {
    if (supabaseServerClient) {
      await supabaseServerClient.rpc('expire_game_turn_secure');
    } else if (pool && !drawWorkerDisabled) {
      let client: pg.PoolClient | null = null;
      try {
        client = await pool.connect();
        const res = await client.query('SELECT public.expire_game_turn_secure() as result;');
        const resultObj = res.rows[0]?.result;
        if (resultObj && resultObj.success && resultObj.expired_count > 0) {
          console.log(`[GAME_SERVER] [TURN_TIMEOUT] Turnos expirados y avanzados: ${resultObj.expired_count}`);
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes('timeout') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
          drawWorkerDisabled = true;
        }
      } finally {
        if (client) {
          try { client.release(); } catch {}
        }
      }
    }
  } catch {
    // Silencioso
  } finally {
    isRunningTurns = false;
  }
}

// Registrar worker de turnos
setInterval(() => {
  runAutomatedTurnExpirations().catch(() => {});
}, 3000);

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
