import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';

const { Client } = pg;
let connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();
if (!connectionString) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const match = envContent.match(/(?:DATABASE_URL|SUPABASE_DB_URL)=["']?([^"'\r\n]+)["']?/);
  if (match) connectionString = match[1].trim();
}
connectionString = connectionString.replace(/:\/\/([^:]+):\[([^\]]+)\]@/, '://$1:$2@');

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;');

  console.log('--- ENTRADAS DE FRANCISCO MORALES POST-RESET (>= 2026-09-04) ---');
  const rows = (await client.query(`
    SELECT id, entry_type, direction, amount, balance_after, balance_after_available, balance_after_held, description, created_at
    FROM public.ledger_entries
    WHERE user_id = 'b733db64-4912-4a33-8d7a-4ee332c7b5f1'
      AND created_at >= '2026-09-04T04:36:00.000Z'
    ORDER BY created_at ASC
  `)).rows;
  console.table(rows);

  console.log('\n--- ENTRADAS DE PULSO PLAY POST-RESET (>= 2026-09-04) ---');
  const pRows = (await client.query(`
    SELECT id, entry_type, direction, amount, balance_after, balance_after_available, balance_after_held, description, created_at
    FROM public.ledger_entries
    WHERE user_id = '42b24c41-83a5-4c68-ab8c-7dd09f1a5217'
      AND created_at >= '2026-09-04T04:36:00.000Z'
    ORDER BY created_at ASC
  `)).rows;
  console.table(pRows);

  console.log('\n--- ENTRADAS INMEDIATAMENTE ANTES DEL RESET PARA FRANCISCO ---');
  const preReset = (await client.query(`
    SELECT id, entry_type, direction, amount, balance_after, balance_after_available, balance_after_held, description, created_at
    FROM public.ledger_entries
    WHERE user_id = 'b733db64-4912-4a33-8d7a-4ee332c7b5f1'
      AND created_at <= '2026-09-04T04:37:00.000Z'
    ORDER BY created_at DESC
    LIMIT 5
  `)).rows;
  console.table(preReset);

  await client.end();
}

run();
