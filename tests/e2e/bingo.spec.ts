import { test, expect } from '@playwright/test';

const MOCK_USER = {
  user: {
    id: '7ef4010b-80a5-48b4-8ee1-d2a932d80dff',
    email: 'test-user@raspando.ve',
    user_metadata: {
      full_name: 'Robot Test',
      avatar_url: null,
    }
  },
  session: {
    userId: '7ef4010b-80a5-48b4-8ee1-d2a932d80dff',
    email: 'test-user@raspando.ve',
    expiresAt: 9999999999,
  },
  profile: {
    id: '7ef4010b-80a5-48b4-8ee1-d2a932d80dff',
    firstName: 'Robot',
    lastName: 'Test',
    email: 'test-user@raspando.ve',
    accountStatus: 'active',
    identityVerificationStatus: 'pending',
    humanVerificationStatus: 'approved',
    isMfaEnabled: false,
  },
  role: 'PLAYER'
};

test.describe('Bingo Game Flow - E2E', () => {
  test('Debe interactuar con el tablero de Bingo, marcar números, ver avisos de proximidad de victoria y cantar bingo', async ({ page }) => {
    // Interceptar llamadas a game_tables para simular una mesa activa de Bingo
    await page.route('**/rest/v1/game_tables*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'table-bingo-111',
            game_type: 'BINGO',
            name: 'Sorteo de Bingo Virtual',
            mode: '1v1',
            entry_fee: 10,
            min_players: 2,
            max_players: 50,
            current_players_count: 5,
            status: 'ACTIVE',
            visibility: 'PUBLIC',
            invite_code: 'BNG-75',
            join_code: 'BNG-75',
            created_at: new Date().toISOString()
          }
        ])
      });
    });

    // Interceptar la consulta de jugadores de la mesa de Bingo
    await page.route('**/rest/v1/table_players*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'tp-bingo-1',
            table_id: 'table-bingo-111',
            user_id: '7ef4010b-80a5-48b4-8ee1-d2a932d80dff',
            display_name: 'Robot Test',
            seat_number: 1,
            seat_index: 0,
            status: 'READY'
          }
        ])
      });
    });

    // Interceptar el estado de la sesión de juego de Bingo para entregar un cartón mockeado
    // Queremos que el usuario tenga un cartón de BINGO 75 casi completo (a 1 balota de ganar)
    await page.route('**/rest/v1/game_sessions*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'session-bingo-111',
            table_id: 'table-bingo-111',
            status: 'IN_PROGRESS',
            state: {
              variant: '75',
              totalPoolBs: 100,
              playerNames: {
                '7ef4010b-80a5-48b4-8ee1-d2a932d80dff': 'Robot Test'
              },
              drawnBalls: [12, 24, 36, 48], // Bolas sorteadas
              cards: {
                '7ef4010b-80a5-48b4-8ee1-d2a932d80dff': [
                  {
                    b: [12, 1, 2, 3, 4],
                    i: [24, 25, 26, 27, 28],
                    n: [36, 37, 'FREE', 39, 40],
                    g: [48, 49, 50, 51, 52],
                    o: [60, 61, 62, 63, 64],
                    marked: [
                      [true, true, true, true, false], // Fila 1: 12, 24, 36, 48 marcados (drawnBalls). Falta el 60 (Fila 1 Columna 5). Está a 1 de ganar!
                      [false, false, false, false, false],
                      [false, false, false, false, false],
                      [false, false, false, false, false],
                      [false, false, false, false, false]
                    ]
                  }
                ]
              }
            }
          }
        ])
      });
    });

    // Autenticar e ingresar
    await page.goto('/');
    await page.evaluate((userData) => {
      window.localStorage.setItem('playwright-mock-auth', JSON.stringify(userData));
    }, MOCK_USER);
    await page.goto('/');
    await page.locator('#nav-trancaito').click();

    // Ver la mesa de Bingo y entrar
    const viewBtn = page.locator('#btn-view-table-table-bingo-111');
    await expect(viewBtn).toBeVisible({ timeout: 10000 });
    await viewBtn.click();

    // La interfaz del cartón de Bingo 75 debe renderizarse
    const bingoCard = page.locator('#bingo-card-75');
    await expect(bingoCard).toBeVisible();

    // El indicador de proximidad "⚠️ A 1 BALOTA" debe estar visible
    const proximidadLabel = page.locator('text=A 1 BALOTA');
    await expect(proximidadLabel).toBeVisible();

    // Debe mostrar el botón de Cantar Bingo
    const claimBtn = page.locator('#claim-bingo-btn');
    await expect(claimBtn).toBeVisible();
    await claimBtn.click();
  });
});
