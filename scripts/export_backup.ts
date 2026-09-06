import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

let connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim().replace(/:\/\/([^:]+):\[([^\]]+)\]@/, '://$1:$2@');

async function runBackup() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;');
    console.log('--- INICIANDO EXPORTACIÓN / BACKUP DE SEGURIDAD (READ-ONLY) ---');

    const backupDir = path.join(process.cwd(), 'backups', `pre_purge_${Date.now()}`);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const tablesToBackup = [
      'auth_users',
      'profiles',
      'user_roles',
      'wallets',
      'ledger_entries',
      'payment_accounts',
      'deposit_requests',
      'withdrawal_requests',
      'game_tables',
      'game_table_players',
      'game_sessions',
      'game_session_secrets',
      'game_actions',
      'game_settlements',
      'game_settlement_recipients',
      'bingo_card_purchases',
      'bingo_winner_history',
      'polla_tickets',
      'polla_draw_results',
      'polla_block_closures',
      'audit_logs',
      'protected_super_admins',
      'system_settings',
      'game_configurations',
      'entry_fees',
      'financial_rules',
      'advertising_assets',
      'advertising_campaigns',
      'faq_items',
      'tournaments',
      'storage_objects'
    ];

    const manifest: any = {
      timestamp: new Date().toISOString(),
      backupDir,
      tables: {}
    };

    for (const tbl of tablesToBackup) {
      let rows: any[] = [];
      if (tbl === 'auth_users') {
        const res = await client.query('SELECT id, email, created_at, last_sign_in_at, raw_user_meta_data FROM auth.users');
        rows = res.rows;
      } else if (tbl === 'storage_objects') {
        const res = await client.query('SELECT id, bucket_id, name, owner, created_at, metadata FROM storage.objects');
        rows = res.rows;
      } else {
        try {
          const res = await client.query(`SELECT * FROM public.${tbl}`);
          rows = res.rows;
        } catch (e: any) {
          console.warn(`Tabla no encontrada o error en ${tbl}:`, e.message);
          continue;
        }
      }

      fs.writeFileSync(path.join(backupDir, `${tbl}.json`), JSON.stringify(rows, null, 2), 'utf8');
      manifest.tables[tbl] = { count: rows.length, file: `${tbl}.json` };
      console.log(`✓ Exportada tabla ${tbl}: ${rows.length} registros`);
    }

    fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`\n=== BACKUP / EXPORTACIÓN COMPLETADA EXITOSAMENTE EN: ${backupDir} ===`);
  } catch (err) {
    console.error('Error durante exportación:', err);
  } finally {
    await client.end();
  }
}

runBackup();
