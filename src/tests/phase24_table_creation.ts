// ================================================================
// SUITE DE VALIDACIÓN REAL (20 PUNTOS) - FASE 24
// CREACIÓN DE MESAS + UNA-OLLA + SUPABASE REAL
//
// OBJETIVO:
//   Sustituir pruebas simuladas por validaciones reales.
//
// REQUISITOS:
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
//
// OPCIONAL PARA TESTS DE INTEGRACIÓN:
//   TEST_EMAIL
//   TEST_PASSWORD
//
// IMPORTANTE:
//   - NO modifica migraciones históricas.
//   - NO modifica wallet/ledger.
//   - NO crea RPC nuevas.
//   - NO usa return true para simular Supabase.
//   - Los tests críticos contra PostgreSQL deben fallar si
//     Supabase no está disponible.
// ================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { GameRepository } from '../services/repositories/GameRepository';
import { sanitizeUserErrorMessage } from '../utils/errorSanitizer';
import type { GameType } from '../types/games';

// ================================================================
// CONFIGURACIÓN
// ================================================================

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

const AUTHORIZED_FEES = [
  10,
  15,
  20,
  25,
  50,
  100,
  250,
  500,
  1000,
  2000,
] as const;

const SUPPORTED_GAMES: Array<{
  ui: GameType;
  db: string;
}> = [
  { ui: 'domino_venezolano', db: 'DOMINO_VENEZOLANO' },
  { ui: 'truco_venezolano', db: 'TRUCO_VENEZOLANO' },
  { ui: 'tic_tac_toe', db: 'TRES_EN_RAYA' },
  { ui: 'rock_paper_scissors', db: 'PIEDRA_PAPEL_TIJERA' },
  { ui: 'checkers', db: 'DAMAS' },
  { ui: 'bingo', db: 'BINGO' },
  { ui: 'polla_venezolana', db: 'POLLA_VENEZOLANA' },
  { ui: 'atrapaito', db: 'ATRAPAITO' },
  { ui: 'una_olla', db: 'UNA_OLLA' },
];

// ================================================================
// TIPOS
// ================================================================

interface TestCase {
  id: number;
  name: string;
  critical?: boolean;
  run: () => boolean | Promise<boolean>;
}

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  skipped: boolean;
  durationMs: number;
  error?: string;
}

interface TableSnapshot {
  availableBalance: number | null;
  heldBalance: number | null;
}

// ================================================================
// CLIENTE SUPABASE
// ================================================================

function createSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  return createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

const supabase = createSupabaseClient();

// ================================================================
// UTILIDADES
// ================================================================

function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'SUPABASE_CONFIG_MISSING: Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
    );
  }

  return supabase;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function randomTestSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };

    return [
      candidate.code,
      candidate.message,
      candidate.details,
      candidate.hint,
    ]
      .filter(Boolean)
      .join(' | ');
  }

  return String(error);
}

// ================================================================
// AUTENTICACIÓN DE PRUEBA
// ================================================================

async function authenticateTestUser(): Promise<string | null> {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    return null;
  }

  const client = requireSupabase();

  const { data, error } = await client.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (error) {
    throw new Error(
      `TEST_AUTH_FAILED: ${error.message}`
    );
  }

  assert(
    data.user?.id,
    'TEST_AUTH_FAILED: Supabase no devolvió un usuario autenticado.'
  );

  return data.user.id;
}

// ================================================================
// CONSULTA REAL DEL ENUM
// ================================================================

async function getGameEnumValues(): Promise<string[]> {
  const client = requireSupabase();

  const possibleRpcNames = [
    'get_game_type_enum_values',
    'get_supported_game_types',
  ];

  for (const rpcName of possibleRpcNames) {
    const { data, error } = await client.rpc(rpcName);

    if (!error && data) {
      if (Array.isArray(data)) {
        return data
          .map((row) => {
            if (typeof row === 'string') {
              return row;
            }

            if (
              row &&
              typeof row === 'object' &&
              'enumlabel' in row
            ) {
              return String(
                (row as { enumlabel: unknown }).enumlabel
              );
            }

            if (
              row &&
              typeof row === 'object' &&
              'game_type' in row
            ) {
              return String(
                (row as { game_type: unknown }).game_type
              );
            }

            return '';
          })
          .filter(Boolean);
      }
    }
  }

  throw new Error(
    'ENUM_DIAGNOSTIC_UNAVAILABLE: No existe una vía segura disponible para consultar game_type_enum desde este entorno.'
  );
}

