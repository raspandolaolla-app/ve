#!/usr/bin/env tsx
/**
 * ==============================================================================
 * 🔒 SISTEMA DE JUEGOS PROTEGIDOS / MÓDULOS CERTIFICADOS - GUARD & CLI
 * RASPANDO LA OLLA 🇻🇪 / PulsoPLAY
 * ==============================================================================
 *
 * Utilidad autoritativa de inspección de dependencias, auditoría de regresión,
 * gobernanza de bloqueos y prevención de modificaciones ilegales en módulos certificados.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export type GameStatus = 'ACTIVE' | 'CAUTION' | 'STABLE' | 'LOCKED' | 'HARD_LOCKED' | 'UNDER_REPAIR';

export interface ProtectedGame {
  id: string;
  name: string;
  status: GameStatus;
  version: string;
  protected_at: string;
  protected_commit: string;
  protected_by: string;
  unlocked_at?: string;
  unlocked_by?: string;
  unlock_reason?: string;
  protected_paths: string[];
  protected_dependencies: string[];
  protected_components: string[];
  protected_services: string[];
  protected_hooks: string[];
  protected_engines: string[];
  protected_repositories: string[];
  protected_types: string[];
  protected_tests: string[];
  protected_database_objects: string[];
  protected_rpc: string[];
  protected_tables: string[];
  protected_migrations: string[];
  shared_dependencies: string[];
}

export interface SharedInfrastructure {
  id: string;
  path: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'MAXIMUM';
  description: string;
}

export interface ProtectedConfig {
  $schema?: string;
  title: string;
  version: string;
  description: string;
  updated_at: string;
  default_policy: string;
  allowed_states: GameStatus[];
  shared_infrastructure: SharedInfrastructure[];
  games: ProtectedGame[];
}

const ROOT_DIR = process.cwd();
const CONFIG_JSON_PATH = path.join(ROOT_DIR, '.github', 'protected-games.json');
const CONFIG_YML_PATH = path.join(ROOT_DIR, '.github', 'protected-games.yml');
const REPORT_MD_PATH = path.join(ROOT_DIR, 'docs', 'PROTECTED_GAMES_REPORT.md');

// Alias normalizer for human commands (Spanish and English)
export function normalizeGameId(input: string): string {
  const clean = input.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const map: Record<string, string> = {
    ajedrez: 'chess',
    chess: 'chess',
    domino: 'domino',
    domino_venezolano: 'domino',
    truco: 'truco',
    truco_venezolano: 'truco',
    bingo: 'bingo',
    polla: 'polla',
    polla_venezolana: 'polla',
    atrapaito: 'atrapaito',
    atrapaito_criollo: 'atrapaito',
    parchis: 'atrapaito',
    damas: 'checkers',
    damas_venezolanas: 'checkers',
    checkers: 'checkers',
    piedra_papel_tijera: 'rock_paper_scissors',
    piedra_papel_o_tijera: 'rock_paper_scissors',
    rock_paper_scissors: 'rock_paper_scissors',
    rps: 'rock_paper_scissors',
    la_vieja: 'tic_tac_toe',
    vieja: 'tic_tac_toe',
    tres_en_raya: 'tic_tac_toe',
    '3_en_raya': 'tic_tac_toe',
    tic_tac_toe: 'tic_tac_toe',
    tictactoe: 'tic_tac_toe',
    una_olla: 'una_olla',
    uno_olla: 'una_olla',
    unaolla: 'una_olla'
  };

  return map[clean] || clean;
}

export function loadConfig(): ProtectedConfig {
  if (!fs.existsSync(CONFIG_JSON_PATH)) {
    throw new Error(`[ERROR] Archivo de configuración protegido no encontrado: ${CONFIG_JSON_PATH}`);
  }
  const raw = fs.readFileSync(CONFIG_JSON_PATH, 'utf8');
  return JSON.parse(raw);
}

export function saveConfig(config: ProtectedConfig): void {
  config.updated_at = new Date().toISOString();
  fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');

  // Also regenerate canonical YAML
  const ymlLines: string[] = [
    '# ============================================================================== #',
    '# 🔒 REGISTRO CENTRAL DE JUEGOS PROTEGIDOS / MÓDULOS CERTIFICADOS                #',
    '# PROYECTO: RASPANDO LA OLLA 🇻🇪 / PulsoPLAY                                     #',
    '# REPOSITORIO: https://github.com/raspandolaolla-app/ve                          #',
    '# RAMA: main                                                                     #',
    '# ============================================================================== #',
    '',
    `version: "${config.version}"`,
    `updated_at: "${config.updated_at}"`,
    `default_policy: ${config.default_policy}`,
    '',
    'allowed_states:',
    ...config.allowed_states.map(s => `  - ${s}`),
    '',
    'shared_infrastructure:'
  ];

  for (const infra of config.shared_infrastructure) {
    ymlLines.push(`  - id: ${infra.id}`);
    ymlLines.push(`    path: ${infra.path}`);
    ymlLines.push(`    risk_level: ${infra.risk_level}`);
    ymlLines.push(`    description: ${infra.description}`);
  }

  ymlLines.push('', 'games:');
  for (const g of config.games) {
    ymlLines.push(`  - id: ${g.id}`);
    ymlLines.push(`    name: "${g.name}"`);
    ymlLines.push(`    status: ${g.status}`);
    ymlLines.push(`    version: "${g.version}"`);
    ymlLines.push(`    protected_at: "${g.protected_at}"`);
    ymlLines.push(`    protected_commit: "${g.protected_commit}"`);
    ymlLines.push(`    protected_by: "${g.protected_by}"`);
    if (g.unlocked_at) ymlLines.push(`    unlocked_at: "${g.unlocked_at}"`);
    if (g.unlocked_by) ymlLines.push(`    unlocked_by: "${g.unlocked_by}"`);
    if (g.unlock_reason) ymlLines.push(`    unlock_reason: "${g.unlock_reason}"`);

    const addList = (key: string, list: string[]) => {
      ymlLines.push(`    ${key}:`);
      for (const item of list) {
        ymlLines.push(`      - ${item}`);
      }
    };

    addList('protected_paths', g.protected_paths);
    addList('protected_dependencies', g.protected_dependencies);
    addList('protected_components', g.protected_components);
    addList('protected_services', g.protected_services);
    addList('protected_hooks', g.protected_hooks);
    addList('protected_engines', g.protected_engines);
    addList('protected_repositories', g.protected_repositories);
    addList('protected_types', g.protected_types);
    addList('protected_tests', g.protected_tests);
    addList('protected_database_objects', g.protected_database_objects);
    addList('protected_rpc', g.protected_rpc);
    addList('protected_tables', g.protected_tables);
    addList('protected_migrations', g.protected_migrations);
    addList('shared_dependencies', g.shared_dependencies);
    ymlLines.push('');
  }

  fs.writeFileSync(CONFIG_YML_PATH, ymlLines.join('\n') + '\n', 'utf8');
}

/**
 * Gets modified/deleted/renamed files in Git (or empty list if no git)
 */
