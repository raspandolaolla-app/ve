import { expect, type Page } from '@playwright/test';

export interface MockUserData {
  id: string;
  email: string;
  fullName: string;
  cedula?: string;
  telefono?: string;
  isProfileLocked?: boolean;
}

export interface OnboardingData {
  cedula: string;
  telefono: string;
  nombre: string;
  fechaNacimiento: string;
  estado: string;
}

export class AuthPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('./');
  }

  async verifyUnauthenticated() {
    const loginBtn = this.page.locator('#header-signin-google-btn, button:has-text("INGRESAR")');
    await expect(loginBtn.first()).toBeVisible({ timeout: 10000 });
  }

  /**
   * Inyecta sesión autenticada mockeada para emular Google OAuth sin dependencias externas
   */
  async loginWithMockGoogle(user: MockUserData, needsOnboarding = false) {
    // Interceptar llamadas de usuario de Supabase
    await this.page.route('**/auth/v1/user*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          user_metadata: {
            full_name: user.fullName,
            avatar_url: null,
          },
          aud: 'authenticated',
          role: 'authenticated',
        }),
      });
    });

    // Interceptar RPC de reconciliación
    await this.page.route('**/rest/v1/rpc/ensure_current_user_profile*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          profile: {
            id: user.id,
            first_name: user.fullName.split(' ')[0],
            last_name: user.fullName.split(' ').slice(1).join(' '),
            email: user.email,
            cedula: needsOnboarding ? '' : (user.cedula || '12345678'),
            telefono: needsOnboarding ? '' : (user.telefono || '+584121234567'),
            is_profile_locked: !needsOnboarding,
            account_status: 'ACTIVE',
            kyc_status: 'approved',
          },
        }),
      });
    });

    const mockPayload = {
      user: {
        id: user.id,
        email: user.email,
        user_metadata: {
          full_name: user.fullName,
          avatar_url: null,
        },
      },
      session: {
        userId: user.id,
        email: user.email,
        expiresAt: 2524608000,
      },
      profile: {
        id: user.id,
        firstName: user.fullName.split(' ')[0],
        lastName: user.fullName.split(' ').slice(1).join(' '),
        email: user.email,
        accountStatus: 'active',
        identityVerificationStatus: 'approved',
        humanVerificationStatus: 'approved',
        isMfaEnabled: false,
        cedula: needsOnboarding ? '' : (user.cedula || '12345678'),
        telefono: needsOnboarding ? '' : (user.telefono || '+584121234567'),
        isProfileLocked: !needsOnboarding,
      },
      role: 'PLAYER',
    };

    await this.page.goto('./');
    await this.page.evaluate((mockData) => {
      window.localStorage.setItem('playwright-mock-auth', JSON.stringify(mockData));

      const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjI1MjQ2MDgwMDAsInN1YiI6Ijc...mocksignature';
      const sbSession = {
        currentSession: {
          access_token: mockJwt,
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: {
            id: mockData.user.id,
            email: mockData.user.email,
            user_metadata: mockData.user.user_metadata,
            aud: 'authenticated',
            role: 'authenticated',
          },
          expires_at: 2524608000,
        },
        expiresAt: 2524608000,
      };
      window.localStorage.setItem('sb-tncxgwycinbnkjbfwojt-auth-token', JSON.stringify(sbSession));
    }, mockPayload);

    await this.page.reload();
  }

  /**
   * Completa el modal obligatorio de perfilado estricto (Onboarding)
   */
  async completeOnboarding(data: OnboardingData) {
    // 1. Localizar los campos usando selectores resilientes (data-testid, placeholder o etiquetas)
    const cedulaInput = this.page.locator('[data-testid="onboarding-cedula"], input[placeholder*="cédula" i], input[placeholder*="12345678"]').first();
    const telefonoInput = this.page.locator('[data-testid="onboarding-telefono"], input[placeholder*="teléfono" i], input[placeholder*="0414"]').first();
    const nombreInput = this.page.locator('[data-testid="onboarding-nombre"], input[placeholder*="nombres" i], input[placeholder*="COMPLETOS" i]').first();
    const fechaInput = this.page.locator('[data-testid="onboarding-fecha-nacimiento"], input[type="date"]').first();
    const estadoSelect = this.page.locator('[data-testid="onboarding-estado"], select').first();
    const submitBtn = this.page.locator('[data-testid="onboarding-submit"], button:has-text("CONFIRMAR Y GUARDAR"), button:has-text("Guardar")').first();

    await expect(cedulaInput).toBeVisible({ timeout: 10000 });

    await cedulaInput.fill(data.cedula);
    await telefonoInput.fill(data.telefono);
    await nombreInput.fill(data.nombre);
    await fechaInput.fill(data.fechaNacimiento);
    await estadoSelect.selectOption({ label: data.estado }).catch(() => estadoSelect.selectOption(data.estado));

    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Esperar a que el modal de onboarding se cierre y desaparezca
    await expect(cedulaInput).not.toBeVisible({ timeout: 10000 });
  }

  async assertAuthenticated() {
    const userMenuOrWallet = this.page.locator('#header-user-menu-btn, #header-wallet-balance-btn, #header-user-info, [data-testid="user-profile-badge"]').first();
    await expect(userMenuOrWallet).toBeVisible({ timeout: 10000 });
  }
}
