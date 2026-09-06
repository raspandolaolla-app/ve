import pg from 'pg';

const { Client } = pg;

let connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
connectionString = connectionString.replace(/:\/\/([^:]+):\[([^\]]+)\]@/, '://$1:$2@');

async function auditDatabase() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('=== [AUDITORÍA DE SUPABASE REMOTA] CONEXIÓN EXITOSA ===\n');

    // 1. Columnas de public.game_tables
    console.log('--- 1. COLUMNAS DE public.game_tables ---');
    const tableColsRes = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'game_tables'
      ORDER BY ordinal_position;
    `);
    console.table(tableColsRes.rows);

    const hasGameVariantInTables = tableColsRes.rows.some(r => r.column_name === 'game_variant');
    console.log(`¿Existe game_variant en game_tables?: ${hasGameVariantInTables ? 'SÍ' : 'NO'}`);

    // 2. Columnas de public.game_sessions
    console.log('\n--- 2. COLUMNAS DE public.game_sessions ---');
    const sessionColsRes = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'game_sessions'
      ORDER BY ordinal_position;
    `);
    console.table(sessionColsRes.rows);

    const hasGameVariantInSessions = sessionColsRes.rows.some(r => r.column_name === 'game_variant');
    console.log(`¿Existe game_variant en game_sessions?: ${hasGameVariantInSessions ? 'SÍ' : 'NO'}`);

    // 3. Definición actual de create_game_table_secure
    console.log('\n--- 3. DEFINICIÓN DE create_game_table_secure EN pg_proc ---');
    const funcRes = await client.query(`
      SELECT 
        p.proname,
        pg_get_function_arguments(p.oid) as arguments,
        pg_get_function_result(p.oid) as result_type,
        p.prosecdef as is_security_definer,
        p.proconfig as search_path_config,
        p.prosrc as source_code
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'create_game_table_secure';
    `);

    if (funcRes.rows.length === 0) {
      console.log('❌ NO SE ENCONTRÓ la función create_game_table_secure en public!');
    } else {
      const fn = funcRes.rows[0];
      console.log(`Nombre: ${fn.proname}`);
      console.log(`Argumentos: ${fn.arguments}`);
      console.log(`Tipo retorno: ${fn.result_type}`);
      console.log(`SECURITY DEFINER: ${fn.is_security_definer ? 'SÍ' : 'NO'}`);
      console.log(`Search Path Config: ${JSON.stringify(fn.search_path_config)}`);
      console.log(`Líneas de código fuente: ${fn.source_code.split('\n').length}`);
      
      // Buscar si tiene referencias a game_variant en INSERT
      const hasInsertVariant = /INSERT\s+INTO\s+public\.game_tables[^(]*\([^)]*game_variant/i.test(fn.source_code);
      console.log(`¿El INSERT INTO game_tables incluye game_variant?: ${hasInsertVariant ? 'SÍ (Estático)' : 'NO (Universal/Desacoplado)'}`);
      
      // Buscar si tiene actualización dinámica de game_variant
      const hasDynamicVariant = /information_schema\.columns.*game_variant/i.test(fn.source_code);
      console.log(`¿Incluye sincronización dinámica de game_variant?: ${hasDynamicVariant ? 'SÍ' : 'NO'}`);

      // Buscar si anfitrión se inserta en seat 1
      const hasSeat1 = /seat_number[,\s]+1/i.test(fn.source_code) || /VALUES\s*\([^)]*,\s*1\s*,/i.test(fn.source_code);
      console.log(`¿Garantiza Seat 1 para el anfitrión?: ${hasSeat1 ? 'SÍ' : 'NO'}`);
    }

    // 4. Permisos de ejecución de la RPC
    console.log('\n--- 4. PERMISOS DE EJECUCIÓN (has_function_privilege) ---');
    const permRes = await client.query(`
      SELECT 
        has_function_privilege('authenticated', 'public.create_game_table_secure(text, varchar, table_visibility_enum, numeric, smallint, jsonb)', 'EXECUTE') as auth_can_execute,
        has_function_privilege('anon', 'public.create_game_table_secure(text, varchar, table_visibility_enum, numeric, smallint, jsonb)', 'EXECUTE') as anon_can_execute,
        has_function_privilege('service_role', 'public.create_game_table_secure(text, varchar, table_visibility_enum, numeric, smallint, jsonb)', 'EXECUTE') as service_can_execute;
    `);
    console.table(permRes.rows);

    // 5. Estado de RLS en game_tables y game_table_players
    console.log('\n--- 5. ESTADO DE RLS ---');
    const rlsRes = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname IN ('game_tables', 'game_table_players', 'wallets', 'ledger_entries')
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
    `);
    console.table(rlsRes.rows);

    // 6. Verificar tablas de historial de migraciones de Supabase (si existen)
    console.log('\n--- 6. HISTORIAL DE MIGRACIONES EN SUPABASE ---');
    try {
      const migRes = await client.query(`
        SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;
      `);
      console.table(migRes.rows);
    } catch (e: any) {
      console.log('Tabla supabase_migrations.schema_migrations no consultable o no utilizada:', e.message);
    }

  } catch (err: any) {
    console.error('Error durante la auditoría:', err.message);
  } finally {
    await client.end();
  }
}

auditDatabase();
