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

// Configurar cliente administrativo de Supabase si existen credenciales
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
export const supabaseAdmin = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
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

// Función del Motor de Sorteo y Cuenta Regresiva de Bingo (Daemon)
const runAutomatedBingoDraws = () => {
  setInterval(async () => {
    try {
      if (supabaseAdmin) {
        // 1. PRIMERO: Verificar si alguna mesa debe iniciar cuenta regresiva
        await supabaseAdmin.rpc('check_and_start_bingo_countdown');

        // 2. Buscar sesiones con cuenta regresiva activa
        const { data: sessions, error } = await supabaseAdmin
          .from('game_sessions')
          .select('id, countdown_ends_at, status')
          .eq('game_type', 'bingo')
          .in('status', ['WAITING', 'READY', 'SALES', 'DRAWING'])
          .not('countdown_ends_at', 'is', null);

        if (!error && sessions) {
          // 3. Para cada sesión, intentar revelar la siguiente bola
          for (const session of sessions) {
            const countdownEndsAt = new Date(session.countdown_ends_at);
            const now = new Date();
            
            // Solo revelar bolas si la cuenta regresiva terminó
            if (countdownEndsAt <= now) {
              const { data, error: rpcError } = await supabaseAdmin.rpc('reveal_next_bingo_ball', {
                p_session_id: session.id
              });
              
              if (rpcError && !rpcError.message.includes('TOO_FAST') && !rpcError.message.includes('BINGO_COMPLETE')) {
                console.error(`[BINGO_SERVER] Error en sesión ${session.id}:`, rpcError.message);
              }
            }
          }
        }
      } else if (pool && !drawWorkerDisabled) {
        // Modo directo vía pool de PostgreSQL si supabaseAdmin no está configurado
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
                console.warn(`[BINGO_SERVER] Error en sesión ${row.id}:`, msg);
              }
            }
          }
        } finally {
          if (client) {
            try { client.release(); } catch {}
          }
        }
      }
    } catch (err) {
      console.error('[BINGO_SERVER] Error en daemon de bingo:', err);
    }
  }, 2000); // Ejecutar cada 2 segundos
};

// Iniciar el daemon de Bingo
runAutomatedBingoDraws();

// Registrar motor de expiración de turnos
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

// Registrar worker de turnos
if (pool) {
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