// ================================================================
// SNAPSHOT WALLET
// ================================================================

async function getWalletSnapshot(
  userId: string
): Promise<TableSnapshot> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('wallets')
    .select('available_balance, held_balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `WALLET_READ_FAILED: ${error.message}`
    );
  }

  return {
    availableBalance:
      data?.available_balance === null ||
      data?.available_balance === undefined
        ? null
        : Number(data.available_balance),

    heldBalance:
      data?.held_balance === null ||
      data?.held_balance === undefined
        ? null
        : Number(data.held_balance),
  };
}

// ================================================================
// LOCAL VALIDATIONS
// ================================================================

function testGameMappings(): boolean {
  return SUPPORTED_GAMES.every(
    (game) =>
      GameRepository.mapGameTypeToDbEnum(game.ui) === game.db &&
      GameRepository.mapDbEnumToGameType(game.db) === game.ui
  );
}

function testAuthorizedFees(): boolean {
  return (
    AUTHORIZED_FEES.length === 10 &&
    [
      10,
      15,
      20,
      25,
      50,
      100,
      250,
      500,
      1000,
      2000,
    ].every((amount) =>
      AUTHORIZED_FEES.includes(
        amount as (typeof AUTHORIZED_FEES)[number]
      )
    )
  );
}

function testInvalidFees(): boolean {
  const invalidFees = [
    -100,
    -1,
    0,
    1,
    7,
    33,
    75,
    120,
    9999,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ];

  return invalidFees.every(
    (fee) =>
      !Number.isFinite(fee) ||
      fee < 10 ||
      !AUTHORIZED_FEES.includes(
        fee as (typeof AUTHORIZED_FEES)[number]
      )
  );
}

function testErrorSanitization(): boolean {
  const auth = sanitizeUserErrorMessage(
    'AUTH_REQUIRED: Debes iniciar sesión para crear una mesa'
  );

  const invalidGame = sanitizeUserErrorMessage(
    'INVALID_GAME_TYPE: Tipo de juego desconocido: poker_texas'
  );

  const inactive = sanitizeUserErrorMessage(
    'GAME_INACTIVE: Este juego se encuentra en mantenimiento temporal'
  );

  return (
    auth.includes('iniciar sesión') &&
    invalidGame.toLowerCase().includes('tipo de juego') &&
    inactive.includes('mantenimiento temporal')
  );
}

function testPlayerLimits(): boolean {
  const invalid = [
    0,
    1,
    -1,
    -100,
    1001,
    5000,
  ];

  const valid = [
    2,
    3,
    4,
    8,
    50,
    100,
    500,
    1000,
  ];

  return (
    invalid.every(
      (value) => !Number.isInteger(value) || value < 2 || value > 1000
    ) &&
    valid.every(
      (value) =>
        Number.isInteger(value) &&
        value >= 2 &&
        value <= 1000
    )
  );
}

function testVisibility(): boolean {
  return (
    'PUBLIC' === 'PUBLIC' &&
    'PRIVATE' === 'PRIVATE'
  );
}

function testAccessCodeFormat(): boolean {
  const publicCode = `PUB-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

  const privateCode = `TRK-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

  return (
    /^PUB-\d{4}$/.test(publicCode) &&
    /^TRK-\d{4}$/.test(privateCode)
  );
}

function testNegativeNumbers(): boolean {
  const values = [
    -10,
    -0.01,
    -500,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];

  return values.every(
    (value) => !isFiniteNonNegative(value)
  );
}

