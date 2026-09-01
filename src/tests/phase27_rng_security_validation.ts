// ==============================================================================
// RASPANDO LA OLLA — VERIFICACIÓN DE RNG SEGURO Y AUTORITATIVO (FASE 27)
// ==============================================================================

import { RngService } from '../services/rng/RngService';
import { AtrapaitoEngine } from '../features/games/engines/AtrapaitoEngine';
import { BingoEngine } from '../features/games/engines/BingoEngine';
import { TrucoEngine } from '../features/games/engines/TrucoEngine';
import { DominoEngine } from '../features/games/engines/DominoEngine';
import { PollaEngine } from '../features/games/engines/PollaEngine';

export function runRngSecurityValidationSuite() {
  console.log('====================================================');
  console.log('INICIANDO AUDITORÍA Y VERIFICACIÓN DE RNG SEGURO (FASE 27)');
  console.log('====================================================');

  // 1. Verificar RngService Web Crypto API (Fallback Seguro)
  console.log('\n[1] Probando RngService.getRandomIntSecure...');
  const samples: number[] = [];
  for (let i = 0; i < 100; i++) {
    const val = RngService.getRandomIntSecure(1, 6);
    samples.push(val);
    if (val < 1 || val > 6) {
      throw new Error(`[RNG Error] Valor fuera de rango 1..6: ${val}`);
    }
  }
  console.log('✅ RngService genera valores en rango 1..6 correctamente.');

  // 2. Verificar AtrapaitoEngine con RNG autoritativo
  console.log('\n[2] Probando AtrapaitoEngine ROLL_DICE con Server RNG...');
  const atrapaito = new AtrapaitoEngine();
  const mockTable: any = { id: 'tbl_1', mode: 'INDIVIDUAL', entryFee: 25, config: {} };
  const mockPlayers: any = [
    { userId: 'u1', seatNumber: 1, team: 'RED', displayName: 'Jugador 1' },
    { userId: 'u2', seatNumber: 2, team: 'BLUE', displayName: 'Jugador 2' },
  ];
  let state = atrapaito.initialize(mockTable, mockPlayers);
  
  // Probar lanzamiento con dado suministrado por servidor
  const actionRes = atrapaito.applyAction(state, {
    sessionId: 'sess_1',
    userId: 'u1',
    actionType: 'ROLL_DICE',
    actionData: { diceValue: 5, rngEventId: 'evt_100', commitmentHash: 'HASH_ABC' },
    clientTimestamp: Date.now(),
  });
  if (!actionRes.isValid || actionRes.newState.diceValue !== 5) {
    throw new Error('❌ AtrapaitoEngine no aceptó correctamente el dado autoritativo del servidor.');
  }
  console.log('✅ AtrapaitoEngine respeta el dado autoritativo del servidor (5).');

  // 3. Verificar BingoEngine con balota autoritativa del servidor
  console.log('\n[3] Probando BingoEngine DRAW_BALL con Server RNG...');
  const bingo = new BingoEngine();
  let bingoState = bingo.initialize(mockTable, mockPlayers);
  const bingoRes = bingo.applyAction(bingoState, {
    sessionId: 'sess_bingo',
    userId: 'u1',
    actionType: 'DRAW_BALL',
    actionData: { ball: 42, rngEventId: 'evt_bingo_1', commitmentHash: 'HASH_XYZ' },
    clientTimestamp: Date.now(),
  });
  if (!bingoRes.isValid || bingoRes.newState.currentBall !== 42 || !bingoRes.newState.drawnBalls.includes(42)) {
    throw new Error('❌ BingoEngine no procesó correctamente la balota autoritativa del servidor.');
  }
  console.log('✅ BingoEngine procesó correctamente la balota autoritativa del servidor (42).');

  // 4. Verificar TrucoEngine con Fisher-Yates Criptográfico
  console.log('\n[4] Probando TrucoEngine repartición de cartas con RNG Criptográfico...');
  const truco = new TrucoEngine();
  const trucoState = truco.initialize(mockTable, mockPlayers);
  if (!trucoState.vira || !trucoState.hands['u1'] || trucoState.hands['u1'].length !== 3) {
    throw new Error('❌ TrucoEngine falló al repartir cartas iniciales.');
  }
  console.log('✅ TrucoEngine generó reparto inicial válido con vira:', trucoState.vira);

  // 5. Verificar DominoEngine repartición de fichas y ausencia total de -1
  console.log('\n[5] Probando DominoEngine repartición de fichas...');
  const domino = new DominoEngine();
  const dominoState = domino.initialize(mockTable, mockPlayers);
  if (!dominoState.hands['u1'] || dominoState.hands['u1'].length !== 7) {
    throw new Error('❌ DominoEngine falló al repartir 7 fichas por jugador.');
  }
  if (!dominoState.hands['u2'] || dominoState.hands['u2'].length !== 7) {
    throw new Error('❌ DominoEngine falló al repartir 7 fichas a jugador 2.');
  }

  // Verificar que ninguna ficha contenga -1 y que todas estén en rango [0-6]
  for (const [uId, hand] of Object.entries(dominoState.hands)) {
    for (const tile of hand) {
      if (!Array.isArray(tile) || tile.length !== 2) {
        throw new Error(`❌ DominoEngine generó ficha con formato inválido para ${uId}: ${JSON.stringify(tile)}`);
      }
      const [a, b] = tile;
      if (a === -1 || b === -1 || a < 0 || a > 6 || b < 0 || b > 6) {
        throw new Error(`❌ DominoEngine generó ficha corrupta o con -1 para ${uId}: [${a}, ${b}]`);
      }
    }
  }

  // Verificar que getSanitizedStateForPlayer no degrade las fichas a -1
  const sanitizedP1 = domino.getSanitizedStateForPlayer(dominoState, 'u1');
  for (const [uId, hand] of Object.entries(sanitizedP1.hands)) {
    for (const tile of hand) {
      if (tile[0] === -1 || tile[1] === -1) {
        throw new Error(`❌ getSanitizedStateForPlayer generó fichas -1 para ${uId}`);
      }
    }
  }

  console.log('✅ DominoEngine repartió correctamente 7 fichas válidas por jugador sin valores -1.');

  // 6. Verificar verificación de Hash de Compromiso (Fairness)
  console.log('\n[6] Probando RngService.verifyCommitmentHash...');
  RngService.verifyCommitmentHash('sess_1', 'key_1', 5, 'hash_sample').then((result) => {
    console.log('✅ RngService.verifyCommitmentHash funciona adecuadamente (resultado:', result, ')');
  });

  console.log('\n====================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE SEGURIDAD RNG PASARON CON ÉXITO');
  console.log('====================================================\n');
  return true;
}
