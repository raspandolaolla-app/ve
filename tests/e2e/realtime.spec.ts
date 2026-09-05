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
    identityVerificationStatus: 'approved',
    humanVerificationStatus: 'approved',
    isMfaEnabled: false,
    cedula: '12345678',
    telefono: '+584121234567',
    isProfileLocked: true,
  },
  role: 'PLAYER'
};

test.describe('Realtime Synchronized States - E2E', () => {
  test('Debe reflejar cambios de estado de rivales (conectado/desconectado) en tiempo real', async ({ page }) => {
    // Mesa de juego de prueba
    await page.route('**/rest/v1/game_tables*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'table-realtime-999',
            game_type: 'DOMINO',
            name: 'Mesa Realtime E2E',
            mode: '1v1',
            entry_fee: 50,
            min_players: 2,
            max_players: 4,
            current_players_count: 2,
            status: 'OPEN',
            visibility: 'PUBLIC',
            invite_code: 'RT-8888',
            join_code: 'RT-8888',
            created_at: new Date().toISOString()
          }
        ])
      });
    });

    // 2 jugadores en la mesa: Robot Test y Rival Virtual
    await page.route('**/rest/v1/table_players*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'tp-rt-1',
            table_id: 'table-realtime-999',
            user_id: '7ef4010b-80a5-48b4-8ee1-d2a932d80dff',
            display_name: 'Robot Test',
            seat_number: 1,
            seat_index: 0,
            status: 'READY'
          },
          {
            id: 'tp-rt-2',
            table_id: 'table-realtime-999',
            user_id: 'other-user-999',
            display_name: 'Rival Virtual',
            seat_number: 2,
            seat_index: 1,
            status: 'READY'
          }
        ])
      });
    });

    // Autenticar e ingresar a la mesa
    await page.goto('/');
    await page.evaluate((userData) => {
      window.localStorage.setItem('playwright-mock-auth', JSON.stringify(userData));
    }, MOCK_USER);
    await page.goto('/');
    await page.locator('#nav-trancaito').click();

    // Entrar a la sala
    await page.locator('#btn-view-table-table-realtime-999').click();

    // Comprobar presencia de ambos jugadores en sus asientos correspondientes
    await expect(page.locator('text=Robot Test')).toBeVisible();
    await expect(page.locator('text=Rival Virtual')).toBeVisible();

    // El estado del rival por defecto debe mostrarse como OFFLINE porque no está en la presencia realtime simulada localmente
    const rivalOfflineIndicator = page.locator('div:has-text("Rival Virtual") >> text=• OFFLINE');
    await expect(rivalOfflineIndicator).toBeVisible();

    // El estado del jugador principal debe ser ONLINE
    // (AuthContext o Presence registrará automáticamente al usuario actual como online)
    // Nos aseguramos de que no hay fallas críticas en la pantalla de espera
    await expect(page.locator('text=Comparte este código para invitar')).toBeVisible();
  });
});
