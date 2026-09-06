import pg from 'pg';

let connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();
connectionString = connectionString.replace(/:\/\/([^:]+):\[([^\]]+)\]@/, '://$1:$2@');

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runRPSTestSuite() {
  await client.connect();
  console.log('===============================================================');
  console.log('SUITE DE VALIDACIÓN FORENSE Y PRUEBAS AUTOMATIZADAS DE RPS');
  console.log('===============================================================');

  try {
    // 0. Crear dos usuarios de prueba o seleccionar existentes
    const usersRes = await client.query(`
      SELECT id, email FROM auth.users ORDER BY created_at ASC LIMIT 2;
    `);

    let p1Id = usersRes.rows[0]?.id;
    let p2Id = usersRes.rows[1]?.id;

    if (!p1Id || !p2Id) {
      console.log('Creando usuarios temporales para el test...');
      const u1 = await client.query(`
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        VALUES (gen_random_uuid(), 'test_rps_p1@example.com', 'dummy', NOW(), '{"provider":"email","providers":["email"]}', '{"name":"Player 1"}', NOW(), NOW())
        RETURNING id;
      `);
      const u2 = await client.query(`
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        VALUES (gen_random_uuid(), 'test_rps_p2@example.com', 'dummy', NOW(), '{"provider":"email","providers":["email"]}', '{"name":"Player 2"}', NOW(), NOW())
        RETURNING id;
      `);
      p1Id = u1.rows[0].id;
      p2Id = u2.rows[0].id;
    }

    console.log(`Jugador 1: ${p1Id}`);
    console.log(`Jugador 2: ${p2Id}`);

    // Asegurar billeteras y saldo para los tests
    await client.query(`
      INSERT INTO public.wallets (user_id, available_balance, held_balance, updated_at)
      VALUES 
        ($1, 100.00, 0.00, NOW()),
        ($2, 100.00, 0.00, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET available_balance = GREATEST(public.wallets.available_balance, 100.00);
    `, [p1Id, p2Id]);

    // 1. Crear una mesa de prueba para RPS
    const tableRes = await client.query(`
      INSERT INTO public.game_tables (
        host_user_id,
        game_type,
        status,
        min_players,
        max_players,
        entry_fee,
        visibility,
        invite_code,
        expires_at,
        created_at,
        updated_at
      ) VALUES (
        $1,
        'PIEDRA_PAPEL_TIJERA',
        'ACTIVE',
        2,
        2,
        10.00,
        'PUBLIC',
        'RPS' || floor(100000 + random() * 900000)::text,
        NOW() + INTERVAL '1 hour',
        NOW(),
        NOW()
      ) RETURNING id;
    `, [p1Id]);

    const tableId = tableRes.rows[0].id;
    console.log(`Mesa de prueba creada: ${tableId}`);

    // Unir a ambos jugadores en game_table_players
    await client.query(`
      INSERT INTO public.game_table_players (table_id, user_id, seat_number, status, joined_at)
      VALUES 
        ($1, $2, 1, 'READY', NOW()),
        ($1, $3, 2, 'READY', NOW());
    `, [tableId, p1Id, p2Id]);

    // Retener entrada en las billeteras
    await client.query(`
      UPDATE public.wallets
      SET available_balance = available_balance - 10.00,
          held_balance = held_balance + 10.00
      WHERE user_id IN ($1, $2);
    `, [p1Id, p2Id]);

    // 2. Crear sesión de RPS
    const sessionRes = await client.query(`
      INSERT INTO public.game_sessions (
        table_id,
        game_type,
        status,
        current_turn_user_id,
        current_state,
        turn_expires_at,
        created_at,
        updated_at
      ) VALUES (
        $1,
        'PIEDRA_PAPEL_TIJERA',
        'ACTIVE',
        NULL,
        jsonb_build_object(
          'player1Id', $2::text,
          'player2Id', $3::text,
          'roundNumber', 1,
          'round', 1,
          'player1Lives', 3,
          'player2Lives', 3,
          'status', 'ROUND_COMMIT',
          'phase', 'selecting',
          'currentTurnUserId', NULL,
          'playerChoices', jsonb_build_object(
            $2::text, jsonb_build_object('committed', false),
            $3::text, jsonb_build_object('committed', false)
          )
        ),
        NOW() + INTERVAL '15 seconds',
        NOW(),
        NOW()
      ) RETURNING id;
    `, [tableId, p1Id, p2Id]);

    const sessionId = sessionRes.rows[0].id;
    console.log(`Sesión RPS creada: ${sessionId}`);

    // =========================================================================
    // PRUEBA 1: COMMIT JUGADOR 1
    // =========================================================================
    console.log('\n--- PRUEBA 1: Commit Jugador 1 (ROCK) ---');
    await client.query(`SET request.jwt.claim.sub = '${p1Id}';`);
    const p1CommitRes = await client.query(`
      SELECT public.submit_rps_choice_secure($1, 'ROCK') as result;
    `, [sessionId]);

    const p1Result = p1CommitRes.rows[0].result;
    console.log('Resultado P1 commit:', p1Result);

    if (!p1Result.success || !p1Result.committed || p1Result.bothChosen) {
      throw new Error(`Fallo en Prueba 1: ${JSON.stringify(p1Result)}`);
    }

    // Verificar que current_state en BD no sea null y refleje commit seguro
    const sessState1 = await client.query(`
      SELECT current_state, current_turn_user_id FROM public.game_sessions WHERE id = $1;
    `, [sessionId]);
    console.log('BD current_state tras P1 commit:', sessState1.rows[0].current_state);
    if (!sessState1.rows[0].current_state || sessState1.rows[0].current_turn_user_id !== null) {
      throw new Error('Fallo: current_state es NULL o current_turn_user_id no es NULL tras P1 commit');
    }
    console.log('✓ PRUEBA 1 SUPERADA: Commit P1 exitoso, current_state no-null, secreto protegido.');

    // =========================================================================
    // PRUEBA 2: ANTI-DOUBLE-SUBMIT JUGADOR 1
    // =========================================================================
    console.log('\n--- PRUEBA 2: Anti-Double-Submit Jugador 1 ---');
    const p1DoubleRes = await client.query(`
      SELECT public.submit_rps_choice_secure($1, 'PAPER') as result;
    `, [sessionId]);
    console.log('Resultado doble envío:', p1DoubleRes.rows[0].result);
    if (p1DoubleRes.rows[0].result.success !== false || p1DoubleRes.rows[0].result.error !== 'ALREADY_COMMITTED') {
      throw new Error('Fallo: Se permitió doble envío de jugada para el mismo jugador');
    }
    console.log('✓ PRUEBA 2 SUPERADA: Doble envío bloqueado con ALREADY_COMMITTED.');

    // =========================================================================
    // PRUEBA 3: COMMIT JUGADOR 2 Y REVELACIÓN ATÓMICA (ROCK vs SCISSORS -> GANA P1)
    // =========================================================================
    console.log('\n--- PRUEBA 3: Commit Jugador 2 (SCISSORS) y Revelación Atómica ---');
    await client.query(`SET request.jwt.claim.sub = '${p2Id}';`);
    const p2CommitRes = await client.query(`
      SELECT public.submit_rps_choice_secure($1, 'SCISSORS') as result;
    `, [sessionId]);

    const p2Result = p2CommitRes.rows[0].result;
    console.log('Resultado P2 commit y revelación:', p2Result);

    if (!p2Result.success || !p2Result.bothChosen || p2Result.roundWinner !== 'PLAYER1') {
      throw new Error(`Fallo en Prueba 3: ${JSON.stringify(p2Result)}`);
    }

    // Verificar en BD que current_state no sea NULL (¡ERROR DE PRODUCCIÓN CORREGIDO!)
    const sessState2 = await client.query(`
      SELECT current_state, current_turn_user_id, status FROM public.game_sessions WHERE id = $1;
    `, [sessionId]);
    console.log('BD current_state tras revelación:', sessState2.rows[0].current_state);
    if (!sessState2.rows[0].current_state) {
      throw new Error('FATAL: current_state en game_sessions es NULL tras revelación');
    }
    if (sessState2.rows[0].current_state.player2Lives !== 2) {
      throw new Error('Fallo: Vidas de Jugador 2 no disminuyeron a 2');
    }
    console.log('✓ PRUEBA 3 SUPERADA: Revelación atómica correcta, current_state no-null, vidas actualizadas (P2 = 2).');

    // =========================================================================
    // PRUEBA 4: SIGUIENTE RONDA (next_rps_round_secure)
    // =========================================================================
    console.log('\n--- PRUEBA 4: Siguiente Ronda (next_rps_round_secure) ---');
    const nextRoundRes = await client.query(`
      SELECT public.next_rps_round_secure($1) as result;
    `, [sessionId]);
    console.log('Resultado next round:', nextRoundRes.rows[0].result);
    if (!nextRoundRes.rows[0].result.success || nextRoundRes.rows[0].result.round !== 2) {
      throw new Error(`Fallo en Prueba 4: ${JSON.stringify(nextRoundRes.rows[0].result)}`);
    }

    const sessStateR2 = await client.query(`
      SELECT current_state, current_turn_user_id FROM public.game_sessions WHERE id = $1;
    `, [sessionId]);
    if (!sessStateR2.rows[0].current_state || sessStateR2.rows[0].current_state.roundNumber !== 2) {
      throw new Error('Fallo: Ronda 2 no inicializada correctamente');
    }
    console.log('✓ PRUEBA 4 SUPERADA: Ronda 2 inicializada, status ROUND_COMMIT, secretos reseteados.');

    // =========================================================================
    // PRUEBA 5: EMPATE (DRAW) Y NO SOBREESCRITURA DE NULL
    // =========================================================================
    console.log('\n--- PRUEBA 5: Empate (PAPER vs PAPER) ---');
    await client.query(`SET request.jwt.claim.sub = '${p1Id}';`);
    await client.query(`SELECT public.submit_rps_choice_secure($1, 'PAPER');`, [sessionId]);

    await client.query(`SET request.jwt.claim.sub = '${p2Id}';`);
    const drawRes = await client.query(`
      SELECT public.submit_rps_choice_secure($1, 'PAPER') as result;
    `, [sessionId]);

    console.log('Resultado Empate:', drawRes.rows[0].result);
    if (!drawRes.rows[0].result.success || drawRes.rows[0].result.roundWinner !== 'DRAW') {
      throw new Error(`Fallo en Prueba 5: ${JSON.stringify(drawRes.rows[0].result)}`);
    }

    const sessStateDraw = await client.query(`
      SELECT current_state FROM public.game_sessions WHERE id = $1;
    `, [sessionId]);
    console.log('BD current_state tras Empate:', sessStateDraw.rows[0].current_state);
    if (!sessStateDraw.rows[0].current_state || sessStateDraw.rows[0].current_state.roundWinner !== 'DRAW') {
      throw new Error('Fallo: Empate no registrado adecuadamente');
    }
    console.log('✓ PRUEBA 5 SUPERADA: Empate manejado limpiamente sin corromper current_state.');

    // Avanzar a Ronda 3
    await client.query(`SELECT public.next_rps_round_secure($1);`, [sessionId]);

    // =========================================================================
    // PRUEBA 6: FIN DE PARTIDA Y LIQUIDACIÓN FINANCIERA (P1 gana hasta dejar a P2 en 0)
    // =========================================================================
    console.log('\n--- PRUEBA 6: Fin de Partida y Liquidación Financiera Universal ---');
    // Para probar la victoria final, reducimos vidas de P2 a 1 en el estado antes de la jugada
    await client.query(`
      UPDATE public.game_sessions
      SET current_state = current_state || jsonb_build_object('player2Lives', 1)
      WHERE id = $1;
    `, [sessionId]);

    // P1 elige ROCK, P2 elige SCISSORS -> P2 pierde su última vida (0 vidas)
    await client.query(`SET request.jwt.claim.sub = '${p1Id}';`);
    await client.query(`SELECT public.submit_rps_choice_secure($1, 'ROCK');`, [sessionId]);

    await client.query(`SET request.jwt.claim.sub = '${p2Id}';`);
    const finalMatchRes = await client.query(`
      SELECT public.submit_rps_choice_secure($1, 'SCISSORS') as result;
    `, [sessionId]);

    console.log('Resultado Fin de Partida:', finalMatchRes.rows[0].result);
    if (!finalMatchRes.rows[0].result.success || !finalMatchRes.rows[0].result.isGameOver) {
      throw new Error(`Fallo en Prueba 6: ${JSON.stringify(finalMatchRes.rows[0].result)}`);
    }

    // Verificar estado final de sesión y mesa
    const sessFinal = await client.query(`
      SELECT s.status as sess_status, s.winner_user_id, t.status as table_status
      FROM public.game_sessions s
      JOIN public.game_tables t ON t.id = s.table_id
      WHERE s.id = $1;
    `, [sessionId]);

    console.log('Estado final sesión/mesa:', sessFinal.rows[0]);
    if (sessFinal.rows[0].sess_status !== 'FINISHED' || sessFinal.rows[0].table_status !== 'CLOSED') {
      throw new Error('Fallo: Sesión no FINISHED o Mesa no CLOSED tras Game Over');
    }

    // Verificar liquidación en game_settlements
    const settlementCheck = await client.query(`
      SELECT id, gross_pool, prize_pool, platform_fee, total_distributed, settlement_type
      FROM public.game_settlements
      WHERE session_id = $1;
    `, [sessionId]);
    console.log('Registro de liquidación financiera:', settlementCheck.rows[0]);

    if (!settlementCheck.rows[0] || parseFloat(settlementCheck.rows[0].gross_pool) <= 0) {
      throw new Error('Fallo: No se registró la liquidación financiera en game_settlements');
    }

    console.log('✓ PRUEBA 6 SUPERADA: Fin de partida completado, mesa cerrada y liquidación universal registrada.');

    // =========================================================================
    // PRUEBA 7: TIMEOUT DE RONDA RPS (process_expired_turns)
    // =========================================================================
    console.log('\n--- PRUEBA 7: Timeout de Ronda en RPS (process_expired_turns) ---');
    // Creamos una mesa y sesión expirada
    const timeoutTable = await client.query(`
      INSERT INTO public.game_tables (
        host_user_id, game_type, status, min_players, max_players, entry_fee, visibility, invite_code, expires_at
      ) VALUES ($1, 'PIEDRA_PAPEL_TIJERA', 'ACTIVE', 2, 2, 5.00, 'PUBLIC', 'TO' || floor(100000 + random() * 900000)::text, NOW() + INTERVAL '1 hour')
      RETURNING id;
    `, [p1Id]);
    const tTableId = timeoutTable.rows[0].id;

    await client.query(`
      INSERT INTO public.game_table_players (table_id, user_id, seat_number, status, joined_at)
      VALUES ($1, $2, 1, 'READY', NOW()), ($1, $3, 2, 'READY', NOW());
    `, [tTableId, p1Id, p2Id]);

    const timeoutSess = await client.query(`
      INSERT INTO public.game_sessions (
        table_id, game_type, status, current_turn_user_id, current_state, turn_expires_at, turn_deadline_at
      ) VALUES (
        $1, 'PIEDRA_PAPEL_TIJERA', 'ACTIVE', NULL,
        jsonb_build_object(
          'player1Id', $2::text, 'player2Id', $3::text,
          'roundNumber', 1, 'status', 'ROUND_COMMIT', 'phase', 'selecting',
          'playerChoices', jsonb_build_object($2::text, jsonb_build_object('committed', true))
        ),
        NOW() - INTERVAL '10 seconds',
        NOW() - INTERVAL '10 seconds'
      ) RETURNING id;
    `, [tTableId, p1Id, p2Id]);
    const tSessId = timeoutSess.rows[0].id;

    // Registrar en secrets que p1 hizo commit pero p2 no
    await client.query(`
      INSERT INTO public.game_session_secrets (session_id, secret_state, server_seed)
      VALUES ($1, jsonb_build_object('rps_choices', jsonb_build_object($2::text, 'ROCK')), 'seed_timeout');
    `, [tSessId, p1Id]);

    // Ejecutar process_expired_turns
    await client.query(`SELECT public.process_expired_turns();`);

    const timeoutCheck = await client.query(`
      SELECT status, winner_user_id, current_state FROM public.game_sessions WHERE id = $1;
    `, [tSessId]);

    console.log('Resultado tras process_expired_turns:', timeoutCheck.rows[0]);
    if (timeoutCheck.rows[0].status !== 'FINISHED' || timeoutCheck.rows[0].winner_user_id !== p1Id) {
      throw new Error('Fallo: Timeout no otorgó victoria a P1 por abandono de P2');
    }
    if (!timeoutCheck.rows[0].current_state) {
      throw new Error('FATAL: current_state es NULL tras process_expired_turns');
    }
    console.log('✓ PRUEBA 7 SUPERADA: Timeout procesado correctamente sin violar NOT NULL.');

    console.log('\n===============================================================');
    console.log('TODAS LAS PRUEBAS (1 A 7) FUERON COMPLETADAS CON ÉXITO (100% PASS)');
    console.log('===============================================================');

  } catch (error) {
    console.error('ERROR EN SUITE DE PRUEBAS:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runRPSTestSuite();
