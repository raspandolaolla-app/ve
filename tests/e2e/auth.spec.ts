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

test.describe('Authentication Flows - E2E', () => {
  test('Usuario no autenticado debe ver botón para continuar con Google', async ({ page }) => {
    await page.goto('./');
    const loginBtn = page.locator('#header-signin-google-btn');
    await expect(loginBtn).toBeVisible();
    await expect(loginBtn).toContainText('INGRESAR');
  });

  test('Autenticación mediante Mock Auth y persistencia tras recarga', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
    });

    page.on('requestfailed', (req) => {
      console.log(`[BROWSER REQUEST FAILED] ${req.url()} - ${req.failure()?.errorText}`);
    });

    // 1. Navegar a la página para establecer el origen
    await page.goto('./');

    // 2. Inyectar la autenticación mock en localStorage
    await page.evaluate((userData) => {
      window.localStorage.setItem('playwright-mock-auth', JSON.stringify(userData));
    }, MOCK_USER);

    // 3. Recargar para que React monte con el mock auth ya establecido
    await page.reload();

    const storageVal = await page.evaluate(() => window.localStorage.getItem('playwright-mock-auth'));
    console.log(`[TEST MOCK AUTH STORAGE LOG] ${storageVal}`);

    // Comprobar que aparece el botón de perfil con el nombre del usuario
    const profileBtn = page.locator('#header-user-profile-btn');
    await expect(profileBtn).toBeVisible({ timeout: 15000 });
    await expect(profileBtn).toContainText('Robot Test');

    // Comprobar que no se pierde el estado al recargar de nuevo
    await page.reload();
    await expect(profileBtn).toBeVisible({ timeout: 10000 });
  });

  test('El cierre de sesión debe restaurar el estado no autenticado', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
    });

    // 1. Navegar a la página para establecer el origen
    await page.goto('./');

    // 2. Inyectar la autenticación mock
    await page.evaluate((userData) => {
      window.localStorage.setItem('playwright-mock-auth', JSON.stringify(userData));
    }, MOCK_USER);

    // 3. Recargar para entrar como autenticado
    await page.reload();

    // Cerrar sesión
    const logoutBtn = page.locator('#header-signout-btn');
    await expect(logoutBtn).toBeVisible({ timeout: 15000 });
    await logoutBtn.click();

    // El botón de inicio de sesión de Google debe volver a ser visible
    const loginBtn = page.locator('#header-signin-google-btn');
    await expect(loginBtn).toBeVisible({ timeout: 10000 });
  });
});