function getGitChangedFiles(): { modified: string[]; deleted: string[]; untracked: string[] } {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const lines = status.split('\n').filter(Boolean);
    const modified: string[] = [];
    const deleted: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      const code = line.slice(0, 2);
      const filePath = line.slice(3).trim();
      if (code.includes('D')) {
        deleted.push(filePath);
      } else if (code.includes('?') || code.includes('A')) {
        untracked.push(filePath);
      } else {
        modified.push(filePath);
      }
    }
    return { modified, deleted, untracked };
  } catch {
    return { modified: [], deleted: [], untracked: [] };
  }
}

/**
 * Command: AUDIT
 */
export function runAudit(): { success: boolean; errors: string[] } {
  const config = loadConfig();
  console.log('\n🔒 PROTECTION AUDIT');
  console.log('============================================================');

  const errors: string[] = [];
  let protectedFilesChanged = 0;
  let protectedDepsChanged = 0;
  let protectedTestsChanged = 0;

  const gitChanges = getGitChangedFiles();
  const allChanged = [...gitChanges.modified, ...gitChanges.deleted];

  // Audit each game
  for (const game of config.games) {
    let gamePass = true;
    const gameErrors: string[] = [];

    // 1. Verify existence of exclusive protected paths
    for (const relPath of game.protected_paths) {
      const fullPath = path.join(ROOT_DIR, relPath);
      if (!fs.existsSync(fullPath)) {
        gamePass = false;
        gameErrors.push(`[ARCHIVO INEXISTENTE O ELIMINADO] ${relPath}`);
      }
    }

    // 2. Verify existence of protected engines
    for (const enginePath of game.protected_engines) {
      const fullPath = path.join(ROOT_DIR, enginePath);
      if (!fs.existsSync(fullPath)) {
        gamePass = false;
        gameErrors.push(`[MOTOR ELIMINADO] ${enginePath}`);
      }
    }

    // 3. Verify tests
    for (const testPath of game.protected_tests) {
      const fullPath = path.join(ROOT_DIR, testPath);
      if (!fs.existsSync(fullPath)) {
        gamePass = false;
        gameErrors.push(`[TEST ELIMINADO] ${testPath}`);
      }
    }

    // 4. Verify migrations
    for (const migPath of game.protected_migrations) {
      const fullPath = path.join(ROOT_DIR, migPath);
      if (!fs.existsSync(fullPath)) {
        gamePass = false;
        gameErrors.push(`[MIGRACIÓN MODIFICADA O ELIMINADA] ${migPath}`);
      }
    }

    // 5. If game is LOCKED or HARD_LOCKED, check if git changes touched its exclusive files
    if (game.status === 'LOCKED' || game.status === 'HARD_LOCKED') {
      for (const changed of allChanged) {
        if (game.protected_paths.includes(changed)) {
          protectedFilesChanged++;
          gamePass = false;
          gameErrors.push(`[MODIFICACIÓN NO AUTORIZADA] ${changed} en juego ${game.status}`);
        }
        if (game.protected_tests.includes(changed)) {
          protectedTestsChanged++;
          gamePass = false;
          gameErrors.push(`[TEST MODIFICADO ILEGALMENTE] ${changed}`);
        }
      }
    }

    if (gamePass) {
      console.log(`  ${game.name.padEnd(30)}: [✓ PASS] (Estado: ${game.status})`);
    } else {
      console.log(`  ${game.name.padEnd(30)}: [✗ FAIL] (Estado: ${game.status})`);
      for (const err of gameErrors) {
        console.log(`    ⚠️  ${err}`);
        errors.push(`${game.name}: ${err}`);
      }
    }
  }

  // Check shared infrastructure
  console.log('------------------------------------------------------------');
  console.log('INFRAESTRUCTURA COMPARTIDA (SHARED DEPENDENCIES):');
  for (const infra of config.shared_infrastructure) {
    const fullPath = path.join(ROOT_DIR, infra.path);
    const exists = fs.existsSync(fullPath);
    if (!exists) {
      errors.push(`[INFRAESTRUCTURA COMPARTIDA FALTANTE] ${infra.path}`);
      console.log(`  ${infra.id.padEnd(25)} [✗ MISSING]`);
    } else {
      console.log(`  ${infra.id.padEnd(25)} [✓ OK] (Riesgo: ${infra.risk_level})`);
    }

    // If git touched shared infra, verify if dependent games are locked
    if (allChanged.includes(infra.path)) {
      protectedDepsChanged++;
      const lockedDependents = config.games.filter(g =>
        (g.status === 'LOCKED' || g.status === 'HARD_LOCKED') &&
        g.shared_dependencies.includes(infra.path)
      );

      if (lockedDependents.length > 0) {
        const lockedNames = lockedDependents.map(g => g.name).join(', ');
        errors.push(
          `[DEPENDENCIA COMPARTIDA MODIFICADA] ${infra.path} está siendo modificada pero afecta a juegos LOCKED: ${lockedNames}`
        );
      }
    }
  }

  console.log('============================================================');
  console.log(`Protected files changed: ${protectedFilesChanged}`);
  console.log(`Protected dependencies changed: ${protectedDepsChanged}`);
  console.log(`Protected tests changed: ${protectedTestsChanged}`);

  if (errors.length === 0) {
    console.log('\nSTATUS: SAFE\n');
    return { success: true, errors: [] };
  } else {
    console.log('\n🔒 CAMBIO BLOQUEADO');
    console.log('------------------------------------------------------------');
    for (const e of errors) {
      console.log(` ❌ ${e}`);
    }
    console.log('\nPara continuar se requiere:');
    console.log('  1. Solución aislada sin tocar archivos o dependencias protegidas.');
    console.log('  2. O desbloqueo explícito del juego protegido afectado (DESBLOQUEAR <JUEGO>).\n');
    return { success: false, errors };
  }
}

