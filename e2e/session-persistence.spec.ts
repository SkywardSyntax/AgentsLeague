import { test, expect } from '@playwright/test';

test.describe('Session Persistence Across Page Reload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?mode=interactive');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.evaluate(() => localStorage.clear());
  });

  test('chat messages survive page reload', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="chat-send"]');

    // Send a message
    await chatInput.fill('persistence test message');
    await sendBtn.click();

    // Wait for user message to appear
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 10_000,
    });

    // Wait for assistant reply
    await expect(page.locator('[data-testid="chat-message-assistant"]').first()).toBeVisible({
      timeout: 15_000,
    });

    // Wait for status to return to Ready (turn complete)
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });

    // Wait for the debounced save (500ms + margin)
    await page.waitForTimeout(1500);

    // Verify localStorage has data
    const hasData = await page.evaluate(() => {
      const key = 'agentsleague:session:v1';
      return localStorage.getItem(key) !== null;
    });
    expect(hasData).toBe(true);

    // Reload the page
    await page.reload();
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible({ timeout: 10_000 });

    // Assert messages are still visible after reload
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[data-testid="chat-message-assistant"]').first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify the user message text survived
    const userMsg = page.locator('[data-testid="chat-message-user"]').first();
    await expect(userMsg).toContainText('persistence test message');
  });

  test('multiple chats persist across reload with correct active chat', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="chat-send"]');

    // Send a message in the first chat
    await chatInput.fill('first chat message');
    await sendBtn.click();
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });

    // Create a new chat via the + New Chat button
    const newChatBtn = page.getByRole('button', { name: '+ New Chat' });
    await newChatBtn.click();

    // The new chat should be empty
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(0);

    // Send a message in the second chat
    await chatInput.fill('second chat message');
    await sendBtn.click();
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });

    // Wait for debounced save
    await page.waitForTimeout(1500);

    // Count chat tab buttons before reload (exclude "+ New Chat")
    const chatTabCountBefore = await page.evaluate(() => {
      const tabContainer = document.querySelector('[data-testid="chat-panel"] .scrollbar-thin');
      if (!tabContainer) return 0;
      const buttons = tabContainer.querySelectorAll('button');
      // Last button is "+ New Chat", rest are chat tabs
      return buttons.length - 1;
    });
    expect(chatTabCountBefore).toBe(2);

    // Reload
    await page.reload();
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible({ timeout: 10_000 });

    // Both chats should appear in the tab bar after reload
    const chatTabCountAfter = await page.evaluate(() => {
      const tabContainer = document.querySelector('[data-testid="chat-panel"] .scrollbar-thin');
      if (!tabContainer) return 0;
      const buttons = tabContainer.querySelectorAll('button');
      return buttons.length - 1;
    });
    expect(chatTabCountAfter).toBe(2);

    // The active chat (second one) should show its message
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toContainText(
      'second chat message',
    );
  });

  test('cleared localStorage produces fresh empty chat without crash', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="chat-send"]');

    // Send a message first so there's data
    await chatInput.fill('data to be cleared');
    await sendBtn.click();
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });

    // Wait for debounced save
    await page.waitForTimeout(1500);

    // Clear localStorage before reload
    await page.evaluate(() => localStorage.clear());

    // Reload
    await page.reload();
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible({ timeout: 10_000 });

    // Should start with a fresh empty state — no messages
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toHaveCount(0);

    // App should be functional: status is Ready
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready');

    // Input should be enabled and the app is usable
    await expect(chatInput).toBeEnabled();
  });
});
