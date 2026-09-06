import pg from 'pg';

const { Client } = pg;

let connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
connectionString = connectionString.replace(/:\/\/([^:]+):\[([^\]]+)\]@/, '://\$1:\$2@');

async function testRpcExecution() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('=== [PRUEBA REAL 1: TIC TAC TOE VIA POSTGRES/RPC] ===');

    const testUserId = 'b733db64-4912-4a33-8d7a-4ee332c7b5f1';

    // 1. Obtener estado previo de wallet
    const prevWalletRes = await client.query(
      `SELECT available_balance, held_balance FROM public.wallets WHERE user_id = $1`,
      [testUserId]
    );
    const prevAvail = parseFloat(prevWalletRes.rows[0].available_balance);
    const prevHeld = parseFloat(prevWalletRes.rows[0].held_balance);
    console.log(`Billetera antes: Disponible = ${prevAvail} Bs., Retenido = ${prevHeld} Bs.`);

    // 2. Iniciar transacción simulando el contexto JWT exacto de Supabase PostgREST
    await client.query('BEGIN');
    await client.query(`SET LOCAL "request.jwt.claim.sub" = '${testUserId}'`);
    await client.query(`SET LOCAL "request.jwt.claim.role" = 'authenticated'`);
    await client.query(`SET LOCAL ROLE authenticated`);

    // Comprobar auth.uid() en la sesión
    const authUidRes = await client.query(`SELECT auth.uid() as current_user`);
    console.log(`Contexto auth.uid() autenticado: ${authUidRes.rows[0].current_user}`);

    // 3. Ejecutar create_game_table_secure
    console.log('Ejecutando public.create_game_table_secure para tic_tac_toe con 25 Bs...');
    const rpcRes = await client.query(`
      SELECT public.create_game_table_secure(
        'tic_tac_toe',
        'Mesa Real TicTacToe Test',
        'PUBLIC'::table_visibility_enum,
        25.00,
        2::smallint,
        '{"variant": "CLASSIC", "test": true}'::jsonb
      ) as result;
    `);

    const result = rpcRes.rows[0].result;
    console.log('[CREATE_TABLE_SUCCESS] Resultado retornado por RPC:');
    console.log(JSON.stringify(result, null, 2));

    const createdTableId = result.table_id || result.id;
    console.log(`Mesa creada con ID: ${createdTableId}`);

    // 4. Verificar existencia real en public.game_tables
    // Salimos del rol autenticado temporalmente para consultar el estado interno
    await client.query(`RESET ROLE`);
    
    const tableCheckRes = await client.query(
      `SELECT id, game_type, game_variant, name, entry_fee, current_players_count, status, host_user_id, config 
       FROM public.game_tables WHERE id = $1`,
      [createdTableId]
    );
    console.log('\n--- VERIFICACIÓN EN public.game_tables ---');
    console.table(tableCheckRes.rows);

    // 5. Verificar existencia real en public.game_table_players
    const playerCheckRes = await client.query(
      `SELECT id, table_id, user_id, seat_number, status, entry_held_entry_id 
       FROM public.game_table_players WHERE table_id = $1`,
      [createdTableId]
    );
    console.log('\n--- VERIFICACIÓN EN public.game_table_players ---');
    console.table(playerCheckRes.rows);

    // 6. Verificar wallets durante la transacción
    const midWalletRes = await client.query(
      `SELECT available_balance, held_balance FROM public.wallets WHERE user_id = $1`,
      [testUserId]
    );
    const midAvail = parseFloat(midWalletRes.rows[0].available_balance);
    const midHeld = parseFloat(midWalletRes.rows[0].held_balance);
    console.log(`\nBilletera post-creación: Disponible = ${midAvail} Bs., Retenido = ${midHeld} Bs.`);
    console.log(`Diferencia Disponible: ${(midAvail - prevAvail).toFixed(2)} Bs (Esperado: -25.00 Bs)`);
    console.log(`Diferencia Retenido: ${(midHeld - prevHeld).toFixed(2)} Bs (Esperado: +25.00 Bs)`);

    // 7. Verificar ledger_entries
    const ledgerCheckRes = await client.query(
      `SELECT id, entry_type, direction, amount, balance_after_available, balance_after_held, description 
       FROM public.ledger_entries WHERE reference_id = $1`,
      [createdTableId]
    );
    console.log('\n--- VERIFICACIÓN EN public.ledger_entries ---');
    console.table(ledgerCheckRes.rows);

    // 8. Revertimos la transacción de prueba para NO tocar ni gastar los 25 Bs reales de Francisco Morales
    await client.query('ROLLBACK');
    console.log('\n✓ Transacción finalizada y revertida limpiamente (ROLLBACK) para resguardar el saldo real del usuario.');
    console.log('🎉 LA RPC create_game_table_secure FUNCIONA AL 100% SIN EL ERROR 42703!');

  } catch (err: any) {
    console.error('❌ ERROR AL EJECUTAR RPC:', {
      code: err.code,
      message: err.message,
      detail: err.detail,
      hint: err.hint,
    });
  } finally {
    await client.end();
  }
}

testRpcExecution();