/**
 * Command: STATUS
 */
export function runStatus(): void {
  const config = loadConfig();
  console.log('\n🔒 ESTADO DE JUEGOS PROTEGIDOS / MÓDULOS CERTIFICADOS');
  console.log('========================================================================================');
  console.log(
    'ID'.padEnd(20) +
    'NOMBRE'.padEnd(26) +
    'ESTADO'.padEnd(14) +
    'VERSIÓN'.padEnd(10) +
    'ARCHIVOS'.padEnd(10) +
    'CERTIFICADO EL'
  );
  console.log('----------------------------------------------------------------------------------------');

  for (const g of config.games) {
    const fileCount = g.protected_paths.length.toString();
    const date = g.protected_at ? g.protected_at.split('T')[0] : 'N/A';
    console.log(
      g.id.padEnd(20) +
      g.name.padEnd(26) +
      g.status.padEnd(14) +
      g.version.padEnd(10) +
      fileCount.padEnd(10) +
      date
    );
  }
  console.log('========================================================================================\n');
}

/**
 * Command: PROTECT <GAME>
 */
export function runProtect(gameInput: string, commitRef?: string): void {
  const config = loadConfig();
  const gameId = normalizeGameId(gameInput);
  const game = config.games.find(g => g.id === gameId);

  if (!game) {
    console.error(`[ERROR] No se encontró el juego con identificador: '${gameInput}' (normalizado: '${gameId}')`);
    process.exit(1);
  }

  console.log(`\n🔒 CERTIFICANDO Y PROTEGIENDO JUEGO: ${game.name} (${game.id})`);
  console.log('------------------------------------------------------------');

  // Verify paths
  for (const p of game.protected_paths) {
    if (!fs.existsSync(path.join(ROOT_DIR, p))) {
      console.error(`[FALLO PREVIO] No se puede certificar: archivo faltante ${p}`);
      process.exit(1);
    }
  }

  game.status = 'LOCKED';
  game.protected_at = new Date().toISOString();
  game.protected_commit = commitRef || `certified-rev-${Date.now().toString(36)}`;
  game.protected_by = 'Senior DevOps / AI Studio Automated Guard';

  saveConfig(config);
  console.log(`[✓ ÉXITO] ${game.name} ha sido protegido y certificado con éxito.`);
  console.log(`  Estado: LOCKED`);
  console.log(`  Commit de referencia: ${game.protected_commit}`);
  console.log(`  Fecha: ${game.protected_at}\n`);
}

