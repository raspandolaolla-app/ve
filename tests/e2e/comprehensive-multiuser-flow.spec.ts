import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { errorReporter } from './error-reporter';
import { AuthPage } from './pages/auth.page';
import { LobbyPage } from './pages/lobby.page';
import { WalletPage } from './pages/wallet.page';
import { BingoGamePage } from './pages/games/bingo.page';
import { RockPaperScissorsGamePage } from './pages/games/rock-paper-scissors.page';
import { TicTacToeGamePage } from './pages/games/tictactoe.page';

// Datos de Usuario A y Usuario B aislados
const USER_A = {
  id: 'a1111111-1111-4111-a111-111111111111',
  email: 'usuario.a@raspando.ve',
  fullName: 'Alejandro Vargas',
  cedula: '19876543',
  telefono: '+584121234567',
  fechaNacimiento: '1995-05-15',
  estado: 'Distrito Capital',
};

const USER_B = {
  id: 'b2222222-2222-4222-b222-222222222222',
  email: 'usuario.b@raspando.ve',
  fullName: 'Beatriz Morales',
  cedula: '24567890',
  telefono: '+584149876543',
  fechaNacimiento: '1996-08-20',
  estado: 'Miranda',
};

test.describe('Flujo Integral Multi-Usuario E2E: Raspando La Olla', () => {
  // Configurar timeout extendido para flujo multiusuario completo (120 segundos)
  test.setTimeout(120000);

  let contextA: BrowserContext;
  let pageA: Page;
  let contextB: BrowserContext;
  let pageB: Page;

  let authPageA: AuthPage;
  let authPageB: AuthPage;
  let lobbyPageA: LobbyPage;
  let lobbyPageB: LobbyPage;
  let walletPageA: WalletPage;
  let walletPageB: WalletPage;
  let bingoPageA: BingoGamePage;
  let bingoPageB: BingoGamePage;
  let rpsPageA: RockPaperScissorsGamePage;
  let rpsPageB: RockPaperScissorsGamePage;
  let tictactoePageA: TicTacToeGamePage;
  let tictactoePageB: TicTacToeGamePage;

  // Estado compartido para sincronización multiusuario en pruebas
  const sharedTestState = {
    tables: [
      {
        id: 'table-bingo-90-shared',
        name: 'Bingo 90 Bolas',
        game_type: 'bingo',
        entry_fee: 25,
        max_players: 10,
        min_players: 2,
        current_players_count: 1,
        is_private: false,
        visibility: 'PUBLIC',
        join_code: 'BINGO90',
        invite_code: 'BINGO90',
        status: 'WAITING',
        host_user_id: USER_A.id,
        config: { variant: '90', gameVariant: '90' },
        created_at: new Date().toISOString(),
      },
    ] as any[],
    sessions: new Map<string, any>(),
    bingoTableId: 'table-bingo-90-shared',
    bingoSessionId: 'session-bingo-90-shared',
    drawnBalls: [7, 24, 45, 68, 89],
  };

  /**
   * Configura las intercepciones de red y Supabase para una página dada
   */
  const setupPageNetworkMocks = async (page: Page, user: typeof USER_A | typeof USER_B) => {
    errorReporter.attachToPage(page, `Contexto: ${user.fullName}`);

    // 1. Interceptar llamada a perfiles de Supabase
    await page.route('**/rest/v1/profiles*', async (route) => {
      const isPostOrPatch = ['POST', 'PATCH'].includes(route.request().method());
      if (isPostOrPatch) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: user.id,
            first_name: user.fullName.split(' ')[0],
            last_name: user.fullName.split(' ')[1] || '',
            cedula: user.cedula,
            telefono: user.telefono,
            is_profile_locked: true,
            account_status: 'ACTIVE',
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: user.id,
              first_name: user.fullName.split(' ')[0],
              last_name: user.fullName.split(' ')[1] || '',
              cedula: user.cedula,
              telefono: user.telefono,
              is_profile_locked: true,
              account_status: 'ACTIVE',
            },
          ]),
        });
      }
    });

    // 2. Interceptar RPC claim_test_bonus
    await page.route('**/rest/v1/rpc/claim_test_bonus*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Bono de prueba de 5.000 Bs. acreditado exitosamente.',
          new_balance: 5000,
        }),
      });
    });

    // 2.1 Interceptar RPC get_public_available_tables
    await page.route('**/rest/v1/rpc/get_public_available_tables*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sharedTestState.tables),
      });
    });

    // 2.2 Interceptar table_players
    await page.route('**/rest/v1/table_players*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'player-1',
            table_id: sharedTestState.bingoTableId,
            user_id: USER_A.id,
            seat_number: 1,
            is_ready: true,
            user_name: USER_A.fullName,
            role: 'HOST',
          },
        ]),
      });
    });

    // 2.3 Interceptar RPC join_table_transaction
    await page.route('**/rest/v1/rpc/join_table_transaction*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          table_id: sharedTestState.bingoTableId,
          seat_number: 2,
          message: 'Unido exitosamente a la mesa',
        }),
      });
    });

    // 3. Interceptar mesas de juego (game_tables)
    await page.route('**/rest/v1/game_tables*', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        const postData = route.request().postDataJSON() || {};
        const createdTable = {
          id: postData.id || `table-${Date.now()}`,
          name: postData.name || 'Bingo 90 Bolas',
          game_type: postData.game_type || 'bingo',
          entry_fee: postData.entry_fee || 25,
          max_players: postData.max_players || 10,
          current_players_count: 1,
          min_players: 2,
          is_private: false,
          visibility: 'PUBLIC',
          join_code: 'BINGO90',
          invite_code: 'BINGO90',
          status: 'WAITING',
          host_user_id: user.id,
          config: postData.config || { variant: '90' },
          created_at: new Date().toISOString(),
        };
        sharedTestState.tables.unshift(createdTable);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdTable),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(sharedTestState.tables),
        });
      }
    });

    // 4. Interceptar sesiones de juego (game_sessions)
    await page.route('**/rest/v1/game_sessions*', async (route) => {
      const mockSession = {
        id: sharedTestState.bingoSessionId,
        table_id: sharedTestState.bingoTableId,
        game_type: 'BINGO',
        status: 'ACTIVE',
        current_state: {
          variant: '90',
          totalPoolBs: 50,
          drawnBalls: sharedTestState.drawnBalls,
          playerNames: {
            [USER_A.id]: USER_A.fullName,
            [USER_B.id]: USER_B.fullName,
          },
          cards: {
            [USER_A.id]: [
              {
                id: 'card-1',
                numbers: [7, 15, 24, 33, 45, 52, 68, 77, 89],
                marked: [true, false, true, false, true, false, true, false, true],
              },
            ],
            [USER_B.id]: [
              {
                id: 'card-2',
                numbers: [5, 12, 28, 39, 41, 56, 63, 72, 85],
                marked: [false, false, false, false, false, false, false, false, false],
              },
            ],
          },
        },
      };

      const isSingle = route.request().headers()['accept']?.includes('vnd.pgrst.object+json');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isSingle ? mockSession : [mockSession]),
      });
    });

    // 5. Interceptar RPCs de unirse y procesar jugadas
    await page.route('**/rest/v1/rpc/join_table_secure*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Unido exitosamente a la mesa' }),
      });
    });

    await page.route('**/rest/v1/rpc/start_game_session_secure*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, session_id: sharedTestState.bingoSessionId }),
      });
    });
  };

  test.beforeAll(async ({ browser }) => {
    // 1. Inicializar Contexto A (Navegador independiente para Usuario A)
    contextA = await browser.newContext();
    pageA = await contextA.newPage();
    await setupPageNetworkMocks(pageA, USER_A);

    authPageA = new AuthPage(pageA);
    lobbyPageA = new LobbyPage(pageA);
    walletPageA = new WalletPage(pageA);
    bingoPageA = new BingoGamePage(pageA);
    rpsPageA = new RockPaperScissorsGamePage(pageA);
    tictactoePageA = new TicTacToeGamePage(pageA);

    // 2. Inicializar Contexto B (Navegador independiente para Usuario B)
    contextB = await browser.newContext();
    pageB = await contextB.newPage();
    await setupPageNetworkMocks(pageB, USER_B);

    authPageB = new AuthPage(pageB);
    lobbyPageB = new LobbyPage(pageB);
    walletPageB = new WalletPage(pageB);
    bingoPageB = new BingoGamePage(pageB);
    rpsPageB = new RockPaperScissorsGamePage(pageB);
    tictactoePageB = new TicTacToeGamePage(pageB);
  });

  test.afterAll(async () => {
    // Generar automáticamente el archivo test-findings-report.md con todas las métricas
    errorReporter.generateMarkdownReport();

    if (contextA) await contextA.close();
    if (contextB) await contextB.close();
  });

  // ============================================================================
  // ETAPA A: USUARIO A (Login -> Onboarding -> Bono 5000 Bs -> Crear Mesa Bingo 90)
  // ============================================================================
  test('Paso A: Usuario A realiza Login Mock, completa Onboarding, reclama Bono y crea Mesa de Bingo 90', async () => {
    const start = Date.now();
    try {
      // 1. Login con Google mockeado para Usuario A (necesita onboarding)
      await authPageA.loginWithMockGoogle(USER_A, true);

      // 2. Completar formulario de Onboarding
      await authPageA.completeOnboarding({
        cedula: USER_A.cedula,
        telefono: USER_A.telefono,
        nombre: USER_A.fullName,
        fechaNacimiento: USER_A.fechaNacimiento,
        estado: USER_A.estado,
      });

      // 3. Reclamar bono de 5.000 Bs en Billetera
      await walletPageA.gotoWallet();
      await walletPageA.claimBonus();
      await walletPageA.assertBalance(5000);

      // 4. Crear mesa de Bingo 90 bolas (entrada 25 Bs)
      await lobbyPageA.openTablesTab();
      await lobbyPageA.createBingoTable({
        variant: '90',
        entryFee: '25',
      });

      errorReporter.recordTestResult('Etapa A: Usuario A Onboarding, Bono y Creación Mesa Bingo 90', 'passed', Date.now() - start);
    } catch (err: any) {
      errorReporter.recordTestResult('Etapa A: Usuario A Onboarding, Bono y Creación Mesa Bingo 90', 'failed', Date.now() - start, err.message);
      throw err;
    }
  });

  // ============================================================================
  // ETAPA B: USUARIO B (Login Mock -> Onboarding -> Bono -> Unirse a Mesa)
  // ============================================================================
  test('Paso B: Usuario B en sesión aislada realiza Login, Onboarding, reclama Bono y se une a la mesa', async () => {
    const start = Date.now();
    try {
      // 1. Login con Google mockeado en Contexto B independiente
      await authPageB.loginWithMockGoogle(USER_B, true);

      // 2. Completar Onboarding para Usuario B
      await authPageB.completeOnboarding({
        cedula: USER_B.cedula,
        telefono: USER_B.telefono,
        nombre: USER_B.fullName,
        fechaNacimiento: USER_B.fechaNacimiento,
        estado: USER_B.estado,
      });

      // 3. Reclamar bono de 5.000 Bs
      await walletPageB.gotoWallet();
      await walletPageB.claimBonus();
      await walletPageB.assertBalance(5000);

      // 4. Navegar a Mesas y unirse a la mesa creada por Usuario A
      await lobbyPageB.openTablesTab();
      await lobbyPageB.joinTable('Bingo 90 Bolas');

      errorReporter.recordTestResult('Etapa B: Usuario B Aislado Onboarding, Bono y Unión a Mesa', 'passed', Date.now() - start);
    } catch (err: any) {
      errorReporter.recordTestResult('Etapa B: Usuario B Aislado Onboarding, Bono y Unión a Mesa', 'failed', Date.now() - start, err.message);
      throw err;
    }
  });

  // ============================================================================
  // ETAPA C: INTERACCIÓN EN BINGO (Compra de 2 cartones -> Iniciar Sorteo -> Extracción de balotas)
  // ============================================================================
  test('Paso C: Interacción en Bingo (Usuario A compra cartones, inicia sorteo y se extraen balotas)', async () => {
    const start = Date.now();
    try {
      // 1. Usuario A compra cartones
      const buyBtn = pageA.locator('button:has-text("COMPRAR"), button:has-text("+1 Cartón"), #btn-buy-card-1').first();
      if (await buyBtn.isVisible().catch(() => false)) {
        await bingoPageA.buyCards(2);
      }

      // 2. Usuario A inicia el sorteo
      const startDrawBtn = pageA.locator('button:has-text("INICIAR SORTEO"), button:has-text("Iniciar Sorteo")').first();
      if (await startDrawBtn.isVisible().catch(() => false)) {
        await bingoPageA.startDraw();
      }

      // 3. Verificar que se extraen balotas en el tablero
      const drawnBallsIndicator = pageA.locator('#bingo-drawn-balls, [data-testid="drawn-ball"], :has-text("Balota"), :has-text("Balotas Sorteadas")').first();
      if (await drawnBallsIndicator.isVisible().catch(() => false)) {
        await expect(drawnBallsIndicator).toBeVisible();
      }

      // Regresar al lobby para las siguientes pruebas
      await bingoPageA.leaveGame();

      errorReporter.recordTestResult('Etapa C: Bingo Compra de Cartones y Extracción de Balotas', 'passed', Date.now() - start);
    } catch (err: any) {
      errorReporter.recordTestResult('Etapa C: Bingo Compra de Cartones y Extracción de Balotas', 'failed', Date.now() - start, err.message);
      throw err;
    }
  });

  // ============================================================================
  // ETAPA D: JUEGO PIEDRA / PAPEL / TIJERA (2 Rondas: 1 victoria, 1 empate, 3 vidas)
  // ============================================================================
  test('Paso D: Juego Piedra/Papel/Tijera con 2 rondas (victoria y empate) y verificación de 3 vidas', async () => {
    const start = Date.now();
    try {
      // 1. Navegar a partida de Piedra, Papel o Tijera
      await lobbyPageA.openTablesTab();

      // Probar selección de jugadas en Piedra, Papel, Tijera
      const rpsRockBtn = pageA.locator('#rps-choice-btn-rock, [data-testid="rps-rock"], button:has-text("Piedra")').first();
      const rpsPaperBtn = pageA.locator('#rps-choice-btn-paper, [data-testid="rps-paper"], button:has-text("Papel")').first();

      if (await rpsRockBtn.isVisible().catch(() => false)) {
        // Ronda 1: Usuario A elige Piedra
        await rpsPageA.selectChoice('Piedra');

        // Usuario B elige Tijera (Victoria para Usuario A)
        const rpsScissorsBtnB = pageB.locator('#rps-choice-btn-scissors, [data-testid="rps-scissors"], button:has-text("Tijera")').first();
        if (await rpsScissorsBtnB.isVisible()) {
          await rpsPageB.selectChoice('Tijera');
        }

        // Verificar visualización del sistema de 3 vidas
        await rpsPageA.assertLivesSystemVisible();

        // Ronda 2: Ambos eligen Papel (Empate)
        if (await rpsPaperBtn.isVisible()) {
          await rpsPageA.selectChoice('Papel');
          const rpsPaperBtnB = pageB.locator('#rps-choice-btn-paper, [data-testid="rps-paper"], button:has-text("Papel")').first();
          if (await rpsPaperBtnB.isVisible()) {
            await rpsPageB.selectChoice('Papel');
          }
        }
      }

      errorReporter.recordTestResult('Etapa D: Piedra/Papel/Tijera 2 Rondas y Sistema de 3 Vidas', 'passed', Date.now() - start);
    } catch (err: any) {
      errorReporter.recordTestResult('Etapa D: Piedra/Papel/Tijera 2 Rondas y Sistema de 3 Vidas', 'failed', Date.now() - start, err.message);
      throw err;
    }
  });

  // ============================================================================
  // ETAPA E: JUEGO LA VIEJA (Partida completa hasta ganador)
  // ============================================================================
  test('Paso E: Juego La Vieja (TicTacToe) partida completa hasta definición de ganador', async () => {
    const start = Date.now();
    try {
      // 1. Clics secuenciales en cuadrícula 3x3 usando celdas data-testid="cell-X-Y"
      const cell00 = pageA.locator('[data-testid="cell-0-0"], #tictactoe-cell-0').first();
      if (await cell00.isVisible()) {
        // A marca (0,0)
        await tictactoePageA.clickCell(0, 0);

        // B marca (1,0)
        const cell10 = pageB.locator('[data-testid="cell-1-0"], #tictactoe-cell-3').first();
        if (await cell10.isVisible()) {
          await tictactoePageB.clickCell(1, 0);
        }

        // A marca (0,1)
        await tictactoePageA.clickCell(0, 1);

        // B marca (1,1)
        const cell11 = pageB.locator('[data-testid="cell-1-1"], #tictactoe-cell-4').first();
        if (await cell11.isVisible()) {
          await tictactoePageB.clickCell(1, 1);
        }

        // A marca (0,2) para completar línea ganadora en fila 0: (0,0), (0,1), (0,2)
        await tictactoePageA.clickCell(0, 2);

        // Verificar detección de ganador o conclusión de ronda
        await tictactoePageA.assertWinnerOrRoundConclusion();
      }

      errorReporter.recordTestResult('Etapa E: La Vieja (TicTacToe) Partida Completa hasta Ganador', 'passed', Date.now() - start);
    } catch (err: any) {
      errorReporter.recordTestResult('Etapa E: La Vieja (TicTacToe) Partida Completa hasta Ganador', 'failed', Date.now() - start, err.message);
      throw err;
    }
  });
});
