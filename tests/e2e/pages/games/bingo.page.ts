import { expect, type Page } from '@playwright/test';

export class BingoGamePage {
  constructor(public readonly page: Page) {}

  /**
   * Compra cartones para la partida de Bingo en curso
   */
  async buyCards(count: number = 1) {
    const buyBtn = count >= 3
      ? this.page.locator('#btn-buy-card-3, [data-testid="buy-card-btn-3"], button:has-text("+3 Cartones")').first()
      : this.page.locator('#btn-buy-card-1, [data-testid="buy-card-btn-1"], button:has-text("+1 Cartón"), button:has-text("COMPRAR")').first();

    await expect(buyBtn).toBeVisible({ timeout: 10000 });
    await buyBtn.click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Inicia el sorteo como anfitrión (Host)
   */
  async startDraw() {
    const startBtn = this.page.locator(
      'button:has-text("INICIAR SORTEO"), button:has-text("Iniciar Sorteo"), #host-draw-panel button.bg-amber-500'
    ).first();

    await expect(startBtn).toBeVisible({ timeout: 10000 });
    await startBtn.click();
  }

  /**
   * Verifica que el sistema esté extrayendo balotas activamente
   */
  async assertBallsDrawn() {
    // Verificar visibilidad de balotas sorteadas o panel de extracción
    const ballsContainer = this.page.locator(
      '#bingo-drawn-balls, [data-testid="drawn-ball"], #bingo-last-ball, .ball-drawn, text=Balotas Sorteadas, text=Balota'
    ).first();

    await expect(ballsContainer).toBeVisible({ timeout: 15000 });
  }

  async claimBingo() {
    const bingoBtn = this.page.locator('button:has-text("¡BINGO!"), button:has-text("BINGO")').first();
    await expect(bingoBtn).toBeVisible({ timeout: 10000 });
    await bingoBtn.click();
  }

  async leaveGame() {
    const leaveBtn = this.page.locator('button:has-text("Volver al Lobby")').first();
    if (await leaveBtn.isVisible()) {
      await leaveBtn.click();
    }
  }
}