/**
 * Command: UNLOCK <GAME> [REASON]
 */
export function runUnlock(gameInput: string, reason: string = 'Mantenimiento o reparación controlada'): void {
  const config = loadConfig();
  const gameId = normalizeGameId(gameInput);
  const game = config.games.find(g => g.id === gameId);

  if (!game) {
    console.error(`[ERROR] No se encontró el juego con identificador: '${gameInput}' (normalizado: '${gameId}')`);
    process.exit(1);
  }

  console.log(`\n🔓 DESBLOQUEANDO JUEGO: ${game.name} (${game.id})`);
  console.log('------------------------------------------------------------');
  game.status = 'UNDER_REPAIR';
  game.unlocked_at = new Date().toISOString();
  game.unlocked_by = 'Authorized Maintainer / AI Studio';
  game.unlock_reason = reason;

  saveConfig(config);
  console.log(`[✓ ÉXITO] ${game.name} ahora está en estado UNDER_REPAIR.`);
  console.log(`  Motivo registrado: ${reason}`);
  console.log(`  Historial de certificación anterior preservado (${game.protected_commit}).\n`);
}

/**
 * Command: DEPS <GAME>
 */
export function runDeps(gameInput: string): void {
  const config = loadConfig();
  const gameId = normalizeGameId(gameInput);
  const game = config.games.find(g => g.id === gameId);

  if (!game) {
    console.error(`[ERROR] No se encontró el juego con identificador: '${gameInput}'`);
    process.exit(1);
  }

  console.log(`\n📦 DEPENDENCIAS Y MAPA TÉCNICO DE: ${game.name.toUpperCase()}`);
  console.log('============================================================');
  console.log(`Estado actual: ${game.status}`);
  console.log(`Versión: ${game.version}`);
  console.log(`Certificado en: ${game.protected_at || 'Sin fecha'}`);
  console.log('\n1. ARCHIVOS PROPIOS EXCLUSIVOS:');
  game.protected_paths.forEach(p => console.log(`   - ${p}`));

  console.log('\n2. DEPENDENCIAS COMPARTIDAS (CRÍTICAS):');
  game.shared_dependencies.forEach(d => console.log(`   - ${d}`));

  console.log('\n3. COMPONENTES:');
  game.protected_components.forEach(c => console.log(`   - ${c}`));

  console.log('\n4. MOTORES (ENGINES):');
  game.protected_engines.forEach(e => console.log(`   - ${e}`));

  console.log('\n5. REPOSITORIOS Y SERVICIOS:');
  game.protected_repositories.forEach(r => console.log(`   - ${r}`));
  game.protected_services.forEach(s => console.log(`   - ${s}`));

  console.log('\n6. OBJETOS DE BASE DE DATOS Y RPC:');
  console.log(`   Tablas: ${game.protected_tables.join(', ')}`);
  console.log(`   RPCs:   ${game.protected_rpc.join(', ')}`);

  console.log('\n7. MIGRACIONES RELACIONADAS:');
  game.protected_migrations.forEach(m => console.log(`   - ${m}`));

  console.log('\n8. PRUEBAS ASOCIADAS:');
  game.protected_tests.forEach(t => console.log(`   - ${t}`));
  console.log('============================================================\n');
}

