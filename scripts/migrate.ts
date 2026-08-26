import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

const connectionString = 'postgresql://postgres:RZjWAMks4Qot139t@db.tncxgwycinbnkjbfwojt.supabase.co:5432/postgres';

async function runMigrations() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('Conectando a la base de datos Supabase PostgreSQL...');
    await client.connect();
    console.log('Conexión exitosa.');

    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    console.log(`Encontradas ${files.length} migraciones.`);

    for (const file of files) {
      console.log(`\n========================================`);
      console.log(`Ejecutando migración: ${file}`);
      console.log(`========================================`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query(sql);
        console.log(`✓ ${file} completado exitosamente.`);
      } catch (err: any) {
        console.error(`✗ Error ejecutando ${file}:`, err.message);
        // Continuamos para ver si son tablas ya existentes o dependencias
      }
    }

    console.log('\n========================================');
    console.log('Todas las migraciones fueron procesadas.');
    console.log('========================================');
  } catch (err) {
    console.error('Error fatal durante la migración:', err);
  } finally {
    await client.end();
  }
}

runMigrations();
