import { test, expect, devices } from '@playwright/test';

// Forzar la simulación de un dispositivo móvil moderno
test.use({ ...devices['iPhone 13'] });

test.describe('Mobile Viewport & Touch Responsiveness - E2E', () => {
  test('La WebApp debe adaptarse al viewport móvil y mostrar controles táctiles accesibles', async ({ page }) => {
    await page.goto('/');

    // 1. El logo y el título principal deben ser visibles
    await expect(page.locator('#brand-logo')).toBeVisible();

    // 2. Comprobar que los elementos de navegación superior se ocultan o transforman para pantallas pequeñas
    // En diseño móvil, las pestañas superiores o el menú inferior suelen renderizarse de forma amigable.
    // Comprobamos que el botón de inicio de sesión de Google siga siendo completamente visible y clickeable
    const loginBtn = page.locator('#header-signin-google-btn');
    await expect(loginBtn).toBeVisible();

    // Comprobar la altura/ancho para asegurar un touch target cómodo (>= 40px - 44px)
    const boundingBox = await loginBtn.boundingBox();
    if (boundingBox) {
      expect(boundingBox.height).toBeGreaterThanOrEqual(40);
    }

    // 3. Comprobar que no hay barra de desplazamiento horizontal descontrolada
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBeFalsy();
  });
});
