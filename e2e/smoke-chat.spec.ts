import { test, expect } from '@playwright/test';

test.describe('Chat Mode Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?mode=interactive');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.evaluate(() => localStorage.clear());
  });

  test('homepage loads with chat panel visible', async ({ page }) => {
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready');
  });

  test('chat input field is focusable and accepts text', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.click();
    await chatInput.fill('Hello');
    await expect(chatInput).toHaveValue('Hello');
  });

  test('sending a message adds it to the message list', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="chat-send"]');

    await chatInput.fill('What is 2+2?');
    await sendBtn.click();

    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toContainText(
      'What is 2+2?',
    );
  });

  test('status transitions through non-idle state on send', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="chat-send"]');

    await chatInput.fill('draw something');
    await sendBtn.click();

    // Status should leave Ready during processing
    await expect(page.locator('[data-testid="status-label"]')).not.toHaveText('Ready', {
      timeout: 5_000,
    });

    // Then return to Ready
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });
  });

  test('assistant response appears after sending', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="chat-send"]');

    await chatInput.fill('explain gravity');
    await sendBtn.click();

    // Wait for status to return to idle
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });

    // At least one assistant message should exist
    await expect(page.locator('[data-testid="chat-message-assistant"]').first()).toBeVisible();
  });

  test('whiteboard canvas is visible alongside chat panel', async ({ page }) => {
    await expect(page.locator('[data-testid="whiteboard-canvas"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();
  });

  test('creating a new chat session works', async ({ page }) => {
    const newChatBtn = page.getByRole('button', { name: '+ New Chat' });
    await newChatBtn.click();

    // Should now have 2 chat tabs
    const chatTabCount = await page.evaluate(() => {
      const tabContainer = document.querySelector('[data-testid="chat-panel"] .scrollbar-thin');
      if (!tabContainer) return 0;
      const buttons = tabContainer.querySelectorAll('button');
      return buttons.length - 1; // last is "+ New Chat"
    });
    expect(chatTabCount).toBe(2);

    // New chat should have no messages
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toHaveCount(0);
  });

  test('switching between chat sessions preserves messages', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="chat-send"]');

    // Send message in chat 1
    await chatInput.fill('first chat hello');
    await sendBtn.click();
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });

    // Create chat 2
    const newChatBtn = page.getByRole('button', { name: '+ New Chat' });
    await newChatBtn.click();

    // Chat 2 should be empty
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(0);

    // Send message in chat 2
    await chatInput.fill('second chat hello');
    await sendBtn.click();
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });

    // Switch back to chat 1 (it appears second in the tab bar because new chats prepend)
    const tabContainer = page.locator('[data-testid="chat-panel"] .scrollbar-thin');
    const chatTabs = tabContainer.locator('button').filter({ hasNot: page.locator('text="+ New Chat"') });
    // Chat 1 is the second tab (new chats are prepended)
    await chatTabs.nth(1).click();

    // Chat 1's user message should still be present
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toContainText(
      'first chat hello',
    );
  });

  test('deleting a chat session removes it from the list', async ({ page }) => {
    // Create a second chat
    const newChatBtn = page.getByRole('button', { name: '+ New Chat' });
    await newChatBtn.click();

    // Verify 2 chat tabs
    const countBefore = await page.evaluate(() => {
      const tabContainer = document.querySelector('[data-testid="chat-panel"] .scrollbar-thin');
      if (!tabContainer) return 0;
      const buttons = tabContainer.querySelectorAll('button');
      return buttons.length - 1;
    });
    expect(countBefore).toBe(2);

    // Delete the active chat
    const deleteBtn = page.getByRole('button', { name: 'Delete Chat' });
    await deleteBtn.click();

    // Should now have 1 chat tab
    const countAfter = await page.evaluate(() => {
      const tabContainer = document.querySelector('[data-testid="chat-panel"] .scrollbar-thin');
      if (!tabContainer) return 0;
      const buttons = tabContainer.querySelectorAll('button');
      return buttons.length - 1;
    });
    expect(countAfter).toBe(1);
  });

  test('page reload preserves chat sessions', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="chat-send"]');

    // Send a message
    await chatInput.fill('persistence smoke test');
    await sendBtn.click();

    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });

    // Wait for debounced save
    await page.waitForTimeout(1500);

    // Reload the page
    await page.reload();
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible({ timeout: 10_000 });

    // Message should still be visible after reload
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toContainText(
      'persistence smoke test',
    );
  });
});
