import { test, expect } from '@playwright/test';

test.describe('Error Recovery & Resilience', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?mode=interactive');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.evaluate(() => localStorage.clear());
  });

  test('retry after HTTP 500 — second message succeeds end-to-end', async ({ page }) => {
    // Turn 1: force a 500 error
    await page.route('/api/agent/stream', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger 500 error');
    await page.locator('[data-testid="chat-send"]').click();

    // Error message appears
    const firstAssistant = page.locator('[data-testid="chat-message-assistant"]').first();
    await expect(firstAssistant).toBeVisible({ timeout: 10_000 });
    await expect(firstAssistant).toContainText(/error|failed/i);

    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });

    // Turn 2: remove route mock so real mock backend handles it
    await page.unroute('/api/agent/stream');

    await chatInput.fill('draw a math circle');
    await page.locator('[data-testid="chat-send"]').click();

    // Second assistant response renders successfully
    const secondAssistant = page.locator('[data-testid="chat-message-assistant"]').nth(1);
    await expect(secondAssistant).toBeVisible({ timeout: 15_000 });
    await expect(secondAssistant).toContainText('Here is a');

    // Error message from first attempt is still visible in history
    await expect(firstAssistant).toBeVisible();
    await expect(firstAssistant).toContainText(/error|failed/i);

    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });
  });

  test('rapid double-send fires only one network request', async ({ page }) => {
    let requestCount = 0;
    await page.route('/api/agent/stream', async (route) => {
      requestCount++;
      // Continue to the real mock backend
      return route.continue();
    });

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('double send test');

    const sendBtn = page.locator('[data-testid="chat-send"]');
    // Click send twice in rapid succession
    await sendBtn.click();
    await sendBtn.click({ force: true });

    // Wait for the turn to complete
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });

    // Only one request should have been made
    expect(requestCount).toBe(1);

    // Only one user message should be in the chat
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(1);
  });

  test('mid-stream disconnect preserves partial content and recovers', async ({ page }) => {
    await page.route('/api/agent/stream', (route) => {
      const body = [
        'data: {"type":"assistant.text.delta","turnId":"t1","delta":"partial content before"}\n\n',
        'data: {"type":"assistant.text.delta","turnId":"t1","delta":" disconnect"}\n\n',
        // Stream abruptly ends — no turn.done
      ].join('');
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        body,
      });
    });

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger mid-stream disconnect');
    await page.locator('[data-testid="chat-send"]').click();

    // An assistant message should appear with partial content
    const assistant = page.locator('[data-testid="chat-message-assistant"]').first();
    await expect(assistant).toBeVisible({ timeout: 10_000 });

    // Status should return to Ready
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });

    // Subsequent send works normally
    await page.unroute('/api/agent/stream');
    await chatInput.fill('draw a math circle');
    await page.locator('[data-testid="chat-send"]').click();

    const secondAssistant = page.locator('[data-testid="chat-message-assistant"]').nth(1);
    await expect(secondAssistant).toBeVisible({ timeout: 15_000 });
    await expect(secondAssistant).toContainText('Here is a');

    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });
  });

  test('connection reset followed by successful retry recovers', async ({ page }) => {
    let callCount = 0;
    await page.route('/api/agent/stream', (route) => {
      callCount++;
      if (callCount === 1) {
        // First call: abort with connection reset
        return route.abort('connectionreset');
      }
      // Subsequent calls: pass through to mock backend
      return route.continue();
    });

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger connection reset');
    await page.locator('[data-testid="chat-send"]').click();

    // Error message appears for the first attempt
    const errorMsg = page.locator('[data-testid="chat-message-assistant"]').first();
    await expect(errorMsg).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });

    // User manually retries
    await chatInput.fill('draw a biology cell');
    await page.locator('[data-testid="chat-send"]').click();

    // Second attempt succeeds
    const retryMsg = page.locator('[data-testid="chat-message-assistant"]').nth(1);
    await expect(retryMsg).toBeVisible({ timeout: 15_000 });
    await expect(retryMsg).toContainText('Here is a');

    // Both messages visible in history
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toHaveCount(2);
  });

  test('stream with only error event shows error and recovers', async ({ page }) => {
    await page.route('/api/agent/stream', (route) => {
      const body = [
        'data: {"type":"error","message":"Rate limit exceeded. Please try again later."}\n\n',
      ].join('');
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        body,
      });
    });

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger rate limit');
    await page.locator('[data-testid="chat-send"]').click();

    // Should show error in chat
    const assistant = page.locator('[data-testid="chat-message-assistant"]').first();
    await expect(assistant).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });

    // Can send again after error
    await page.unroute('/api/agent/stream');
    await expect(page.locator('[data-testid="chat-input"]')).toBeEditable();
    await expect(page.locator('[data-testid="chat-send"]')).toBeVisible();
  });

  test('multiple sequential errors do not corrupt app state', async ({ page }) => {
    // Two consecutive errors followed by a success
    let callCount = 0;
    await page.route('/api/agent/stream', (route) => {
      callCount++;
      if (callCount <= 2) {
        return route.fulfill({ status: 500, body: 'Server Error' });
      }
      return route.continue();
    });

    const chatInput = page.locator('[data-testid="chat-input"]');

    // Error 1
    await chatInput.fill('error attempt 1');
    await page.locator('[data-testid="chat-send"]').click();
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });

    // Error 2
    await chatInput.fill('error attempt 2');
    await page.locator('[data-testid="chat-send"]').click();
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });

    // Success on attempt 3
    await chatInput.fill('draw a math circle');
    await page.locator('[data-testid="chat-send"]').click();

    const assistantMsgs = page.locator('[data-testid="chat-message-assistant"]');
    await expect(assistantMsgs.nth(2)).toBeVisible({ timeout: 15_000 });

    // All 3 user messages present
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(3);
    // All 3 assistant responses present (2 errors + 1 success)
    await expect(assistantMsgs).toHaveCount(3);

    // Third response is a real mock response
    await expect(assistantMsgs.nth(2)).toContainText('Here is a');
  });
});
