import { expect, type Page } from '@playwright/test';

export type RPSChoice = 'Piedra' | 'Papel' | 'Tijera';

export class RockPaperScissorsGamePage {
  constructor(public readonly page: Page) {}

  /**
   * Realiza la elección de jugada: Piedra, Papel o Tijera
   */
  async selectChoice(choice: RPSChoice) {
    const selector = choice === 'Piedra'
      ? '#rps-choice-btn-rock, [data-testid="rps-rock"], button:has-text("Piedra")'
      : choice === 'Papel'
      ? '#rps-choice-btn-paper, [data-testid="rps-paper"], button:has-text("Papel")'
      : '#rps-choice-btn-scissors, [data-testid="rps-scissors"], button:has-text("Tijera")';

    const choiceBtn = this.page.locator(selector).first();
    await expect(choiceBtn).toBeVisible({ timeout: 10000 });
    await choiceBtn.click();
  }

  /**
   * Verifica la presencia y estado del sistema de 3 vidas
   */
  async assertLivesSystemVisible() {
    const livesDisplay = this.page.locator(
      '#rps-lives-display, :has-text("Tus Vidas"), :has-text("Rival"), svg.lucide-heart, [data-testid="player-lives"]'
    ).first();

    await expect(livesDisplay).toBeVisible({ timeout: 10000 });
  }

  /**
   * Verifica el resultado de la ronda (Ganaste, Perdiste o Empate)
   */
  async assertRoundResult(expectedResultText?: 'GANASTE' | 'EMPATE' | 'PERDISTE') {
    const arenaResult = this.page.locator('#rps-duel-arena, :has-text("¡EMPATE!"), :has-text("¡GANASTE!"), :has-text("PERDISTE")').first();
    await expect(arenaResult).toBeVisible({ timeout: 10000 });

    if (expectedResultText) {
      const matchLocator = this.page.locator(`:has-text("${expectedResultText}")`).first();
      await expect(matchLocator).toBeVisible({ timeout: 10000 });
    }
  }

  /**
   * Espera a que termine la partida o aparezca pantalla de game over
   */
  async assertGameOver() {
    const gameOverScreen = this.page.locator('#rps-game-over-screen, :has-text("PARTIDA"), :has-text("🏆")').first();
    await expect(gameOverScreen).toBeVisible({ timeout: 10000 });
  }
}
