import { test, expect } from '@playwright/test';

test.describe('Poker Night E2E', () => {
  test('should create a tournament and see dashboard', async ({ page }) => {
    page.on('console', msg => console.log(`Console: ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`Error: ${err}`));
    
    await page.goto('/');
    
    await expect(page.locator('h1')).toContainText('POKER NIGHT');
    
    await page.click('text=Criar Torneio');
    
    await expect(page.locator('h1')).toContainText('Criar Torneio');
    
    const createBtn = page.locator('button:has-text("Criar Torneio")');
    await createBtn.click();
    
    await page.waitForURL(/\/tournament\/.*\?code=/, { timeout: 30000 });
    
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('text=HOST')).toBeVisible();
    
    await expect(page.locator('button:has-text("Jogadores")')).toBeVisible();
    await expect(page.locator('button:has-text("Timer")')).toBeVisible();
    await expect(page.locator('button:has-text("Ranking")')).toBeVisible();
    await expect(page.locator('button:has-text("Config")')).toBeVisible();
  });

  test('should add player to tournament', async ({ page }) => {
    await page.goto('/');
    
    await page.click('text=Criar Torneio');
    await page.click('button:has-text("Criar Torneio")');
    await page.waitForURL(/\/tournament\/.*\?code=/, { timeout: 30000 });
    
    await page.waitForSelector('input[placeholder="Nome do jogador"]');
    await page.fill('input[placeholder="Nome do jogador"]', 'João');
    await page.click('button:has-text("+")');
    
    await expect(page.locator('text=João')).toBeVisible();
  });

  test('should control timer', async ({ page }) => {
    await page.goto('/');
    
    await page.click('text=Criar Torneio');
    await page.click('button:has-text("Criar Torneio")');
    await page.waitForURL(/\/tournament\/.*\?code=/, { timeout: 30000 });
    
    await page.click('button:has-text("Timer")');
    
    await expect(page.locator('text=Nível')).toBeVisible();
    
    const startBtn = page.locator('button:has-text("Iniciar")');
    await expect(startBtn).toBeVisible();
    await startBtn.click();
    
    await expect(page.locator('button:has-text("Pausar")')).toBeVisible();
  });

  test('should join tournament with code', async ({ page, context }) => {
    const page1 = page;
    
    await page1.goto('/');
    await page1.click('text=Criar Torneio');
    await page1.click('button:has-text("Criar Torneio")');
    await page1.waitForURL(/\/tournament\/.*\?code=/, { timeout: 30000 });
    
    const url = page1.url();
    const codeMatch = url.match(/code=([A-Z0-9]+)/);
    const code = codeMatch?.[1] || '';
    
    await expect(page1.locator('text=HOST')).toBeVisible();
    
    const page2 = await context.newPage();
    await page2.goto('/');
    
    await page2.click('text=Entrar em Torneio');
    
    await page2.fill('input[placeholder="ABC123"]', code);
    await page2.fill('input[placeholder="Seu nome"]', 'Maria');
    await page2.click('text=Entrar');
    
    await page2.waitForURL(/\/tournament\/.*\?code=/, { timeout: 30000 });
    
    await expect(page2.locator('text=Maria')).toBeVisible();
  });

  test('should navigate config tab', async ({ page }) => {
    await page.goto('/');
    
    await page.click('text=Criar Torneio');
    await page.click('button:has-text("Criar Torneio")');
    await page.waitForURL(/\/tournament\/.*\?code=/, { timeout: 30000 });
    
    await page.click('button:has-text("Config")');
    
    await expect(page.locator('text=Configurações')).toBeVisible();
    await expect(page.locator('text=Buy-in')).toBeVisible();
  });

  test('should navigate ranking tab', async ({ page }) => {
    await page.goto('/');
    
    await page.click('text=Criar Torneio');
    await page.click('button:has-text("Criar Torneio")');
    await page.waitForURL(/\/tournament\/.*\?code=/, { timeout: 30000 });
    
    await page.click('button:has-text("Ranking")');
    
    await expect(page.locator('text=Ranking Final')).toBeVisible();
  });
});