/**
 * Command: DEPENDENTS <DEPENDENCY> (Reverse lookup)
 */
export function runDependents(depQuery: string): void {
  const config = loadConfig();
  console.log(`\n🔍 BÚSQUEDA INVERSA: ¿QUÉ JUEGOS DEPENDEN DE "${depQuery}"?`);
  console.log('============================================================');

  const queryNorm = depQuery.toLowerCase();
  const consumers: ProtectedGame[] = [];

  for (const game of config.games) {
    const isConsumer =
      game.shared_dependencies.some(d => d.toLowerCase().includes(queryNorm)) ||
      game.protected_repositories.some(r => r.toLowerCase().includes(queryNorm)) ||
      game.protected_services.some(s => s.toLowerCase().includes(queryNorm)) ||
      game.protected_paths.some(p => p.toLowerCase().includes(queryNorm));

    if (isConsumer) {
      consumers.push(game);
    }
  }

  if (consumers.length === 0) {
    console.log(`[INFO] Ningún juego registrado tiene dependencia directa con: ${depQuery}`);
  } else {
    console.log(`Juegos dependientes encontrados (${consumers.length}):`);
    for (const c of consumers) {
      const lockWarning = (c.status === 'LOCKED' || c.status === 'HARD_LOCKED') ? '🔒 [PROTEGIDO]' : '🟢 [MODIFICABLE]';
      console.log(`  - ${c.name.padEnd(25)} (ID: ${c.id.padEnd(16)}) -> Estado: ${c.status.padEnd(12)} ${lockWarning}`);
    }

    const lockedCount = consumers.filter(c => c.status === 'LOCKED' || c.status === 'HARD_LOCKED').length;
    if (lockedCount > 0) {
      console.log('\n⚠️  ADVERTENCIA DE MÁXIMO RIESGO:');
      console.log(`   Esta dependencia afecta a ${lockedCount} juego(s) LOCKED.`);
      console.log('   Cualquier modificación sobre ella sin aislamiento puede provocar regresión transversal.');
      console.log('   REGLA: NO MODIFICAR DIRECTAMENTE. Preferir abstracción aislada o solicitar desbloqueo formal.');
    }
  }
  console.log('============================================================\n');
}

/**
 * Command: MATRIX
 */
