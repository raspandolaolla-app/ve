import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

let connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();

if (!connectionString) {
  console.error('Error: DATABASE_URL o SUPABASE_DB_URL no está configurada.');
  process.exit(1);
}

connectionString = connectionString.replace(/:\/\/([^:]+):\[([^\]]+)\]@/, '://$1:$2@');

async function runPreflight() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    // Forzar estrictamente sesión de solo lectura
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;');
    console.log('--- CONEXIÓN ESTABLECIDA EN MODO ESTRICTO READ-ONLY ---');

    const report: any = {};

    // 1. AUDITAR SUPER ADMINS PROTEGIDOS
    const superAdminsTarget = [
      { uuid: 'b733db64-4912-4a33-8d7a-4ee332c7b5f1', email: 'v19629049@gmail.com', name: 'FRANCISCO MORALES' },
      { uuid: '42b24c41-83a5-4c68-ab8c-7dd09f1a5217', email: 'pulsoplay2026@gmail.com', name: 'pulso play' }
    ];

    const protectedAdminsRows = (await client.query('SELECT * FROM public.protected_super_admins')).rows;
    report.protectedAdminsRaw = protectedAdminsRows;

    const superAdminsCheck = [];
    for (const sa of superAdminsTarget) {
      const authUser = (await client.query('SELECT id, email, created_at FROM auth.users WHERE id = $1', [sa.uuid])).rows[0];
      const profile = (await client.query('SELECT * FROM public.profiles WHERE id = $1 OR user_id = $1', [sa.uuid])).rows[0];
      const roles = (await client.query('SELECT user_id, role FROM public.user_roles WHERE user_id = $1', [sa.uuid])).rows;
      const protectedAdmin = protectedAdminsRows.find(p => p.email === sa.email || p.id === sa.uuid);
      const twoFa = (await client.query('SELECT user_id, is_active FROM public.user_2fa_secrets WHERE user_id = $1', [sa.uuid])).rows[0];
      const wallet = (await client.query('SELECT user_id, balance, available_balance, held_balance, currency FROM public.wallets WHERE user_id = $1', [sa.uuid])).rows[0];

      superAdminsCheck.push({
        target: sa,
        inAuth: !!authUser,
        authCreatedAt: authUser?.created_at,
        inProfiles: !!profile,
        profileDisplayName: profile?.display_name || profile?.nombre_real,
        inUserRoles: roles.map(r => r.role),
        inProtectedAdmins: !!protectedAdmin,
        protectedAdminRecord: protectedAdmin,
        in2FA: !!twoFa,
        twoFaActive: twoFa?.is_active,
        wallet: wallet ? {
          balance: Number(wallet.balance),
          available: Number(wallet.available_balance),
          held: Number(wallet.held_balance),
          currency: wallet.currency
        } : null
      });
    }
    report.superAdminsCheck = superAdminsCheck;

    // Verificar funciones de protección
    const protectionFunctions = [
      'is_protected_super_admin_email',
      'is_protected_super_admin_user',
      'is_super_admin',
      'is_admin'
    ];
    const funcsFound = (await client.query(
      `SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = ANY($1)`,
      [protectionFunctions]
    )).rows.map(r => r.routine_name);
    report.protectionFunctions = {
      expected: protectionFunctions,
      found: funcsFound,
      allPresent: protectionFunctions.every(f => funcsFound.includes(f))
    };

    // Verificar triggers de protección
    const protectionTriggers = [
      'trg_protected_super_admins_guard',
      'trg_user_roles_protection_guard',
      'trg_profiles_protection_guard'
    ];
    const triggersFound = (await client.query(
      `SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_name = ANY($1)`,
      [protectionTriggers]
    )).rows;
    report.protectionTriggers = {
      expected: protectionTriggers,
      found: triggersFound
    };

    // 2. CONSTRUIR MAPA DE IDENTIDAD COMPLETO (TODOS LOS USUARIOS)
    const authUsers = (await client.query('SELECT id, email, created_at, raw_user_meta_data FROM auth.users ORDER BY created_at ASC')).rows;
    const profiles = (await client.query('SELECT id, user_id, first_name, last_name, display_name, email, nombre_real, telefono, created_at FROM public.profiles')).rows;
    const userRoles = (await client.query('SELECT user_id, role, granted_at FROM public.user_roles')).rows;
    const wallets = (await client.query('SELECT user_id, balance, available_balance, held_balance, currency, updated_at FROM public.wallets')).rows;

    const allUserIds = new Set<string>();
    authUsers.forEach(u => allUserIds.add(u.id));
    profiles.forEach(p => allUserIds.add(p.id || p.user_id));
    userRoles.forEach(r => allUserIds.add(r.user_id));
    wallets.forEach(w => allUserIds.add(w.user_id));

    const identityMatrix: any[] = [];
    let testCount = 0;
    let protectedCount = 0;
    let realCount = 0;
    let ambiguousCount = 0;
    let orphansCount = 0;

    for (const uid of allUserIds) {
      const a = authUsers.find(u => u.id === uid);
      const p = profiles.find(pr => pr.id === uid || pr.user_id === uid);
      const r = userRoles.filter(ro => ro.user_id === uid).map(ro => ro.role);
      const w = wallets.find(wa => wa.user_id === uid);
      const isProt = protectedAdminsRows.some(pa => pa.email === a?.email || pa.email === p?.email || pa.id === uid);

      if (!a || !p) {
        orphansCount++;
      }

      // Recuento de datos asociados
      const gameTablesCount = (await client.query('SELECT count(*) FROM public.game_tables WHERE host_user_id = $1', [uid])).rows[0].count;
      const gamePlayersCount = (await client.query('SELECT count(*) FROM public.game_table_players WHERE user_id = $1', [uid])).rows[0].count;
      const ledgerCount = (await client.query('SELECT count(*) FROM public.ledger_entries WHERE user_id = $1', [uid])).rows[0].count;
      const bingoCount = (await client.query('SELECT count(*) FROM public.bingo_card_purchases WHERE user_id = $1', [uid])).rows[0].count;
      const pollaCount = (await client.query('SELECT count(*) FROM public.polla_tickets WHERE user_id = $1', [uid])).rows[0].count;
      const depositsCount = (await client.query('SELECT count(*) FROM public.deposit_requests WHERE user_id = $1', [uid])).rows[0].count;

      let classification = 'X — AMBIGUOUS';
      let action = 'MANUAL REVIEW REQUIRED';

      const emailStr = (a?.email || p?.email || '').toLowerCase();
      const nameStr = (p?.display_name || p?.nombre_real || p?.first_name || '').toLowerCase();

      if (isProt || superAdminsTarget.some(sa => sa.uuid === uid || sa.email === emailStr)) {
        classification = 'A — PROTECTED ADMIN';
        action = 'CONSERVAR (PRESERVED)';
        protectedCount++;
      } else if (
        emailStr.includes('test') ||
        emailStr.includes('demo') ||
        emailStr.includes('bot') ||
        emailStr.includes('prueba') ||
        emailStr.includes('fake') ||
        emailStr.includes('jugador') ||
        emailStr.includes('player') ||
        nameStr.includes('test') ||
        nameStr.includes('demo') ||
        nameStr.includes('prueba') ||
        nameStr.includes('bot') ||
        nameStr.includes('simón') ||
        nameStr.includes('luisa')
      ) {
        classification = 'D — TEST / DEVELOPMENT USER';
        action = 'CANDIDATO A PURGA';
        testCount++;
      } else {
        // Analizar si los datos son de prueba o reales
        // Revisar metadatos
        if (emailStr.endsWith('@example.com') || emailStr.endsWith('@test.com') || emailStr.endsWith('@mailinator.com')) {
          classification = 'D — TEST / DEVELOPMENT USER';
          action = 'CANDIDATO A PURGA';
          testCount++;
        } else {
          // Si no es obvio, marcar ambiguo o real
          classification = 'X — AMBIGUOUS';
          action = 'MANUAL REVIEW REQUIRED';
          ambiguousCount++;
        }
      }

      identityMatrix.push({
        uuid: uid,
        email: a?.email || p?.email || 'N/A',
        name: p?.display_name || p?.nombre_real || (p?.first_name ? `${p.first_name} ${p.last_name || ''}` : 'N/A'),
        auth: !!a,
        profile: !!p,
        roles: r,
        wallet: w ? Number(w.balance) : null,
        protected: isProt,
        relatedData: {
          tables: Number(gameTablesCount),
          playerEntries: Number(gamePlayersCount),
          ledger: Number(ledgerCount),
          bingo: Number(bingoCount),
          polla: Number(pollaCount),
          deposits: Number(depositsCount)
        },
        classification,
        action
      });
    }
    report.identityMatrix = identityMatrix;
    report.identitySummary = {
      totalAuthUsers: authUsers.length,
      totalProfiles: profiles.length,
      totalUserRoles: userRoles.length,
      totalWallets: wallets.length,
      totalSuperAdmins: protectedCount,
      totalAdmins: identityMatrix.filter(u => u.roles.includes('ADMIN') && !u.protected).length,
      totalOperadores: identityMatrix.filter(u => u.roles.includes('OPERATOR')).length,
      totalUsuariosDePrueba: testCount,
      totalUsuariosAmbiguos: ambiguousCount,
      totalHuerfanos: orphansCount
    };

    // 3. AUDITAR PAYMENT_ACCOUNTS
    const paymentAccounts = (await client.query('SELECT * FROM public.payment_accounts')).rows;
    const paymentAccountsAudit = [];
    for (const pa of paymentAccounts) {
      const referencedInDeposits = (await client.query(
        'SELECT count(*) FROM public.deposit_requests WHERE destination_account_id = $1',
        [pa.id]
      )).rows[0].count;

      const owner = identityMatrix.find(u => u.uuid === pa.user_id);
      let paClassification = 'AMBIGUOUS';
      if (owner?.classification === 'A — PROTECTED ADMIN') {
        paClassification = 'PRODUCTION_OPERATIONAL';
      } else if (owner?.classification === 'D — TEST / DEVELOPMENT USER' || pa.bank_name?.toLowerCase().includes('test')) {
        paClassification = 'TEST';
      }

      paymentAccountsAudit.push({
        id: pa.id,
        user_id: pa.user_id,
        ownerEmail: owner?.email || 'DESCONOCIDO',
        ownerClassification: owner?.classification || 'N/A',
        bank_code: pa.bank_code,
        bank_name: pa.bank_name,
        phone_number: pa.phone_number,
        id_number_masked: pa.id_number_masked,
        is_active: pa.is_active,
        is_default: pa.is_default,
        created_at: pa.created_at,
        depositReferences: Number(referencedInDeposits),
        classification: paClassification
      });
    }
    report.paymentAccountsAudit = paymentAccountsAudit;

    // 4. AUDITAR AUDIT_LOGS
    let auditLogsCount = 0;
    let auditLogsDetails: any[] = [];
    try {
      auditLogsCount = Number((await client.query('SELECT count(*) FROM public.audit_logs')).rows[0].count);
      auditLogsDetails = (await client.query(
        `SELECT id, actor_id, actor_role, action, resource_type, resource_id, severity, created_at, metadata FROM public.audit_logs ORDER BY created_at DESC LIMIT 50`
      )).rows;
    } catch (e: any) {
      console.log('audit_logs note:', e.message);
    }

    const auditLogsClassification = {
      TEST: 0,
      SECURITY: 0,
      ADMINISTRATIVE: 0,
      FINANCIAL: 0,
      OPERATIONAL: 0,
      AMBIGUOUS: 0
    };

    for (const log of auditLogsDetails) {
      const act = (log.action || '').toUpperCase();
      const res = (log.resource_type || '').toUpperCase();
      if (act.includes('LOGIN') || act.includes('2FA') || act.includes('AUTH') || res.includes('SECURITY')) {
        auditLogsClassification.SECURITY++;
      } else if (act.includes('ADMIN') || res.includes('SETTINGS') || res.includes('CONFIG') || res.includes('ROLE')) {
        auditLogsClassification.ADMINISTRATIVE++;
      } else if (act.includes('PAYMENT') || act.includes('DEPOSIT') || act.includes('WALLET') || act.includes('LEDGER')) {
        auditLogsClassification.FINANCIAL++;
      } else if (act.includes('GAME') || act.includes('TABLE') || act.includes('ROUND')) {
        auditLogsClassification.OPERATIONAL++;
      } else if (act.includes('TEST')) {
        auditLogsClassification.TEST++;
      } else {
        auditLogsClassification.AMBIGUOUS++;
      }
    }
    report.auditLogs = {
      total: auditLogsCount,
      recentSampleCount: auditLogsDetails.length,
      sampleClassification: auditLogsClassification
    };

    // 5. AUDITAR WALLETS
    const walletsAudit = [];
    for (const w of wallets) {
      const entriesCount = Number((await client.query('SELECT count(*) FROM public.ledger_entries WHERE user_id = $1', [w.user_id])).rows[0].count);
      const isSuperAdmin = superAdminsTarget.some(sa => sa.uuid === w.user_id);
      const owner = identityMatrix.find(u => u.uuid === w.user_id);

      // Desglose del ledger
      const ledgerBreakdown = (await client.query(
        `SELECT entry_type, count(*) as qty, sum(amount) as total FROM public.ledger_entries WHERE user_id = $1 GROUP BY entry_type`,
        [w.user_id]
      )).rows;

      walletsAudit.push({
        user_id: w.user_id,
        ownerEmail: owner?.email || 'N/A',
        ownerClassification: owner?.classification || 'N/A',
        balance: Number(w.balance),
        available: Number(w.available_balance),
        held: Number(w.held_balance),
        currency: w.currency,
        entriesCount,
        isSuperAdmin,
        updated_at: w.updated_at,
        ledgerBreakdown
      });
    }
    report.walletsAudit = walletsAudit;

    // 6. AUDITAR STORAGE
    let storageBuckets: any[] = [];
    let storageObjects: any[] = [];
    try {
      storageBuckets = (await client.query('SELECT id, name, public, created_at FROM storage.buckets')).rows;
      storageObjects = (await client.query('SELECT id, bucket_id, name, owner, created_at, metadata FROM storage.objects ORDER BY created_at ASC')).rows;
    } catch (e: any) {
      console.log('Storage query note:', e.message);
    }

    const storageAudit = [];
    for (const obj of storageObjects) {
      const owner = identityMatrix.find(u => u.uuid === obj.owner);
      let classification = 'AMBIGUOUS';
      if (owner?.classification === 'A — PROTECTED ADMIN') {
        classification = 'PRODUCTION';
      } else if (owner?.classification === 'D — TEST / DEVELOPMENT USER' || obj.name.includes('test')) {
        classification = 'TEST';
      }
      storageAudit.push({
        id: obj.id,
        bucket_id: obj.bucket_id,
        name: obj.name,
        owner: obj.owner,
        ownerEmail: owner?.email || 'N/A',
        classification,
        created_at: obj.created_at
      });
    }

    report.storage = {
      buckets: storageBuckets,
      objects: storageAudit
    };

    // 7. AUDITAR FOREIGN KEYS
    const foreignKeys = (await client.query(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `)).rows;
    report.foreignKeys = foreignKeys;

    // 8. AUDITAR TRIGGERS
    const allTriggers = (await client.query(`
      SELECT
        trigger_name,
        event_object_table,
        action_timing,
        event_manipulation,
        action_statement
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name;
    `)).rows;
    report.triggers = allTriggers;

    // 9. AUDITAR CATÁLOGOS E INFRAESTRUCTURA
    const catalogs = [
      'system_settings',
      'protected_super_admins',
      'game_configurations',
      'entry_fees',
      'financial_rules',
      'advertising_assets',
      'advertising_campaigns',
      'faq_items',
      'system_announcements',
      'tournaments'
    ];
    const catalogsStatus: any = {};
    for (const cat of catalogs) {
      try {
        const count = Number((await client.query(`SELECT count(*) FROM public.${cat}`)).rows[0].count);
        catalogsStatus[cat] = { present: true, count };
      } catch (e: any) {
        catalogsStatus[cat] = { present: false, error: e.message };
      }
    }
    report.catalogsStatus = catalogsStatus;

    // 10. RECUENTO OPERATIVO POR TABLA
    const operationalTables = [
      'game_actions',
      'game_session_secrets',
      'game_sessions',
      'game_settlement_recipients',
      'game_settlements',
      'game_table_players',
      'game_tables',
      'bingo_card_purchases',
      'bingo_winner_history',
      'polla_tickets',
      'polla_draw_results',
      'polla_block_closures',
      'deposit_requests',
      'withdrawal_requests',
      'payment_accounts',
      'ledger_entries',
      'notifications',
      'support_tickets',
      'chat_messages',
      'kyc_verifications',
      'user_activity_sessions',
      'tournament_registrations',
      'draw_audit_trail',
      'rng_events',
      'audit_logs'
    ];
    const operationalCounts: any = {};
    for (const tbl of operationalTables) {
      try {
        const count = Number((await client.query(`SELECT count(*) FROM public.${tbl}`)).rows[0].count);
        operationalCounts[tbl] = count;
      } catch (e: any) {
        operationalCounts[tbl] = `NOT_FOUND: ${e.message}`;
      }
    }
    report.operationalCounts = operationalCounts;

    fs.writeFileSync(
      path.join(process.cwd(), 'scripts', 'preflight_report.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );

    console.log('--- PREFLIGHT COMPLETADO CON ÉXITO (READ-ONLY) ---');
    console.log('Reporte guardado en scripts/preflight_report.json');
  } catch (err) {
    console.error('Error durante preflight:', err);
  } finally {
    await client.end();
  }
}

runPreflight();
