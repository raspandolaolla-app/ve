// ==============================================================================
// RASPANDO LA OLLA — SUITE DE PRUEBAS DE INTEGRIDAD FASE 26
// Validación de Límites Monetarios (25 Bs - 5000 Bs) y Sistema Tasa Oficial BCV
// ==============================================================================

import { BcvRepository } from '../services/repositories/BcvRepository';
import { TableRepository } from '../services/repositories/TableRepository';
import { FINANCIAL_RULES } from '../utils/constants';

export async function runPhase26ValidationSuite() {
  console.log('--- INICIANDO SUITE DE PRUEBAS FASE 26: LÍMITES 25-5000 Bs Y TASA BCV ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // PRUEBA 1: Constantes Globales
  assert(FINANCIAL_RULES.MIN_ENTRY_FEE_BS === 25, 'Constante MIN_ENTRY_FEE_BS debe ser igual a 25');
  assert(FINANCIAL_RULES.MAX_ENTRY_FEE_BS === 5000, 'Constante MAX_ENTRY_FEE_BS debe ser igual a 5000');

  // PRUEBA 2: Función de Conversión a USD
  const usd25 = BcvRepository.formatUsdEquivalent(25, 50); // 25 / 50 = 0.50
  assert(usd25.includes('$0.50 USD') || usd25.includes('0.50'), 'Conversión de 25 Bs @ 50 Bs/USD debe ser $0.50 USD');

  const usd5000 = BcvRepository.formatUsdEquivalent(5000, 100); // 5000 / 100 = 50.00
  assert(usd5000.includes('$50.00 USD') || usd5000.includes('50.00'), 'Conversión de 5000 Bs @ 100 Bs/USD debe ser $50.00 USD');

  // PRUEBA 3: Obtención de Tasa BCV Oficial
  try {
    const rateInfo = await BcvRepository.getBcvRate(false);
    assert(rateInfo.rate > 0, `Tasa BCV retornada debe ser mayor a 0 (Actual: ${rateInfo.rate} Bs.)`);
    assert(rateInfo.source.length > 0, 'Fuente de la tasa BCV debe estar especificada');
    assert(rateInfo.formattedTimestamp.length > 0, 'Fecha y hora de actualización formateada debe existir');
  } catch (err) {
    assert(false, 'Obtención de Tasa BCV no debe lanzar excepción');
  }

  // PRUEBA 4: Catálogo de Montos Disponibles para Mesas (Filtro 25 a 5000 Bs)
  try {
    const fees = await TableRepository.getAvailableEntryFees();
    const hasUnder25 = fees.some((f) => f < 25);
    const hasOver5000 = fees.some((f) => f > 5000);
    assert(!hasUnder25, 'Catálogo de montos para mesas no debe contener valores menores a 25 Bs.');
    assert(!hasOver5000, 'Catálogo de montos para mesas no debe contener valores mayores a 5000 Bs.');
  } catch (err) {
    assert(false, 'Consulta de montos disponibles no debe fallar');
  }

  // PRUEBA 5: Intento de Creación de Mesa con Monto Inválido (24 Bs)
  try {
    await TableRepository.createTable({
      gameType: 'domino_venezolano',
      mode: '1v1',
      entryFee: 24,
      maxPlayers: 2,
      isPrivate: false,
    });
    assert(false, 'Creación de mesa con 24 Bs debe ser rechazada');
  } catch (err: any) {
    assert(
      err.message.includes('INVALID_ENTRY_FEE') || err.message.includes('25 Bs'),
      'Rechazo por 24 Bs debe retornar mensaje explicativo del límite 25-5000 Bs'
    );
  }

  // PRUEBA 6: Intento de Creación de Mesa con Monto Inválido (5001 Bs)
  try {
    await TableRepository.createTable({
      gameType: 'domino_venezolano',
      mode: '1v1',
      entryFee: 5001,
      maxPlayers: 2,
      isPrivate: false,
    });
    assert(false, 'Creación de mesa con 5001 Bs debe ser rechazada');
  } catch (err: any) {
    assert(
      err.message.includes('INVALID_ENTRY_FEE') || err.message.includes('25 Bs'),
      'Rechazo por 5001 Bs debe retornar mensaje explicativo del límite 25-5000 Bs'
    );
  }

  console.log(`--- RESUMEN DE PRUEBAS FASE 26: ${passed} PASADAS, ${failed} FALLADAS ---`);
  return { passed, failed };
}