export function runMatrix(): void {
  const config = loadConfig();
  console.log('\n📊 MATRIZ TRANSVERSAL DE DEPENDENCIAS Y JUEGOS PROTEGIDOS');
  console.log('================================================================================================');
  console.log('INFRAESTRUCTURA COMPARTIDA'.padEnd(30) + 'NIVEL DE RIESGO'.padEnd(18) + 'JUEGOS CONSUMIDORES');
  console.log('------------------------------------------------------------------------------------------------');

  for (const infra of config.shared_infrastructure) {
    const consumers = config.games
      .filter(g => g.shared_dependencies.includes(infra.path) || g.protected_repositories.includes(infra.path))
      .map(g => g.name);

    const namesList = consumers.length > 0 ? consumers.join(', ') : '(Ninguno)';
    console.log(
      infra.id.padEnd(30) +
      infra.risk_level.padEnd(18) +
      namesList
    );
  }
  console.log('================================================================================================\n');
}

/**
 * Command: REPORT
 */
export function generateReport(): void {
  const config = loadConfig();
  console.log('\n📝 GENERANDO INFORME FORMAL: docs/PROTECTED_GAMES_REPORT.md');

  const report: string[] = [
    '# 🔒 INFORME DEL SISTEMA DE JUEGOS PROTEGIDOS / MÓDULOS CERTIFICADOS',
    '**Proyecto:** RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)  ',
    '**Repositorio Oficial:** https://github.com/raspandolaolla-app/ve  ',
    '**Rama:** main  ',
    `**Fecha de Generación:** ${new Date().toISOString()}  `,
    `**Política General:** ${config.default_policy}  `,
    '',
    '---',
    '',
    '## 1. RESUMEN EJECUTIVO',
    `El sistema de protección y certificación previene regresiones accidentales en cadena donde la reparación de un juego desestabiliza dependencias compartidas de juegos previamente declarados funcionales.`,
    '',
    `- **Total de Juegos Auditados:** ${config.games.length}/10`,
    `- **Juegos en Estado LOCKED:** ${config.games.filter(g => g.status === 'LOCKED').length}`,
    `- **Juegos en Estado HARD_LOCKED:** ${config.games.filter(g => g.status === 'HARD_LOCKED').length}`,
    `- **Juegos en Reparación (UNDER_REPAIR):** ${config.games.filter(g => g.status === 'UNDER_REPAIR').length}`,
    `- **Módulos de Infraestructura Compartida:** ${config.shared_infrastructure.length}`,
    '',
    '---',
    '',
    '## 2. ESTADO DE PROTECCIÓN POR JUEGO',
    '',
    '| ID | Nombre del Juego | Estado | Versión | Commit Certificado | Archivos Exclusivos | Pruebas Asociadas |',
    '|---|---|---|---|---|---|---|',
    ...config.games.map(g =>
      `| \`${g.id}\` | **${g.name}** | \`${g.status}\` | ${g.version} | \`${g.protected_commit}\` | ${g.protected_paths.length} | ${g.protected_tests.length} |`
    ),
    '',
    '---',
    '',
    '## 3. INVENTARIO DE INFRAESTRUCTURA COMPARTIDA Y RIESGOS',
    '',
    '| Componente / Servicio | Ruta en Repositorio | Nivel de Riesgo | Juegos que Dependen |',
    '|---|---|---|---|',
    ...config.shared_infrastructure.map(infra => {
      const consumers = config.games
        .filter(g => g.shared_dependencies.includes(infra.path) || g.protected_repositories.includes(infra.path))
        .map(g => g.name);
      return `| **${infra.id}** | \`${infra.path}\` | \`${infra.risk_level}\` | ${consumers.join(', ')} |`;
    }),
    '',
    '---',
    '',
    '## 4. MATRIZ DETALLADA DE DEPENDENCIAS POR JUEGO',
    ''
  ];

  for (const g of config.games) {
    report.push(`### 🔒 ${g.name} (\`${g.id}\`)`);
    report.push(`- **Estado:** \`${g.status}\``);
    report.push(`- **Certificado por:** ${g.protected_by} (${g.protected_at})`);
    report.push(`- **Commit de Referencia:** \`${g.protected_commit}\``);
    report.push(`- **Archivos Propios:**`);
    g.protected_paths.forEach(p => report.push(`  * \`${p}\``));
    report.push(`- **Dependencias Compartidas Críticas:**`);
    g.shared_dependencies.forEach(d => report.push(`  * \`${d}\``));
    report.push(`- **RPCs de Base de Datos:** ${g.protected_rpc.map(r => `\`${r}\``).join(', ')}`);
    report.push(`- **Migraciones Históricas Protegidas:**`);
    g.protected_migrations.forEach(m => report.push(`  * \`${m}\``));
    report.push(`- **Suites de Pruebas:**`);
    g.protected_tests.forEach(t => report.push(`  * \`${t}\``));
    report.push('');
  }

  report.push('---');
  report.push('## 5. PROTOCOLO DE INTERVENCIÓN Y GOBERNANZA');
  report.push('1. **Regla de Oro:** Ningún desarrollador ni agente de IA puede modificar un juego `LOCKED` o sus dependencias compartidas sin autorización explícita y aislamiento previo.');
  report.push('2. **Comando de Desbloqueo:** `npx tsx scripts/protected_games_guard.ts unlock <juego> [motivo]`.');
  report.push('3. **Recertificación Obligatoria:** Tras reparar el juego y validar tests/typecheck/lint/build, ejecutar `npx tsx scripts/protected_games_guard.ts protect <juego>`.');
  report.push('4. **Verificación en CI:** GitHub Actions ejecuta `npm run audit:protected` en cada pull request y push.');
  report.push('');

  fs.writeFileSync(REPORT_MD_PATH, report.join('\n') + '\n', 'utf8');
  console.log(`[✓ ÉXITO] Reporte escrito en: ${REPORT_MD_PATH}\n`);
}

