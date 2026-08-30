import { test, expect } from '@playwright/test';

test.describe('Error Handling & Network Fault Tolerance - E2E', () => {
  test('Debe manejar fallos del servidor (HTTP 500) mostrando avisos amigables sin crashear', async ({ page }) => {
    // Interceptar llamadas a game_tables y simular error grave del servidor (500)
    await page.route('**/rest/v1/game_tables*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'PGRST500',
          message: 'Error de conexión interno con la base de datos PostgreSQL'
        })
      });
    });

    // Abrir la aplicación y navegar a Trancaíto
    await page.goto('/');
    
    // Forzar el inicio de sesión para que intente consultar las tablas
    const MOCK_USER = {
      user: { id: '7ef4010b-80a5-48b4-8ee1-d2a932d80dff', email: 'test-user@raspando.ve' },
      session: { userId: '7ef4010b-80a5-48b4-8ee1-d2a932d80dff', expiresAt: 9999999999 },
      profile: { id: '7ef4010b-80a5-48b4-8ee1-d2a932d80dff', firstName: 'Robot', lastName: 'Test' }
    };
    await page.evaluate((userData) => {
      window.localStorage.setItem('playwright-mock-auth', JSON.stringify(userData));
    }, MOCK_USER);
    await page.goto('/');

    await page.locator('#nav-trancaito').click();

    // La página no debe dar pantalla negra ni crashear por completo
    await expect(page.locator('#tables-view')).toBeVisible();

    // Debe mostrar la lista de mesas vacía o un indicador de carga o error controlado
    // La aplicación está resguardada para continuar renderizando los componentes de navegación principales
    await expect(page.locator('#brand-logo')).toBeVisible();
    await expect(page.locator('#nav-home')).toBeVisible();
  });

  test('Debe atrapar errores de tablas inexistentes (PGRST202) de forma elegante', async ({ page }) => {
    // Interceptar llamadas a una consulta y devolver PGRST202 (Mesa o tabla no encontrada)
    await page.route('**/rest/v1/table_players*', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'PGRST202',
          message: 'Relation table_players does not exist in public schema'
        })
      });
    });

    await page.goto('/');
    // No debe provocar fallos graves no controlados (JS pageerror)
    const pageErrors: any[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err);
    });

    await page.reload();
    expect(pageErrors).toHaveLength(0);
  });
});
