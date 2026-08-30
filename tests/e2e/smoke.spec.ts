import { test, expect } from '@playwright/test';

test.describe('Smoke Tests - Raspando La Olla', () => {
  test('La WebApp debe cargar, renderizar correctamente y no mostrar errores JavaScript', async ({ page }) => {
    const errors: any[] = [];
    const consoleErrors: string[] = [];

    // Interceptar errores de JS y errores graves de consola
    page.on('pageerror', (err) => {
      errors.push(err);
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignorar warnings externos y errores de carga de recursos de red (debido a falta de keys de Supabase o mocks)
        if (
          !text.includes('__cf_bm') && 
          !text.includes('chrome-extension') &&
          !text.includes('Failed to load resource') &&
          !text.includes('supabase')
        ) {
          consoleErrors.push(text);
        }
      }
    });

    // Interceptar solicitudes fallidas graves de red (>= 500)
    page.on('response', (response) => {
      if (response.status() >= 500) {
        errors.push(new Error(`La solicitud a ${response.url()} devolvió HTTP ${response.status()}`));
      }
    });

    // Abrir la aplicación
    await page.goto('./');

    // 1. Comprobar que el título cargue y sea correcto
    await expect(page).toHaveTitle(/Raspando/i);

    // 2. Comprobar que no hay pantalla negra (verificar contenido visual real)
    const brandLogo = page.locator('#brand-logo');
    await expect(brandLogo).toBeVisible({ timeout: 10000 });

    const lobbyView = page.locator('#lobby-view');
    await expect(lobbyView).toBeVisible();

    // 3. Comprobar que el botón de inicio de sesión de Google esté presente
    const loginBtn = page.locator('#header-signin-google-btn');
    await expect(loginBtn).toBeVisible();

    // 4. Comprobar que no se lanzaron excepciones no controladas ni errores HTTP >= 500
    expect(errors, `Se detectaron errores críticos durante la carga: ${errors.map(e => e.message).join(', ')}`).toHaveLength(0);
    expect(consoleErrors, `Se detectaron errores graves en consola: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });
});
