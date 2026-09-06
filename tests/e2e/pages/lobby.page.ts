import { expect, type Page } from '@playwright/test';

export interface CreateBingoTableOptions {
  variant?: '75' | '90';
  entryFee?: string;
  players?: string;
  isPrivate?: boolean;
}

export class LobbyPage {
  constructor(public readonly page: Page) {}

  async gotoLobby() {
    const navLobby = this.page.locator('#nav-lobby, [data-testid="nav-lobby"], button:has-text("Inicio")').first();
    if (await navLobby.isVisible()) {
      await navLobby.click();
    } else {
      await this.page.goto('./');
    }
  }

  async openBingoLobby() {
    const bingoBtn = this.page.locator('#nav-bingo, [data-testid="game-card-bingo"], button:has-text("Bingo"), div:has-text("BINGO 75 Y 90 BOLAS")').first();
    if (await bingoBtn.isVisible()) {
      await bingoBtn.click();
    }
  }

  async openTablesTab() {
    const tablesNav = this.page.locator('#nav-tables, #nav-trancaito, button:has-text("Mesas"), button:has-text("Trancaíto")').first();
    await expect(tablesNav).toBeVisible({ timeout: 10000 });
    await tablesNav.click();
  }

  /**
   * Abre el modal y crea una mesa de Bingo según especificaciones
   */
  async createBingoTable(options: CreateBingoTableOptions = {}) {
    const { variant = '90', entryFee = '25' } = options;

    // 1. Clic en botón "Crear Mesa"
    const createBtn = this.page.locator('button:has-text("Crear Mesa"), #btn-open-create-bingo').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // 2. Seleccionar variante (75 o 90 bolas)
    const variantBtn = this.page.locator(`#btn-variant-${variant}, button:has-text("${variant}")`).first();
    if (await variantBtn.isVisible()) {
      await variantBtn.click();
    }

    // 3. Establecer entrada / costo por cartón
    const feeInput = this.page.locator('#input-bingo-fee, input[type="number"]').first();
    if (await feeInput.isVisible()) {
      await feeInput.fill(entryFee);
    }

    // 4. Confirmar creación de mesa
    const submitBtn = this.page.locator('#btn-submit-create-bingo, button[type="submit"]:has-text("CREAR MESA")').first();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Esperar a que se procese la creación
    await this.page.waitForTimeout(500);
  }

  /**
   * Se une a una mesa disponible en el lobby o listado de mesas
   */
  async joinTable(tableNameOrId?: string) {
    let joinBtn = this.page.locator('button:has-text("Unirse"), button:has-text("Unirse Ahora")').first();
    if (tableNameOrId) {
      const targetCard = this.page.locator(`div:has-text("${tableNameOrId}")`).filter({ has: this.page.locator('button') }).first();
      if (await targetCard.isVisible()) {
        joinBtn = targetCard.locator('button:has-text("Unirse"), button:has-text("Unirse Ahora")').first();
      }
    }

    await expect(joinBtn).toBeVisible({ timeout: 10000 });
    await joinBtn.click();
  }
}
