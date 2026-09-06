import pg from 'pg';

const { Client } = pg;

let connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
connectionString = connectionString.replace(/:\/\/([^:]+):\[([^\]]+)\]@/, '://\$1:\$2@');

interface GameTestSpec {
  gameType: string;
  name: string;
  entryFee: number;
  maxPlayers: number;
  config: Record<string, any>;
  expectedEnum: string;
  expectedMinPlayers: number;
}

const testSpecs: GameTestSpec[] = [
  {
    gameType: 'tic_tac_toe',
    name: 'Prueba Tres en Raya',
    entryFee: 25,
    maxPlayers: 2,
    config: { variant: 'CLASSIC' },
    expectedEnum: 'TRES_EN_RAYA',
    expectedMinPlayers: 2
  },
  {
    gameType: 'domino',
    name: 'Prueba Domino Criollo',
    entryFee: 15,
    maxPlayers: 4,
    config: { variant: 'VENEZOLANO_PAREJAS' },
    expectedEnum: 'DOMINO_VENEZOLANO',
    expectedMinPlayers: 2
  },
  {
    gameType: 'truco',
    name: 'Prueba Truco Venezolano',
    entryFee: 20,
    maxPlayers: 2,
    config: { variant: 'ORIENTAL' },
    expectedEnum: 'TRUCO_VENEZOLANO',
    expectedMinPlayers: 2
  },
  {
    gameType: 'rock_paper_scissors',
    name: 'Prueba Piedra Papel Tijera',
    entryFee: 10,
    maxPlayers: 2,
    config: { variant: 'BEST_OF_3' },
    expectedEnum: 'PIEDRA_PAPEL_TIJERA',
    expectedMinPlayers: 2
  },
  {
    gameType: 'damas',
    name: 'Prueba Damas',
    entryFee: 10,
    maxPlayers: 2,
    config: { variant: 'STANDARD' },
    expectedEnum: 'DAMAS',
    expectedMinPlayers: 2
  },
  {
    gameType: 'chess',
    name: 'Prueba Ajedrez Criollo',
    entryFee: 25,
    maxPlayers: 2,
    config: { variant: 'RAPID' },
    expectedEnum: 'CHESS',
    expectedMinPlayers: 2
  },
  {
    gameType: 'atrapaito',
    name: 'Prueba Atrapaito',
    entryFee: 15,
    maxPlayers: 2,
    config: { variant: 'CRIOLLO' },
    expectedEnum: 'ATRAPAITO',
    expectedMinPlayers: 2
  },
  {
    gameType: 'una_olla',
    name: 'Prueba Una Olla Card',
    entryFee: 20,
    maxPlayers: 4,
    config: { variant: 'STANDARD' },
    expectedEnum: 'UNA_OLLA',
    expectedMinPlayers: 2
  },
  {
    gameType: 'bingo',
    name: 'Prueba Bingo 90 Bolas',
    entryFee: 10,
    maxPlayers: 50,
    config: { variant: '90' },
    expectedEnum: 'BINGO',
    expectedMinPlayers: 2
  },
  {
    gameType: 'polla_venezolana',
    name: 'Prueba Polla Futbol',
    entryFee: 50,
    maxPlayers: 100,
    config: { variant: 'FUTBOL' },
    expectedEnum: 'POLLA_VENEZOLANA',
    expectedMinPlayers: 2
  }
];

async function runMatrixTests() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('=== [MATRIZ DE VALIDACIÓN DE JUEGOS — SUPABASE REMOTA] ===\n');

    const testUserId = 'b733db64-4912-4a33-8d7a-4ee332c7b5f1';

    let allPassed = true;

    for (const spec of testSpecs) {
      console.log(`[TEST JUEGO] -> ${spec.gameType} (${spec.name}):`);

      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL "request.jwt.claim.sub" = '${testUserId}'`);
        await client.query(`SET LOCAL "request.jwt.claim.role" = 'authenticated'`);
        await client.query(`SET LOCAL ROLE authenticated`);

        // Habilitar temporalmente dentro de la transacción de prueba para evaluar la RPC
        await client.query(`RESET ROLE`);
        await client.query(`UPDATE public.game_configurations SET enabled = true WHERE true`);
        await client.query(`SET LOCAL ROLE authenticated`);

        const res = await client.query(`
          SELECT public.create_game_table_secure(
            $1,
            $2,
            'PUBLIC'::table_visibility_enum,
            $3,
            $4::smallint,
            $5::jsonb
          ) as result;
        `, [spec.gameType, spec.name, spec.entryFee, spec.maxPlayers, JSON.stringify(spec.config)]);

        const data = res.rows[0].result;

        if (!data || !data.success || !data.table_id) {
          throw new Error(`Respuesta inválida de RPC: ${JSON.stringify(data)}`);
        }

        console.log(`  ✓ Éxito! Mesa ID: ${data.table_id}`);
        console.log(`    game_type: ${data.game_type} | game_variant: ${data.game_variant} | entry_fee: ${data.entry_fee} Bs | invite_code: ${data.invite_code}`);

        // Revertir para mantener el saldo intacto y no acumular mesas
        await client.query('ROLLBACK');
      } catch (err: any) {
        allPassed = false;
        await client.query('ROLLBACK').catch(() => {});
        console.error(`  ❌ FALLÓ ${spec.gameType}:`, err.message);
      }
    }

    console.log('\n=============================================================');
    if (allPassed) {
      console.log('🎉 TODOS LOS 10 JUEGOS DE LA MATRIZ PASARON SATISFACTORIAMENTE!');
    } else {
      console.error('⚠️ AL MENOS UN JUEGO DE LA MATRIZ FALLÓ.');
    }
    console.log('=============================================================');

  } catch (err: any) {
    console.error('Error general en matriz:', err);
  } finally {
    await client.end();
  }
}

runMatrixTests();