// CLI Argument Dispatcher
function main() {
  const args = process.argv.slice(2);
  const command = (args[0] || 'audit').toLowerCase();

  switch (command) {
    case 'audit':
    case 'auditar':
    case 'auditar protección':
    case 'audit-protection':
      const result = runAudit();
      if (!result.success) {
        process.exit(1);
      }
      break;

    case 'status':
    case 'estado':
    case 'estado de protección':
      runStatus();
      break;

    case 'protect':
    case 'proteger':
      if (!args[1]) {
        console.error('[ERROR] Debe especificar el juego a proteger. Ejemplo: npx tsx scripts/protected_games_guard.ts protect ajedrez');
        process.exit(1);
      }
      runProtect(args[1], args[2]);
      break;

    case 'unlock':
    case 'desbloquear':
      if (!args[1]) {
        console.error('[ERROR] Debe especificar el juego a desbloquear. Ejemplo: npx tsx scripts/protected_games_guard.ts unlock ajedrez "Corrección de bug en enroque"');
        process.exit(1);
      }
      runUnlock(args[1], args.slice(2).join(' ') || 'Desbloqueo solicitado');
      break;

    case 'deps':
    case 'dependencias':
      if (!args[1]) {
        console.error('[ERROR] Debe especificar el juego a consultar. Ejemplo: npx tsx scripts/protected_games_guard.ts deps ajedrez');
        process.exit(1);
      }
      runDeps(args[1]);
      break;

    case 'dependents':
    case 'consumidores':
    case 'who-depends':
      if (!args[1]) {
        console.error('[ERROR] Debe especificar la dependencia a consultar. Ejemplo: npx tsx scripts/protected_games_guard.ts dependents GameRepository');
        process.exit(1);
      }
      runDependents(args[1]);
      break;

    case 'matrix':
    case 'matriz':
      runMatrix();
      break;

    case 'report':
    case 'informe':
      generateReport();
      break;

    default:
      console.log(`\nComando no reconocido: '${command}'`);
      console.log('Comandos disponibles:');
      console.log('  audit                                (Audita el estado actual y cambios ilegales)');
      console.log('  status                               (Muestra tabla con el estado de todos los juegos)');
      console.log('  protect <juego> [commit]             (Certifica y bloquea un juego: LOCKED)');
      console.log('  unlock <juego> [motivo]              (Desbloquea para mantenimiento: UNDER_REPAIR)');
      console.log('  deps <juego>                         (Muestra el mapa de dependencias de un juego)');
      console.log('  dependents <dependencia>             (Búsqueda inversa: qué juegos consumen esta dependencia)');
      console.log('  matrix                               (Muestra la matriz transversal completa)');
      console.log('  report                               (Genera el reporte Markdown formal)\n');
      process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('protected_games_guard.ts')) {
  main();
}
