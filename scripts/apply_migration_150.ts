import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

let connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
connectionString = connectionString.replace(/:\/\/([^:]+):\[([^\]]+)\]@/, '://\$1:\$2@');

async function applyMigration150() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Conectado a Supabase PostgreSQL para aplicar Migración 150...');

    const migrationFile = path.join(process.cwd(), 'supabase', 'migrations', '150_fix_account_status_and_game_type_enums_in_create_table.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('Aplicando migración 150...');
    await client.query(sql);
    console.log('✓ Migración 150 APLICADA EXITOSAMENTE.');
  } catch (err: any) {
    console.error('Error aplicando migración 150:', err.message);
  } finally {
    await client.end();
  }
}

applyMigration150();
