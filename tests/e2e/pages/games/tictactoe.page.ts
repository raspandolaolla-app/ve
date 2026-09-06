import { expect, type Page } from '@playwright/test';

export class TicTacToeGamePage {
  constructor(public readonly page: Page) {}

  /**
   * Clic en una celda de la cuadrícula usando coordenadas X, Y (0 a 2)
   */
  async clickCell(row: number, col: number) {
    const index = row * 3 + col;
    const cell = this.page.locator(
      `[data-testid="cell-${row}-${col}"], #tictactoe-cell-${index}`
    ).first();

    await expect(cell).toBeVisible({ timeout: 10000 });
    await cell.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Clic en una celda por su índice (0 a 8)
   */
  async clickCellByIndex(index: number) {
    const row = Math.floor(index / 3);
    const col = index % 3;
    await this.clickCell(row, col);
  }

  /**
   * Verifica que el tablero de La Vieja esté visible y activo
   */
  async assertBoardVisible() {
    const grid = this.page.locator('#tictactoe-grid, #tictactoe-board-container').first();
    await expect(grid).toBeVisible({ timeout: 10000 });
  }

  /**
   * Verifica la finalización de una ronda o de la partida
   */
  async assertWinnerOrRoundConclusion() {
    const statusBanner = this.page.locator(
      '#tictactoe-status-banner, text=¡RONDA GANADA, text=¡PARTIDA CONCLUIDA!, text=¡EMPATE EN EL TABLERO!'
    ).first();

    await expect(statusBanner).toBeVisible({ timeout: 15000 });
  }
}