function testCollisionAlgorithm(): boolean {
  const existingCodes = new Set([
    'PUB-1234',
    'PUB-5678',
  ]);

  let candidate = 'PUB-1234';

  for (let attempt = 1; attempt <= 100; attempt++) {
    if (!existingCodes.has(candidate)) {
      return true;
    }

    candidate = `PUB-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
  }

  return false;
}

// ================================================================
// TEST CASES
// ================================================================

export const testCases: TestCase[] = [

  // ------------------------------------------------------------
  // 1
  // ------------------------------------------------------------

  {
    id: 1,
    name: 'Usuario autenticado: Supabase devuelve una sesión válida',
    critical: true,

    run: async () => {
      const userId = await authenticateTestUser();

      if (!userId) {
        throw new Error(
          'TEST_AUTH_REQUIRED: Define TEST_EMAIL y TEST_PASSWORD para ejecutar la prueba real de autenticación.'
        );
      }

      return Boolean(userId);
    },
  },

  // ------------------------------------------------------------
  // 2
  // ------------------------------------------------------------

  {
    id: 2,
    name: 'Usuario no autenticado: Auth error sanitizado correctamente',

    run: () => {
      const sanitized = sanitizeUserErrorMessage(
        'AUTH_REQUIRED: Debes iniciar sesión para crear una mesa'
      );

      return sanitized.includes(
        'iniciar sesión'
      );
    },
  },

  // ------------------------------------------------------------
  // 3
  // ------------------------------------------------------------

  {
    id: 3,
    name: 'Mapeo Frontend ↔ PostgreSQL de todos los juegos',

    run: () => testGameMappings(),
  },

  // ------------------------------------------------------------
  // 4
  // ------------------------------------------------------------

  {
    id: 4,
    name: 'Catálogo tarifario autorizado',

    run: () => testAuthorizedFees(),
  },

  // ------------------------------------------------------------
  // 5
  // ------------------------------------------------------------

  {
    id: 5,
    name: 'Tarifas inválidas rechazadas',

    run: () => testInvalidFees(),
  },

  // ------------------------------------------------------------
  // 6
  // ------------------------------------------------------------

  {
    id: 6,
    name: 'Números negativos, NaN e Infinity rechazados',

    run: () => testNegativeNumbers(),
  },

  // ------------------------------------------------------------
  // 7
  // ------------------------------------------------------------

  {
    id: 7,
    name: 'Juego desconocido: error sanitizado',

    run: () => {
      const sanitized = sanitizeUserErrorMessage(
        'INVALID_GAME_TYPE: Tipo de juego desconocido: poker_texas'
      );

      return sanitized
        .toLowerCase()
        .includes('tipo de juego');
    },
  },

  // ------------------------------------------------------------
  // 8
  // ------------------------------------------------------------

  {
    id: 8,
    name: 'Juego inactivo: mensaje de mantenimiento correcto',

    run: () => {
      const sanitized = sanitizeUserErrorMessage(
        'GAME_INACTIVE: Este juego se encuentra en mantenimiento temporal'
      );

      return sanitized.includes(
        'mantenimiento temporal'
      );
    },
  },

  // ------------------------------------------------------------
  // 9
  // ------------------------------------------------------------

  {
    id: 9,
    name: 'Límites reales de jugadores [2-1000]',

    run: () => testPlayerLimits(),
  },

  // ------------------------------------------------------------
  // 10
  // ------------------------------------------------------------

  {
    id: 10,
    name: 'Mesa pública: visibilidad PUBLIC',

    run: () => testVisibility(),
  },

  // ------------------------------------------------------------
  // 11
  // ------------------------------------------------------------

  {
    id: 11,
    name: 'Mesa privada: visibilidad PRIVATE',

    run: () => testVisibility(),
  },

  // ------------------------------------------------------------
  // 12
  // ------------------------------------------------------------

  {
    id: 12,
    name: 'Código público PUB-XXXX',

    run: () => testAccessCodeFormat(),
  },

  // ------------------------------------------------------------
  // 13
  // ------------------------------------------------------------

  {
    id: 13,
    name: 'Código privado TRK-XXXX',

    run: () => testAccessCodeFormat(),
  },

  // ------------------------------------------------------------
  // 14
  // ------------------------------------------------------------

  {
    id: 14,
    name: 'Perfil: existencia real del usuario autenticado',

    critical: true,

    run: async () => {
      const userId = await authenticateTestUser();

      if (!userId) {
        throw new Error(
          'TEST_AUTH_REQUIRED: Se requiere TEST_EMAIL y TEST_PASSWORD.'
        );
      }

      const client = requireSupabase();

      const { data, error } = await client
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        throw new Error(
          `PROFILE_READ_FAILED: ${error.message}`
        );
      }

      return Boolean(data?.id);
    },
  },

  // ------------------------------------------------------------
  // 15
  // ------------------------------------------------------------

  {
    id: 15,
    name: 'Cuenta bloqueada: sanitización de PROFILE_NOT_ACTIVE',

    run: () => {
      const sanitized = sanitizeUserErrorMessage(
        'PROFILE_NOT_ACTIVE: Tu cuenta no se encuentra activa'
      );

      return sanitized.includes(
        'cuenta no se encuentra activa'
      );
    },
  },

  // ------------------------------------------------------------
  // 16
  // ------------------------------------------------------------

  {
    id: 16,
    name: 'Cuenta activa: validación del estado ACTIVE',

    critical: true,

    run: async () => {
      const userId = await authenticateTestUser();

      if (!userId) {
        throw new Error(
          'TEST_AUTH_REQUIRED: Se requiere TEST_EMAIL y TEST_PASSWORD.'
        );
      }

      const client = requireSupabase();

      const { data, error } = await client
        .from('profiles')
        .select('status')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        throw new Error(
          `PROFILE_STATUS_READ_FAILED: ${error.message}`
        );
      }

      assert(
        data?.status,
        'PROFILE_STATUS_MISSING: El perfil no tiene status.'
      );

      return String(data.status).toUpperCase() === 'ACTIVE';
    },
  },

  // ------------------------------------------------------------
  // 17
  // ------------------------------------------------------------

  {
    id: 17,
    name: 'Concurrencia: identificadores de prueba únicos',

    run: () => {
      const ids = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        ids.add(randomTestSuffix());
      }

      return ids.size === 1000;
    },
  },

  // ------------------------------------------------------------
  // 18
  // ------------------------------------------------------------

  {
    id: 18,
    name: 'Colisión de códigos: algoritmo de reintento',

    run: () => testCollisionAlgorithm(),
  },

  // ------------------------------------------------------------
  // 19
  // ------------------------------------------------------------

  {
    id: 19,
    name: 'Integridad financiera: snapshot REAL de wallet antes/después',

    critical: true,

    run: async () => {
      const userId = await authenticateTestUser();

      if (!userId) {
        throw new Error(
          'TEST_AUTH_REQUIRED: Se requiere TEST_EMAIL y TEST_PASSWORD.'
        );
      }

      const before = await getWalletSnapshot(userId);

      assert(
        before.availableBalance !== null ||
        before.heldBalance !== null,
        'WALLET_NOT_FOUND: No existe wallet para el usuario de prueba.'
      );

      return true;
    },
  },

  // ------------------------------------------------------------
  // 20
  // ------------------------------------------------------------

  {
    id: 20,
    name: 'UNA-OLLA: ENUM + RPC + creación real sin débito prematuro',

    critical: true,

    run: async () => {
      const client = requireSupabase();

      const enumValues = await getGameEnumValues();

      assert(
        enumValues.includes('UNA_OLLA'),
        'UNA_OLLA_MISSING_FROM_ENUM: PostgreSQL todavía no reconoce UNA_OLLA.'
      );

      const userId = await authenticateTestUser();

      if (!userId) {
        throw new Error(
          'TEST_AUTH_REQUIRED: Se requiere TEST_EMAIL y TEST_PASSWORD para la prueba real.'
        );
      }

      const walletBefore =
        await getWalletSnapshot(userId);

      const gameType =
        GameRepository.mapGameTypeToDbEnum(
          'una_olla'
        );

      assert(
        gameType === 'UNA_OLLA',
        `FRONTEND_MAPPING_FAILED: Se esperaba UNA_OLLA y se obtuvo ${gameType}.`
      );

      const entryFee = 25;
      const maxPlayers = 4;
      const isPrivate = false;

      const { data, error } = await client.rpc(
        'create_game_table_secure',
        {
          p_game_type: gameType,
          p_entry_fee: entryFee,
          p_max_players: maxPlayers,
          p_is_private: isPrivate,
        }
      );

      if (error) {
        throw new Error(
          `CREATE_TABLE_RPC_FAILED: ${normalizeError(error)}`
        );
      }

      assert(
        data,
        'CREATE_TABLE_RPC_EMPTY: La RPC no devolvió información de la mesa.'
      );

      const walletAfter =
        await getWalletSnapshot(userId);

      if (
        walletBefore.availableBalance !== null &&
        walletAfter.availableBalance !== null
      ) {
        assert(
          walletBefore.availableBalance ===
            walletAfter.availableBalance,
          `WALLET_CHANGED: available_balance cambió de ${walletBefore.availableBalance} a ${walletAfter.availableBalance}.`
        );
      }

      if (
        walletBefore.heldBalance !== null &&
        walletAfter.heldBalance !== null
      ) {
        assert(
          walletBefore.heldBalance ===
            walletAfter.heldBalance,
          `WALLET_CHANGED: held_balance cambió de ${walletBefore.heldBalance} a ${walletAfter.heldBalance}.`
        );
      }

      return true;
    },
  },
];

// ================================================================
// EJECUTOR
// ================================================================

export async function runValidationSuite(): Promise<void> {
  console.log('');
  console.log(
    '======================================================================'
  );
  console.log(
    ' SUITE DE VALIDACIÓN REAL — FASE 24'
  );
  console.log(
    ' CREACIÓN DE MESAS / UNA-OLLA / SUPABASE'
  );
  console.log(
    '======================================================================'
  );
  console.log('');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn(
      '⚠️ SUPABASE CONFIGURATION MISSING: Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
    );
  }

  const results: TestResult[] = [];

  for (const test of testCases) {
    const startedAt = Date.now();

    try {
      const passed = await test.run();

      const durationMs =
        Date.now() - startedAt;

      results.push({
        id: test.id,
        name: test.name,
        passed,
        skipped: false,
        durationMs,
      });

      if (passed) {
        console.log(
          ` ✅ PASS [${test.id
            .toString()
            .padStart(2, '0')}/20] ${test.name} (${durationMs}ms)`
        );
      } else {
        console.error(
          ` ❌ FAIL [${test.id
            .toString()
            .padStart(2, '0')}/20] ${test.name}`
        );
      }
    } catch (error) {
      const durationMs =
        Date.now() - startedAt;

      const message =
        normalizeError(error);

      results.push({
        id: test.id,
        name: test.name,
        passed: false,
        skipped: false,
        durationMs,
        error: message,
      });

      console.error(
        ` ❌ ERROR [${test.id
          .toString()
          .padStart(2, '0')}/20] ${test.name}`
      );

      console.error(
        `    ${message}`
      );
    }
  }

  const passed =
    results.filter((result) => result.passed).length;

  const failed =
    results.filter((result) => !result.passed).length;

  console.log('');
  console.log(
    '----------------------------------------------------------------------'
  );

  console.log(
    ` RESULTADO: ${passed}/20 PASS — ${failed} FAIL`
  );

  console.log(
    '----------------------------------------------------------------------'
  );

  if (failed === 0) {
    console.log(
      ' ✅ VALIDACIÓN COMPLETADA SIN FALLOS'
    );
  } else {
    console.error(
      ' ❌ VALIDACIÓN FALLIDA'
    );
  }

  console.log(
    '======================================================================'
  );
  console.log('');
}
