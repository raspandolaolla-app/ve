// ==============================================================================
// RASPANDO LA OLLA — EJECUTOR DE TODAS LAS BATERÍAS DE PRUEBAS EXISTENTES
// ==============================================================================

import { runValidationSuite } from './phase24_table_creation';
import { runPhase24OperationalTests } from './phase24_2_operational_validation';
import { runPhase251ValidationTests } from './phase25_1_error_sanitizer_validation';
import { runPhase25_2Validation } from './phase25_2_surgical_contracts_validation';
import { runPhase26ValidationSuite } from './phase26_amount_limits_and_bcv_validation';
import { runRngSecurityValidationSuite } from './phase27_rng_security_validation';
import { runWalletRealtimeLifecycleValidation } from './wallet_realtime_lifecycle_validation';
import { run8GamesTransversalAudit } from './phase28_8_games_transversal_audit';

async function main() {
  console.log('======================================================================');
  console.log('                 INICIANDO CONSOLIDADO DE PRUEBAS                     ');
  console.log('======================================================================\n');

  try {
    console.log('▶️ EJECUTANDO: Fase 28 — Auditoría Transversal de los 8 Juegos y Aislamiento de Mesa');
    const res28 = run8GamesTransversalAudit();
    console.log(`  Resultado: ${res28.allPassed ? '✓ EXCELENTE' : '✗ HUBO FALLOS'}`);
    console.log(`  Tests Pasados: ${res28.summary.passedGames}/${res28.summary.totalGames}`);

    console.log('\n▶️ EJECUTANDO: Validación de Ciclo de Vida Realtime en Billetera');
    const resRealtime = runWalletRealtimeLifecycleValidation();
    console.log(`  Resultado: ${resRealtime.failed === 0 ? '✓ EXCELENTE' : '✗ HUBO FALLOS'}`);
    console.log(`  Tests Pasados: ${resRealtime.passed}/${resRealtime.total}`);

    console.log('\n▶️ EJECUTANDO: Fase 25.1 — Sanitización de Errores');
    const res25_1 = runPhase251ValidationTests();
    console.log(`  Resultado: ${res25_1.allPassed ? '✓ EXCELENTE' : '✗ HUBO FALLOS'}`);
    console.log(`  Tests Pasados: ${res25_1.results.filter(r => r.passed).length}/${res25_1.results.length}`);

    console.log('\n▶️ EJECUTANDO: Fase 25.2 — Validación de RLS y Contratos Frontend');
    const res25_2 = runPhase25_2Validation();
    console.log(`  Resultado: ${res25_2.failedTests === 0 ? '✓ EXCELENTE' : '✗ HUBO FALLOS'}`);
    console.log(`  Tests Pasados: ${res25_2.passedTests}/${res25_2.totalTests}`);

    console.log('\n▶️ EJECUTANDO: Fase 27 — Seguridad RNG y Motores del Servidor');
    const res27 = runRngSecurityValidationSuite();
    console.log(`  Resultado: ${res27 ? '✓ EXCELENTE' : '✗ HUBO FALLOS'}`);

    console.log('\n▶️ EJECUTANDO: Fase 26 — Límites Financieros 25-5000 Bs y Tasa BCV');
    const res26 = await runPhase26ValidationSuite();
    console.log(`  Resultado: ${res26.failed === 0 ? '✓ EXCELENTE' : '✗ HUBO FALLOS'}`);

    console.log('\n▶️ EJECUTANDO: Fase 24.2 — Pruebas Operativas de Creación y Unión');
    const res24_2 = await runPhase24OperationalTests();
    console.log(`  Resultado: ${res24_2.allPassed ? '✓ EXCELENTE' : '✗ HUBO FALLOS'}`);
    console.log(`  Tests Pasados: ${res24_2.results.filter(r => r.passed).length}/${res24_2.results.length}`);

    console.log('\n▶️ EJECUTANDO: Fase 24 — Creación de Mesas');
    await runValidationSuite();

    console.log('\n======================================================================');
    console.log('               CONSOLIDADO DE PRUEBAS COMPLETADO CON ÉXITO            ');
    console.log('======================================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR CRÍTICO DURANTE LA EJECUCIÓN:', error);
    process.exit(1);
  }
}

main();
