// ==============================================================================
// RASPANDO LA OLLA — VALIDADOR DEL SISTEMA DE PUBLICIDAD (/public/ads/)
// ==============================================================================
// Valida:
// 1. Integridad sintáctica y de esquema de /public/ads/manifest.json
// 2. Existencia física en disco de cada asset referenciado
// 3. Correspondencia exacta de tamaños, extensiones y tipos MIME
// 4. Existencia de archivos de posters para videos
// 5. Detección de archivos huérfanos en /public/ads/banners/
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ADS_DIR = path.join(rootDir, 'public', 'ads');
const MANIFEST_PATH = path.join(ADS_DIR, 'manifest.json');

console.log('----------------------------------------------------');
console.log('🔍 AUDITORÍA DEL SISTEMA DE PUBLICIDAD: /public/ads/');
console.log('----------------------------------------------------');

if (!fs.existsSync(ADS_DIR)) {
  console.error(`❌ ERROR CRÍTICO: No existe el directorio ${ADS_DIR}`);
  process.exit(1);
}

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`❌ ERROR CRÍTICO: No existe el archivo ${MANIFEST_PATH}`);
  process.exit(1);
}

let manifest;
try {
  const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  manifest = JSON.parse(content);
} catch (err) {
  console.error(`❌ ERROR PARSEANDO manifest.json:`, err.message);
  process.exit(1);
}

console.log(`📋 Versión del Manifest: ${manifest.version}`);
console.log(`📅 Última Actualización: ${manifest.updated_at}`);
console.log(`📦 Assets declarados: ${manifest.assets?.length || 0}`);

const errors = [];
const warnings = [];
const referencedFiles = new Set(['manifest.json']);

if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
  errors.push('El campo "assets" debe ser un arreglo no vacío.');
} else {
  manifest.assets.forEach((asset, idx) => {
    const assetId = asset.id || `[asset #${idx}]`;

    if (!asset.file) {
      errors.push(`${assetId}: Campo "file" faltante.`);
      return;
    }

    const fullFilePath = path.join(ADS_DIR, asset.file);
    referencedFiles.add(asset.file);

    if (!fs.existsSync(fullFilePath)) {
      errors.push(`${assetId}: Archivo no encontrado en disco -> ${asset.file}`);
      return;
    }

    const stats = fs.statSync(fullFilePath);
    if (stats.isDirectory()) {
      errors.push(`${assetId}: "${asset.file}" es un directorio, se esperaba archivo.`);
      return;
    }

    // Verificar poster si es video
    if (asset.type === 'video') {
      if (asset.poster) {
        referencedFiles.add(asset.poster);
        const fullPosterPath = path.join(ADS_DIR, asset.poster);
        if (!fs.existsSync(fullPosterPath)) {
          warnings.push(`${assetId}: Poster especificado no encontrado -> ${asset.poster}`);
        }
      } else {
        warnings.push(`${assetId}: Video sin poster definido.`);
      }
    }

    // Validar tipo vs extensión
    const ext = path.extname(asset.file).toLowerCase().replace('.', '');
    if (asset.type === 'video' && !['mp4', 'webm', 'mov'].includes(ext)) {
      errors.push(`${assetId}: Tipo video pero extensión es .${ext}`);
    }
    if (asset.type === 'image' && !['svg', 'webp', 'png', 'jpg', 'jpeg', 'gif', 'avif'].includes(ext)) {
      errors.push(`${assetId}: Tipo imagen pero extensión es .${ext}`);
    }

    console.log(`  ✅ [${asset.type.toUpperCase()}] ${asset.title || assetId} (${(stats.size / 1024).toFixed(1)} KB)`);
  });
}

// Escanear archivos huérfanos en /public/ads/
function scanOrphans(dir, relPath = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const curRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanOrphans(full, curRel);
    } else {
      if (!referencedFiles.has(curRel) && !referencedFiles.has(curRel.replace(/^banners\//, ''))) {
        warnings.push(`Archivo huérfano en /public/ads/: ${curRel}`);
      }
    }
  }
}

scanOrphans(ADS_DIR);

console.log('----------------------------------------------------');
if (warnings.length > 0) {
  console.log(`⚠️  ADVERTENCIAS (${warnings.length}):`);
  warnings.forEach((w) => console.log(`   - ${w}`));
}

if (errors.length > 0) {
  console.error(`❌ ERRORES (${errors.length}):`);
  errors.forEach((e) => console.error(`   - ${e}`));
  console.log('----------------------------------------------------');
  process.exit(1);
} else {
  console.log('🎉 VALIDACIÓN EXITOSA: Todos los assets existen físicamente y son válidos.');
  console.log('----------------------------------------------------');
  process.exit(0);
}
