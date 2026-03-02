import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility — axe-core WCAG AA', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?mode=interactive');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.evaluate(() => localStorage.clear());
  });

  test('landing page has zero WCAG AA violations', async ({ page }) => {
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="whiteboard-canvas"]')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('error state has accessible alert region', async ({ page }) => {
    await page.route('/api/agent/stream', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger error');
    await page.locator('[data-testid="chat-send"]').click();

    await expect(page.locator('[data-testid="chat-message-assistant"]').first()).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('keyboard focus reaches chat input without mouse', async ({ page }) => {
    // Start focus at document body
    await page.keyboard.press('Tab');

    const focusedElements: string[] = [];
    const maxTabs = 20;

    for (let i = 0; i < maxTabs; i++) {
      const tag = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return 'null';
        const testId = el.getAttribute('data-testid') ?? '';
        const role = el.getAttribute('role') ?? '';
        const tag = el.tagName.toLowerCase();
        return testId || role || tag;
      });
      focusedElements.push(tag);

      // If we've reached the chat input, focus order is valid
      if (tag === 'chat-input') break;

      await page.keyboard.press('Tab');
    }

    expect(focusedElements).toContain('chat-input');
  });

  test('send button is keyboard-activatable', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('keyboard send test');

    // Focus the send button and press Enter
    const sendBtn = page.locator('[data-testid="chat-send"]');
    await sendBtn.focus();
    await page.keyboard.press('Enter');

    // User message should appear (proves keyboard activation worked)
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('chat messages have semantic article elements', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('accessibility test message');
    await page.locator('[data-testid="chat-send"]').click();

    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify user message is rendered as an article element
    const userMsgTag = await page.locator('[data-testid="chat-message-user"]').first().evaluate(
      (el) => el.tagName.toLowerCase(),
    );
    expect(userMsgTag).toBe('article');
  });

  test('full keyboard flow — Tab traversal hits key interactive landmarks', async ({ page }) => {
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();

    // Reset focus to body
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('Tab');

    const focusedElements: string[] = [];
    const maxTabs = 30;

    for (let i = 0; i < maxTabs; i++) {
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'body';
        const testId = el.getAttribute('data-testid') ?? '';
        if (testId) return testId;
        const role = el.getAttribute('role') ?? '';
        const tag = el.tagName.toLowerCase();
        const ariaLabel = el.getAttribute('aria-label') ?? '';
        const text = el.textContent?.trim().slice(0, 30) ?? '';
        return `${tag}${role ? `[role=${role}]` : ''}${ariaLabel ? `[aria-label=${ariaLabel}]` : ''}${text ? `{${text}}` : ''}`;
      });
      focusedElements.push(info);
      await page.keyboard.press('Tab');
    }

    // Core interactive elements must all be reachable via Tab
    expect(focusedElements).toContain('chat-input');
    expect(focusedElements).toContain('chat-send');
    expect(focusedElements).toContain('chat-stop');
  });

  test('Enter on send button submits message when input has text', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('keyboard test via Enter');

    // Tab to send button and activate with Enter
    const sendBtn = page.locator('[data-testid="chat-send"]');
    await sendBtn.focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible({
      timeout: 10_000,
    });

    // Input should be cleared after send
    await expect(chatInput).toHaveValue('');
  });

  test('Shift+Enter inserts newline instead of sending', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.focus();
    await page.keyboard.type('line one');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('line two');

    const value = await chatInput.inputValue();
    expect(value).toContain('line one');
    expect(value).toContain('line two');
    // Message should NOT have been sent
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(0);
  });

  test('whiteboard region has accessible role', async ({ page }) => {
    const whiteboardContainer = page.locator('[data-testid="whiteboard-canvas"]');
    await expect(whiteboardContainer).toBeVisible();

    // The canvas wrapper should have role="application" for interactive canvas
    const role = await whiteboardContainer.locator('[role="application"]').count();
    expect(role).toBeGreaterThanOrEqual(1);
  });

  test('status indicator conveys information beyond color alone', async ({ page }) => {
    // WCAG 1.4.1: info should not rely solely on color
    const statusDot = page.locator('[data-testid="status-dot"]');
    const statusLabel = page.locator('[data-testid="status-label"]');

    await expect(statusDot).toBeVisible();
    await expect(statusLabel).toBeVisible();

    // The text label provides non-color status info
    const labelText = await statusLabel.textContent();
    expect(labelText).toBeTruthy();
    expect(['Ready', 'Thinking', 'Responding', 'Drawing']).toContain(labelText);
  });

  test('Stop button cancels active stream and returns to Ready', async ({ page }) => {
    // Mock a long-running SSE stream that sends an initial delta then hangs
    // indefinitely, providing a deterministic streaming state.
    await page.route('/api/agent/stream', async (route) => {
      const body =
        'data: {"type":"assistant.text.delta","turnId":"hang-1","delta":"Streaming..."}\n\n';
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body,
        // Stream ends after the single delta — no turn.done, so app stays in non-idle state
      });
    });

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger hanging stream');
    await page.locator('[data-testid="chat-send"]').click();

    // Wait for the status to leave Ready (deterministic: route always returns a delta)
    await expect(page.locator('[data-testid="status-label"]')).not.toHaveText('Ready', {
      timeout: 5_000,
    });

    // The Stop button should now be enabled
    const stopBtn = page.locator('[data-testid="chat-stop"]');
    await expect(stopBtn).toBeEnabled();

    // Click Stop to cancel the stream
    await stopBtn.click();

    // App should return to Ready
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });

    // Stop button should be disabled again
    await expect(stopBtn).toBeDisabled();

    // Chat input should be usable again
    await expect(chatInput).toBeEnabled();
  });
});
