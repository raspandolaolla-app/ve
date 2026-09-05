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
    // 1. Si ya estamos en la vista de mesas, no es necesario hacer nada
    if (await this.page.locator('#tables-view').first().isVisible().catch(() => false)) {
      return;
    }

    // 2. Si hay pantalla de juego activa, salir al lobby
    const leaveGameBtn = this.page.locator('#btn-leave-bingo-game, #btn-game-header-back, button:has-text("Volver al Lobby"), button[title="Volver"]').first();
    if (await leaveGameBtn.isVisible().catch(() => false)) {
      await leaveGameBtn.click().catch(() => {});
      await this.page.waitForTimeout(300);
    }

    // 3. Si hay un modal abierto o vista superpuesta, cerrarla primero
    const closeBtn = this.page.locator('button[aria-label="Cerrar"], button:has-text("Cerrar"), button:has-text("Salir de la mesa"), button[title="Cerrar"]').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click().catch(() => {});
      await this.page.waitForTimeout(300);
    }

    if (await this.page.locator('#tables-view').first().isVisible().catch(() => false)) {
      return;
    }

    const tablesNav = this.page.locator('#nav-trancaito, #nav-tables, button:has-text("Mesas & Salas"), button:has-text("Mesas"), button:has-text("Trancaíto"), #bottom-nav-quick-match').first();
    if (await tablesNav.isVisible().catch(() => false)) {
      await tablesNav.click();
    } else {
      await this.gotoLobby();
      const retryNav = this.page.locator('#nav-trancaito, #nav-tables, button:has-text("Mesas & Salas"), button:has-text("Mesas"), button:has-text("Trancaíto"), #bottom-nav-quick-match').first();
      if (await retryNav.isVisible().catch(() => false)) {
        await retryNav.click();
      }
    }
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

    // 1.1 Asegurar que el juego seleccionado sea Bingo
    const gameSelect = this.page.locator('#select-create-game-type, select:has-text("Bingo"), select').first();
    if (await gameSelect.isVisible()) {
      await gameSelect.selectOption('bingo');
    }

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
    // Si no hay mesa visible de inmediato, intentar pulsar "Refrescar mesas"
    const refreshBtn = this.page.locator('button:has-text("Refrescar mesas"), button[title="Refrescar"]').first();
    if (await refreshBtn.isVisible().catch(() => false)) {
      await refreshBtn.click().catch(() => {});
      await this.page.waitForTimeout(300);
    }

    let joinBtn = this.page.locator('button[id^="btn-view-table-"], button:not(#btn-submit-join-code):has-text("Ingresar a la Sala"), button:not(#btn-submit-join-code):has-text("Ver Mesa")').first();
    if (tableNameOrId) {
      const targetCard = this.page.locator(`div:has-text("${tableNameOrId}")`).filter({ has: this.page.locator('button') }).first();
      if (await targetCard.isVisible().catch(() => false)) {
        joinBtn = targetCard.locator('button[id^="btn-view-table-"], button:not(#btn-submit-join-code):has-text("Ingresar a la Sala"), button:not(#btn-submit-join-code):has-text("Ver Mesa")').first();
      }
    }

    if (await joinBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await joinBtn.click();
    }

    // Si se abre el modal de la mesa para seleccionar asiento, ocupar un asiento libre
    const takeSeatBtn = this.page.locator('button:has-text("Tomar Asiento")').first();
    if (await takeSeatBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await takeSeatBtn.click().catch(() => {});
    }
  }
}
