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

test.describe('Lobby View & Navigation - E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.evaluate((userData) => {
      window.localStorage.setItem('playwright-mock-auth', JSON.stringify(userData));
    }, MOCK_USER);
    await page.reload();
  });

  test('Debe cargar el Lobby, mostrar juegos soportados y navegar entre pestañas', async ({ page }) => {
    // 1. Verificar presencia de elementos en el Lobby
    await expect(page.locator('#lobby-view')).toBeVisible();
    await expect(page.locator('text=Selecciona tu juego o participa')).toBeVisible();

    // 2. Navegar a la sección de Polla Venezolana
    const navPolla = page.locator('#nav-polla');
    await expect(navPolla).toBeVisible();
    await navPolla.click();
    await expect(page.locator('h2:has-text("POLLA VENEZOLANA")')).toBeVisible();

    // 3. Navegar a la sección de Trancaíto (Mesas)
    const navTrancaito = page.locator('#nav-trancaito');
    await expect(navTrancaito).toBeVisible();
    await navTrancaito.click();
    await expect(page.locator('text=Código de Mesa Privada')).toBeVisible();

    // 4. Navegar a la Billetera (Wallet)
    const navWallet = page.locator('#nav-wallet');
    await expect(navWallet).toBeVisible();
    await navWallet.click();
    await expect(page.locator('text=Mi Billetera')).toBeVisible({ timeout: 15000 });

    // 5. Navegar al perfil (haciendo click en el botón de usuario del Header)
    const profileBtn = page.locator('#header-user-profile-btn');
    await expect(profileBtn).toBeVisible();
    await profileBtn.click();
    await expect(page.locator('text=Datos Personales').first()).toBeVisible({ timeout: 15000 });

    // Regresar al Lobby haciendo click en el logo
    await page.locator('#brand-logo').click();
    await expect(page.locator('#lobby-view')).toBeVisible();
  });
});
