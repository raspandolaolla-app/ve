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

test.describe('Tables Management & Creation - E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Interceptar llamadas de autenticación de Supabase para que el cliente SDK sepa que estamos autenticados
    await page.route('**/auth/v1/user*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '7ef4010b-80a5-48b4-8ee1-d2a932d80dff',
          email: 'test-user@raspando.ve',
          user_metadata: {
            full_name: 'Robot Test',
            avatar_url: null,
          },
          aud: 'authenticated',
          role: 'authenticated'
        })
      });
    });

    // Interceptar RPC de reconciliación de perfil
    await page.route('**/rest/v1/rpc/ensure_current_user_profile*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          profile: {
            id: '7ef4010b-80a5-48b4-8ee1-d2a932d80dff',
            first_name: 'Robot',
            last_name: 'Test',
            email: 'test-user@raspando.ve',
            account_status: 'active',
            kyc_status: 'approved'
          }
        })
      });
    });

    await page.goto('./');
    await page.evaluate((userData) => {
      window.localStorage.setItem('playwright-mock-auth', JSON.stringify(userData));
      
      const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjI1MjQ2MDgwMDAsInN1YiI6IjdlZjQwMTBiLTgwYTUtNDhiNC04ZWUxLWQyYTkzMmQ4MGRmZiIsImVtYWlsIjoidGVzdC11c2VyQHJhc3BhbmRvLnZlIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.mocksignature';
      
      const sbSession = {
        currentSession: {
          access_token: mockJwt,
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: {
            id: userData.user.id,
            email: userData.user.email,
            user_metadata: userData.user.user_metadata,
            aud: 'authenticated',
            role: 'authenticated'
          },
          expires_at: 2524608000
        },
        expiresAt: 2524608000
      };
      window.localStorage.setItem('sb-tncxgwycinbnkjbfwojt-auth-token', JSON.stringify(sbSession));
    }, MOCK_USER);
    await page.reload();
    await page.locator('#nav-trancaito').click();
  });

  test('Debe permitir abrir el modal de creación de mesa y configurar los campos', async ({ page }) => {
    const triggerBtn = page.locator('#btn-trigger-create-trancaito');
    await expect(triggerBtn).toBeVisible();
    await triggerBtn.click();

    // El modal de creación debe abrirse
    await expect(page.locator('h2:has-text("Crear Mesa")')).toBeVisible();

    // Rellenar datos
    const nameInput = page.locator('input[placeholder="Ej: Mesa de los panas"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Mesa de Pruebas E2E');

    // Cambiar monto de entrada haciendo click en un botón de monto predefinido
    const feeBtn = page.locator('button:has-text("100 Bs.")');
    await expect(feeBtn).toBeVisible();
    await feeBtn.click();

    // El monto personalizado debe actualizarse a 100
    const feeInput = page.locator('input[type="number"]').first();
    await expect(feeInput).toHaveValue('100');
  });

  test('La creación de mesa simulada por red debe responder correctamente en la UI', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[TABLES-CONSOLE] [${msg.type()}] ${msg.text()}`);
    });

    // Imprimir localStorage para depurar
    const storage = await page.evaluate(() => {
      return JSON.stringify(window.localStorage);
    });
    console.log(`[STORAGE-DEBUG] ${storage}`);

    // Interceptar la RPC de creación de mesa para simular base de datos real
    await page.route('**/rest/v1/rpc/create_game_table_secure*', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            table_id: 'table-mock-id-789',
            name: 'Mesa de Pruebas E2E',
            entry_fee: 100,
            invite_code: 'TRK-9999',
            created_at: new Date().toISOString()
          })
        });
      } else {
        await route.continue();
      }
    });

    // Interceptar la carga de jugadores para evitar errores de red en la mesa abierta
    await page.route('**/rest/v1/game_table_players*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Abrir modal
    await page.locator('#btn-trigger-create-trancaito').click();

    // Rellenar y enviar
    await page.locator('input[placeholder="Ej: Mesa de los panas"]').fill('Mesa de Pruebas E2E');
    
    // Seleccionar privacidad privada
    const privateCheckbox = page.locator('input[type="checkbox"]');
    if (!(await privateCheckbox.isChecked())) {
      await privateCheckbox.check();
    }

    const submitBtn = page.locator('button:has-text("Publicar Mesa")');
    await submitBtn.click();

    // Debe abrirse la sala de espera de la mesa creada
    await expect(page.locator('text=Mesa de Pruebas E2E')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=TRK-9999').first()).toBeVisible();
  });
});
