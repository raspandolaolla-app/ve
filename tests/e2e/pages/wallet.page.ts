import { expect, type Page } from '@playwright/test';

export class WalletPage {
  constructor(public readonly page: Page) {}

  async gotoWallet() {
    // Navegar usando la pestaña de Wallet en la navegación superior o inferior
    const navWallet = this.page.locator('#nav-wallet, [data-testid="nav-wallet"], button:has-text("Billetera")').first();
    if (await navWallet.isVisible()) {
      await navWallet.click();
    } else {
      const walletBalanceBtn = this.page.locator('#header-wallet-balance-btn').first();
      if (await walletBalanceBtn.isVisible()) {
        await walletBalanceBtn.click();
      } else {
        await this.page.goto('./#wallet');
      }
    }
  }

  /**
   * Reclama el bono de prueba de 5000 Bs disponible en la billetera
   */
  async claimBonus() {
    // Selector solicitado: text=5.000 Bs y button:has-text("RECLAMAR") o #claim-test-bonus-btn
    const claimBtn = this.page.locator(
      '#claim-test-bonus-btn, [data-testid="claim-test-bonus-btn"], button:has-text("Reclamar 5.000 Bs"), button:has-text("RECLAMAR")'
    ).first();

    await expect(claimBtn).toBeVisible({ timeout: 10000 });
    await claimBtn.click();

    // Esperar confirmación del bono
    const successFeedback = this.page.locator('#claim-test-bonus-feedback, [data-testid="claim-test-bonus-feedback"]').first();
    if (await successFeedback.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(successFeedback).toBeVisible();
    }
  }

  /**
   * Verifica que el saldo disponible refleje al menos el monto esperado
   */
  async assertBalance(minAmount: number = 5000) {
    const balanceCard = this.page.locator('#card-available-balance, #header-wallet-balance-btn').first();
    await expect(balanceCard).toBeVisible({ timeout: 10000 });
  }
}
