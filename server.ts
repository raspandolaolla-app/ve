import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import pg from "pg";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { supabaseMigrationRouter } from "./src/server/supabaseMigrationRouter";

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = 3000;

// Configuración de orígenes autorizados para CORS
const defaultAllowedOrigins = [
  "https://raspandolaolla-app.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

const envAllowedOrigins = [
  process.env.APP_URL,
  process.env.VITE_APP_URL,
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : []),
]
  .filter(Boolean)
  .map((url) => (url as string).trim().replace(/\/+$/, ""));

const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...envAllowedOrigins]));

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir peticiones sin cabecera origin (curl, bots de monitoreo, SSR interno)
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.trim().replace(/\/+$/, "");
      const isAllowed = allowedOrigins.some(
        (allowed) =>
          normalizedOrigin === allowed ||
          normalizedOrigin.startsWith(allowed) ||
          normalizedOrigin.endsWith(".github.io")
      );

      if (isAllowed || process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }

      console.warn(`[CORS] Petición bloqueada para origen no autorizado: ${origin}`);
      return callback(new Error(`Origen no permitido por política CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Accept",
      "Origin",
      "X-Requested-With",
      "x-admin-email",
    ],
  })
);

// Habilitar parsing de JSON para peticiones entrantes
app.use(express.json());

// Endpoint para verificar el token de Cloudflare Turnstile
app.post("/api/verify-captcha", async (req, res) => {
  const { token } = req.body || {};

  if (!token) {
    return res.status(400).json({ success: false, message: "Token no proporcionado" });
  }

  const secretKey = (process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || "").trim();

  if (!secretKey) {
    console.error("[CAPTCHA] Falta CLOUDFLARE_TURNSTILE_SECRET_KEY en el backend");
    return res.status(500).json({ success: false, message: "Error de configuración del servidor" });
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    const remoteIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    if (typeof remoteIp === "string") {
      formData.append("remoteip", remoteIp.split(",")[0].trim());
    }

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const data: any = await response.json();

    if (data.success) {
      console.log("[CAPTCHA] Verificación humana exitosa");
      return res.json({ success: true, challenge_ts: data.challenge_ts, hostname: data.hostname });
    } else {
      console.warn("[CAPTCHA] Verificación fallida:", data["error-codes"]);
      return res.status(400).json({
        success: false,
        message: "Verificación de seguridad fallida. Intenta de nuevo.",
        errorCodes: data["error-codes"],
      });
    }
  } catch (error) {
    console.error("[CAPTCHA] Error al verificar con Cloudflare:", error);
    return res.status(500).json({ success: false, message: "Error al verificar token con Cloudflare" });
  }
});

// Configurar cliente administrativo de Supabase (Privilegiado)
// REGLA ABSOLUTA: SUPABASE_SERVICE_ROLE_KEY es obligatoria para operaciones administrativas.
// NUNCA degradar a anon key ni usar fallbacks hardcodeados.
const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!supabaseServiceKey) {
  console.info('ℹ️ [SEGURIDAD] SUPABASE_SERVICE_ROLE_KEY no está configurada en el servidor. El cliente administrativo de fondo permanecerá desactivado de forma segura.');
}

export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  : null;

// Alias de retrocompatibilidad estricto: apunta ÚNICAMENTE al cliente administrativo seguro
export const supabaseServerClient = supabaseAdmin;

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

// Centro de Migración de Supabase (Exclusivo SUPER_ADMIN)
app.use("/api/admin/supabase-migration", supabaseMigrationRouter);

// Función del Motor de Sorteo y Cuenta Regresiva de Bingo (Daemon con Backoff Inteligente)
// Reduce el consumo de Egress en Supabase cuando no hay partidas activas
const runAutomatedBingoDraws = () => {
  const scheduleNextTick = (delayMs: number) => {
    setTimeout(executeBingoTick, delayMs);
  };

  const executeBingoTick = async () => {
    let nextInterval = 15000; // Por defecto: reposo (15s) cuando no hay sesiones activas

    try {
      if (supabaseServerClient) {
        // 1. Verificar si hay sesiones de bingo activas antes de saturar PostgREST
        let hasActiveSessions = false;
        let hasImminentCountdown = false;

        if (supabaseAdmin) {
          const { data: sessions, error } = await supabaseAdmin
            .from('game_sessions')
            .select('id, countdown_ends_at, status')
            .eq('game_type', 'bingo')
            .in('status', ['WAITING', 'READY', 'SALES', 'DRAWING'])
            .not('countdown_ends_at', 'is', null)
            .limit(5);

          if (!error && sessions && sessions.length > 0) {
            hasActiveSessions = true;
            const now = Date.now();

            for (const session of sessions) {
              const countdownEndsAt = new Date(session.countdown_ends_at).getTime();
              if (countdownEndsAt <= now) {
                hasImminentCountdown = true;
                const { error: rpcError } = await supabaseAdmin.rpc('reveal_next_bingo_ball', {
                  p_session_id: session.id,
                });

                if (rpcError && !rpcError.message.includes('TOO_FAST') && !rpcError.message.includes('BINGO_COMPLETE')) {
                  console.warn(`[BINGO_SERVER] Aviso en sesión ${session.id}:`, rpcError.message);
                }
              } else if (countdownEndsAt - now <= 5000) {
                hasImminentCountdown = true;
              }
            }
          }
        }

        // Si hay sesiones o sorteos en curso, sincronizar con tick unificado RPC
        if (hasActiveSessions) {
          try {
            const { error: tickErr } = await supabaseServerClient.rpc('run_bingo_engine_tick');
            if (tickErr && tickErr.message && (tickErr.message.includes('function') || tickErr.message.includes('does not exist'))) {
              await supabaseServerClient.rpc('check_and_start_bingo_countdown');
            }
          } catch {
            // Tolerar fallos de red transitorios
          }

          nextInterval = hasImminentCountdown ? 3500 : 6000;
        } else {
          // Reposo cuando no hay ninguna mesa de bingo en juego
          nextInterval = 15000;
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

          if (res.rows.length > 0) {
            nextInterval = 3500;
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
          } else {
            nextInterval = 15000;
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
      const msg = err?.message || String(err);
      if (msg.includes('timeout') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
        drawWorkerDisabled = true;
      } else {
        console.warn('[BINGO_SERVER] Advertencia en ciclo de bingo:', msg);
      }
      nextInterval = 15000;
    } finally {
      scheduleNextTick(nextInterval);
    }
  };

  // Iniciar primer ciclo
  scheduleNextTick(3000);
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
      await supabaseServerClient.rpc('process_expired_turns').catch(() => {});
      await supabaseServerClient.rpc('expire_game_turn_secure').catch(() => {});
    } else if (pool && !drawWorkerDisabled) {
      let client: pg.PoolClient | null = null;
      try {
        client = await pool.connect();
        await client.query('SELECT public.process_expired_turns();').catch(() => {});
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

// Registrar worker de turnos con intervalo de 8s (óptimo contra cuotas de egress)
setInterval(() => {
  runAutomatedTurnExpirations().catch(() => {});
}, 8000);

// Daemon de Limpieza Automática de Mesas de Bingo Finalizadas (>1 hora de antigüedad)
const runAutomatedBingoCleanup = async () => {
  try {
    const client = supabaseAdmin || supabaseServerClient;
    if (client) {
      const { data, error } = await client.rpc('cleanup_finished_bingo_tables');
      if (error) {
        if (!error.message.includes('does not exist')) {
          console.warn('[CLEANUP] Aviso al limpiar mesas de bingo:', error.message);
        }
      } else if (data?.cleaned_count > 0) {
        console.log(`[CLEANUP] Se limpiaron automáticamente ${data.cleaned_count} mesas de Bingo finalizadas.`);
      }
    } else if (pool && !drawWorkerDisabled) {
      let pgClient: pg.PoolClient | null = null;
      try {
        pgClient = await pool.connect();
        const res = await pgClient.query('SELECT public.cleanup_finished_bingo_tables() as result;');
        const resultObj = res.rows[0]?.result;
        if (resultObj && resultObj.cleaned_count > 0) {
          console.log(`[CLEANUP] Se limpiaron automáticamente ${resultObj.cleaned_count} mesas de Bingo finalizadas vía PostgreSQL directo.`);
        }
      } catch {
        // Silencioso
      } finally {
        if (pgClient) {
          try { pgClient.release(); } catch {}
        }
      }
    }
  } catch (err: any) {
    console.warn('[CLEANUP] Excepción en daemon de limpieza de bingo:', err?.message || err);
  }
};

// Ejecutar una limpieza inicial a los 30s de arranque y luego cada 1 hora
setTimeout(() => {
  runAutomatedBingoCleanup().catch(() => {});
}, 30000);

setInterval(() => {
  runAutomatedBingoCleanup().catch(() => {});
}, 60 * 60 * 1000);

async function startServer() {
  const httpServer = http.createServer(app);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : { server: httpServer },
      },
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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[BINGO_SERVER] Servidor corriendo en el puerto ${PORT}`);
  });
}

startServer();
