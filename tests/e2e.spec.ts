import { test, expect, Page } from '@playwright/test';

async function createTournamentAndNavigate(page: Page) {
  page.on('pageerror', err => console.error(`[pageerror] ${err}`));
  await page.goto('/');
  await expect(page.locator('h1').first()).toContainText('POKER NIGHT');
  await page.click('text=Criar Torneio');
  await page.click('button:has-text("Criar Torneio")');
  await page.waitForURL(/\/tournament\/.*\?code=/, { timeout: 30000 });
  await page.waitForSelector('button:has-text("Torneio")', { timeout: 15000 });
}

async function addPlayer(page: Page, name: string) {
  await page.waitForSelector('input[placeholder="Nome do jogador"]');
  await page.fill('input[placeholder="Nome do jogador"]', name);
  await page.click('button:has-text("+")');
  await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 10000 });
}

test.describe('Poker Night E2E', () => {

  // ── Landing & Dashboard ──

  test('create tournament and see all tabs', async ({ page }) => {
    await createTournamentAndNavigate(page);

    await expect(page.locator('text=HOST')).toBeVisible();

    for (const tab of ['Torneio', 'Timer', 'Ranking', 'Config', 'Extras', 'Acerto']) {
      await expect(page.locator(`button:has-text("${tab}")`)).toBeVisible();
    }
  });

  test('add player to tournament', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await addPlayer(page, 'João');
    await expect(page.locator('text=João').first()).toBeVisible();
    await expect(page.locator('text=Total Arrecadado')).toBeVisible();
    await expect(page.locator('text=R$ 20').first()).toBeVisible(); // Default buy-in is now 20
  });

  // ── Player actions: Rebuy & Addon ──

  test('rebuy player (single)', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await addPlayer(page, 'Carlos');

    await page.click('button:has-text("Rebuy")');

    await expect(page.locator('text=Rebuy — Carlos')).toBeVisible({ timeout: 5000 });
    await page.click('button:has-text("Simples")');

    await expect(page.locator('text=1x Rebuy')).toBeVisible({ timeout: 10000 });
  });

  test('rebuy player (double)', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await addPlayer(page, 'Ana');

    await page.click('button:has-text("Rebuy")');
    await page.click('button:has-text("Duplo")');

    await expect(page.locator('text=2x Rebuy')).toBeVisible({ timeout: 10000 });
  });

  test('addon player', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await addPlayer(page, 'Pedro');

    await page.click('button:has-text("+ Addon")');
    await expect(page.locator('span.bg-green-500')).toBeVisible({ timeout: 10000 });

    await page.click('button:has-text("Remover Addon")');
    await expect(page.locator('span.bg-green-500')).not.toBeVisible({ timeout: 10000 });
  });

  test('prize preview updates when player added', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await addPlayer(page, 'Lena');

    await expect(page.locator('text=🥇')).toBeVisible();
    await expect(page.locator('text=🥈')).toBeVisible();
    await expect(page.locator('text=🥉')).toBeVisible();
  });

  // ── Timer ──

  test('timer start / pause / skip / reset', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await page.click('button:has-text("Timer")');

    await expect(page.locator('text=Tabela de Blinds')).toBeVisible({ timeout: 10000 });

    const startBtn = page.locator('button:has-text("Iniciar")');
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    await expect(page.locator('button:has-text("Pausar")')).toBeVisible({ timeout: 5000 });

    await page.click('button:has-text("Pausar")');
    await expect(page.locator('button:has-text("Iniciar")')).toBeVisible({ timeout: 5000 });

    await page.click('button:has-text("Próx. Nível")');
    await expect(page.locator('text=2 / 27').first()).toBeVisible({ timeout: 10000 });

    // Reset now requires confirmation - setup dialog handler first
    page.on('dialog', dialog => dialog.accept());
    await page.click('button:has-text("↺")');
    await expect(page.locator('text=1 / 27').first()).toBeVisible({ timeout: 10000 });
  });

  test('timer shows progress bar and next blind', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await page.click('button:has-text("Timer")');

    const progressBar = page.locator('div.h-2.rounded-full.overflow-hidden');
    await expect(progressBar).toBeVisible();

    await expect(page.locator('text=Próximo:')).toBeVisible();
    await expect(page.locator('text=SB:')).toBeVisible();
    await expect(page.locator('text=BB:')).toBeVisible();
  });

  test('timer shows blinds table', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await page.click('button:has-text("Timer")');

    await expect(page.locator('text=Tabela de Blinds')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  // ── Config ──

  test('config tab shows all fields (host)', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await page.click('button:has-text("Config")');

    await expect(page.locator('text=Configurações')).toBeVisible();
    for (const label of ['Buy-in', 'Rebuy Simples', 'Rebuy Duplo', 'Addon', 'Minutos por Nível', 'Arredondamento']) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible();
    }
  });

  // ── Ranking ──

  test('ranking tab shows position selects for host', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await addPlayer(page, 'P1');
    await addPlayer(page, 'P2');
    await addPlayer(page, 'P3');

    await page.click('button:has-text("Ranking")');

    await expect(page.locator('text=Ranking Final')).toBeVisible();
    await expect(page.locator('text=🥇 Lugar')).toBeVisible();
    await expect(page.locator('text=🥈 Lugar')).toBeVisible();
    await expect(page.locator('text=🥉 Lugar')).toBeVisible();
    await expect(page.locator('label:has-text("Acordo")')).toBeVisible();
    await expect(page.locator('text=Premiação calculada')).toBeVisible();
  });

  test('ranking agreement selector works', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await page.click('button:has-text("Ranking")');

    const acordoSelect = page.locator('select').filter({ hasText: 'Sem acordo' });
    await expect(acordoSelect).toBeVisible();

    await acordoSelect.selectOption('icm');
    await expect(page.locator('text=Fichas de cada jogador')).toBeVisible();

    await acordoSelect.selectOption('manual');
    await expect(page.locator('text=Valor para cada jogador')).toBeVisible();
  });

  // ── Extras ──

  test('extras tab shows form and adds item', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await addPlayer(page, 'Bia');

    await page.click('button:has-text("Extras")');

    await expect(page.locator('text=Janta & Bebidas')).toBeVisible();
    await expect(page.locator('text=Total Extras')).toBeVisible();

    await page.fill('input[placeholder="Ex: Pizzas, Cervejas..."]', 'Pizza');
    await page.fill('input[placeholder="0.00"]', '80');

    await page.locator('label', { hasText: 'Bia' }).nth(1).click();

    await page.click('button:has-text("Adicionar Item")');

    await expect(page.locator('text=Pizza')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=R$ 80.00').first()).toBeVisible();
  });

  test('extras tab removes item', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await addPlayer(page, 'Guto');

    await page.click('button:has-text("Extras")');

    await page.fill('input[placeholder="Ex: Pizzas, Cervejas..."]', 'Cerveja');
    await page.fill('input[placeholder="0.00"]', '40');

    await page.locator('label', { hasText: 'Guto' }).nth(1).click();

    await page.click('button:has-text("Adicionar Item")');
    await expect(page.locator('text=Cerveja')).toBeVisible({ timeout: 10000 });

    await page.locator('button.text-\\[var\\(--danger\\)\\]').last().click();
    await expect(page.locator('text=Cerveja')).not.toBeVisible({ timeout: 10000 });
  });

  // ── Acerto ──

  test('acerto tab shows placeholder before tournament ends', async ({ page }) => {
    await createTournamentAndNavigate(page);
    await page.click('button:has-text("Acerto")');

    await expect(page.locator('text=Acerto de Contas')).toBeVisible();
    await expect(page.locator('text=Finalize o torneio')).toBeVisible();
  });

  // ── Join (multi-player) ──

  test('join tournament with code', async ({ page, context }) => {
    const page1 = page;
    await createTournamentAndNavigate(page1);

    const url = page1.url();
    const codeMatch = url.match(/code=([A-Z0-9]+)/);
    const code = codeMatch?.[1] ?? '';
    expect(code).not.toBe('');

    const page2 = await context.newPage();
    await page2.goto('/');
    await page2.click('text=Entrar em Torneio');
    await page2.fill('input[placeholder="ABC123"]', code);
    await page2.fill('input[placeholder="Seu nome"]', 'Maria');
    await page2.click('text=Entrar');
    await page2.waitForURL(/\/tournament\/.*\?code=/, { timeout: 30000 });

    await expect(page2.locator('text=Maria').first()).toBeVisible({ timeout: 15000 });
  });

  // ── View-only for players ──

  test('player cannot see add player form', async ({ page, context }) => {
    const page1 = page;
    await createTournamentAndNavigate(page1);

    const url = page1.url();
    const codeMatch = url.match(/code=([A-Z0-9]+)/);
    const code = codeMatch?.[1] ?? '';

    const page2 = await context.newPage();
    await page2.goto('/');
    await page2.click('text=Entrar em Torneio');
    await page2.fill('input[placeholder="ABC123"]', code);
    await page2.fill('input[placeholder="Seu nome"]', 'Visitante');
    await page2.click('text=Entrar');
    await page2.waitForURL(/\/tournament\/.*\?code=/, { timeout: 30000 });

    await expect(page2.locator('input[placeholder="Nome do jogador"]')).not.toBeVisible({ timeout: 10000 });
  });
});