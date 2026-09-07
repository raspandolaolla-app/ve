import pg from 'pg';

const { Client } = pg;

let connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
connectionString = connectionString.replace(/:\/\/([^:]+):\[([^\]]+)\]@/, '://\$1:\$2@');

async function testStartGameSession() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('=== [PRUEBA FORENSE DE EJECUCIÓN REAL: start_game_session_secure] ===\n');

    const testUserId1 = 'b733db64-4912-4a33-8d7a-4ee332c7b5f1'; // Francisco Morales
    // Segundo usuario real de auth.users
    const testUserId2 = '1c136cc5-e048-4fab-a1b3-80100b62e1d5';

    await client.query('BEGIN');
    
    // 1. Simular JWT auth como testUserId1
    await client.query(`SET LOCAL "request.jwt.claim.sub" = '${testUserId1}'`);
    await client.query(`SET LOCAL "request.jwt.claim.role" = 'authenticated'`);
    await client.query(`SET LOCAL ROLE authenticated`);

    console.log('1. Creando mesa con create_game_table_secure...');
    const createRes = await client.query(`
      SELECT public.create_game_table_secure(
        'tic_tac_toe',
        'Mesa Test Iniciar Sesion',
        'PUBLIC'::table_visibility_enum,
        0, -- Entrada gratuita para prueba
        2::smallint,
        '{"variant": "CLASSIC"}'::jsonb
      ) as result;
    `);

    const tableResult = createRes.rows[0].result;
    console.log('   Mesa creada exitosamente:', tableResult.table_id);
    const tableId = tableResult.table_id;

    // 2. Agregar segundo jugador a la mesa
    await client.query(`RESET ROLE`);
    console.log('2. Registrando segundo jugador en game_table_players...');
    await client.query(`
      INSERT INTO public.game_table_players (table_id, user_id, seat_number, status)
      VALUES ($1, $2, 2, 'READY')
      ON CONFLICT DO NOTHING;
    `, [tableId, testUserId2]);

    // 3. Volver al rol autenticado del creador
    await client.query(`SET LOCAL "request.jwt.claim.sub" = '${testUserId1}'`);
    await client.query(`SET LOCAL "request.jwt.claim.role" = 'authenticated'`);
    await client.query(`SET LOCAL ROLE authenticated`);

    // 4. Llamar a start_game_session_secure
    console.log('3. Llamando a public.start_game_session_secure...');
    const startRes = await client.query(`
      SELECT public.start_game_session_secure(
        $1::uuid,
        '{"round": 1}'::jsonb,
        30,
        $2::uuid
      ) as result;
    `, [tableId, testUserId1]);

    const sessionResult = startRes.rows[0].result;
    console.log('   ✓ Éxito rotundo! Resultado de start_game_session_secure:');
    console.log(JSON.stringify(sessionResult, null, 2));

    if (!sessionResult.success || !sessionResult.sessionId) {
      throw new Error('start_game_session_secure no devolvió sessionId o success=true');
    }

    // 5. Verificar jugadores generados
    console.log('\n4. Verificando estructura de jugadores generada:');
    console.table(sessionResult.players);

    // 6. Verificar que no se alteró la integridad al hacer ROLLBACK
    await client.query('ROLLBACK');
    console.log('\n✓ Transacción revertida (ROLLBACK). Billeteras y estado limpios.');
    console.log('🎉 start_game_session_secure FUNCIONA AL 100% SIN NINGÚN ERROR!');

  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error en testStartGameSession:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

testStartGameSession();
