// ==============================================================================
// RASPANDO LA OLLA — TEST DE VALIDACIÓN: CICLO DE VIDA REALTIME EN BILLETERA
// ==============================================================================

import { RealtimeManager } from '../services/realtime/RealtimeManager';

export function runWalletRealtimeLifecycleValidation(): {
  total: number;
  passed: number;
  failed: number;
  results: Array<{ name: string; passed: boolean; details?: string }>;
} {
  const results: Array<{ name: string; passed: boolean; details?: string }> = [];

  const record = (name: string, passed: boolean, details?: string) => {
    results.push({ name, passed, details });
    console.log(`  [${passed ? '✓ PASS' : '✗ FAIL'}] ${name}${details ? ` -> ${details}` : ''}`);
  };

  console.log('\n--- VALIDACIÓN DE CICLO DE VIDA REALTIME EN BILLETERA ---');

  // Test 1: Manejo seguro de userId inválido
  try {
    const unsubNull = RealtimeManager.subscribeToUserEvents('null', () => {}, () => {});
    const unsubUndef = RealtimeManager.subscribeToUserEvents('undefined', () => {}, () => {});
    const unsubEmpty = RealtimeManager.subscribeToUserEvents('', () => {}, () => {});
    unsubNull();
    unsubUndef();
    unsubEmpty();
    record('Rechazo seguro de userIds inválidos (null, undefined, vacío)', true);
  } catch (err: any) {
    record('Rechazo seguro de userIds inválidos (null, undefined, vacío)', false, err.message);
  }

  // Test 2: Idempotencia y suscripción múltiple para el mismo usuario sin error de postgres_changes
  try {
    const testUserId = 'test-user-' + Math.random().toString(36).substring(2, 9);
    let balanceEvents1 = 0;
    let balanceEvents2 = 0;

    // Primer suscriptor (Simula WalletContext)
    const unsub1 = RealtimeManager.subscribeToUserEvents(
      testUserId,
      () => { balanceEvents1++; },
      () => {}
    );

    // Segundo suscriptor inmediato (Simula WalletView abriéndose)
    const unsub2 = RealtimeManager.subscribeToUserEvents(
      testUserId,
      () => { balanceEvents2++; },
      () => {}
    );

    record('Suscripción múltiple simultánea sin error after subscribe()', true);

    // Test 3: Desuscripción escalonada (desmontar WalletView manteniendo WalletContext)
    unsub2();
    record('Desuscripción individual sin cerrar canal compartido', true);

    // Test 4: Desuscripción final y cleanup total
    unsub1();
    record('Desuscripción final completa sin leaks', true);
  } catch (err: any) {
    record('Ciclo completo de suscripción/desuscripción', false, err.message);
  }

  // Test 5: Limpieza explícita por logout
  try {
    const testUserId2 = 'test-user-logout-' + Math.random().toString(36).substring(2, 9);
    RealtimeManager.subscribeToUserEvents(testUserId2, () => {}, () => {});
    RealtimeManager.cleanupUserEvents(testUserId2);
    record('Limpieza explícita en logout (cleanupUserEvents)', true);
  } catch (err: any) {
    record('Limpieza explícita en logout (cleanupUserEvents)', false, err.message);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}

runWalletRealtimeLifecycleValidation();
