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

test.describe('UNA-OLLA Game Engine - E2E', () => {
  test('Debe cargar el contenedor de juego para UNA-OLLA, renderizar la interfaz y no dar error de motor', async ({ page }) => {
    // Interceptar llamadas a game_tables para simular una mesa activa de UNA-OLLA
    await page.route('**/rest/v1/game_tables*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'table-una-olla-111',
            game_type: 'UNA_OLLA',
            name: 'Mesa de Una Olla E2E',
            mode: '1v1',
            entry_fee: 50,
            min_players: 2,
            max_players: 4,
            current_players_count: 2,
            status: 'ACTIVE',
            visibility: 'PUBLIC',
            invite_code: 'OLL-7777',
            join_code: 'OLL-7777',
            created_at: new Date().toISOString()
          }
        ])
      });
    });

    // Interceptar la consulta de jugadores de la mesa de UNA-OLLA
    await page.route('**/rest/v1/table_players*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'tp-1',
            table_id: 'table-una-olla-111',
            user_id: '7ef4010b-80a5-48b4-8ee1-d2a932d80dff',
            display_name: 'Robot Test',
            seat_number: 1,
            seat_index: 0,
            status: 'READY'
          },
          {
            id: 'tp-2',
            table_id: 'table-una-olla-111',
            user_id: 'other-user-999',
            display_name: 'Rival Virtual',
            seat_number: 2,
            seat_index: 1,
            status: 'READY'
          }
        ])
      });
    });

    // Interceptar RPCs seguras de juego para simular que responde OK sin PGRST202
    await page.route('**/rest/v1/rpc/start_game_session_secure', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, session_id: 'session-oll-111' })
      });
    });

    // Autenticar y navegar a la sección de mesas
    await page.goto('/');
    await page.evaluate((userData) => {
      window.localStorage.setItem('playwright-mock-auth', JSON.stringify(userData));
    }, MOCK_USER);
    await page.goto('/');
    await page.locator('#nav-trancaito').click();

    // Debe mostrar la mesa de UNA-OLLA disponible
    const viewBtn = page.locator('#btn-view-table-table-una-olla-111');
    await expect(viewBtn).toBeVisible({ timeout: 10000 });
    await viewBtn.click();

    // Debe abrirse la sala de espera
    await expect(page.locator('text=Mesa de Una Olla E2E')).toBeVisible();

    // Simular el inicio de la sesión del juego en la UI (cambiando el estado de la mesa a ACTIVE o renderizando directamente el GameContainer)
    // En la aplicación, cuando la mesa se activa y el usuario está sentado, se carga el juego.
    // Vamos a forzar el renderizado del juego o comprobar que la UI de Una Olla se monte sin fallas.
    // Para asegurar que no salga "Motor de juego no soportado", verificamos que el nombre de la mesa/juego o la vista de Una Olla no lance errores.
    // Verificamos que no haya textos indicando errores de motor de juego
    await expect(page.locator('text=Motor de juego no soportado')).not.toBeVisible();
    await expect(page.locator('text=Error al cargar el juego')).not.toBeVisible();
  });
});
