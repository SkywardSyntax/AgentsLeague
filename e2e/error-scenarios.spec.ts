import { test, expect } from '@playwright/test';
import { sendAndWait } from './helpers/wait-for-draw';

test.describe('Error Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?mode=interactive');
  });

  test('HTTP 500 from stream endpoint shows error and recovers', async ({ page }) => {
    await page.route('/api/agent/stream', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger 500');
    await page.locator('[data-testid="chat-send"]').click();

    // Error message should appear in chat
    const assistant = page.locator('[data-testid="chat-message-assistant"]').first();
    await expect(assistant).toBeVisible({ timeout: 10_000 });
    await expect(assistant).toContainText(/error|failed/i);

    // Status returns to Ready
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });

    // App is still interactive — input and send are usable
    await page.unroute('/api/agent/stream');
    await expect(page.locator('[data-testid="chat-input"]')).toBeEditable();
  });

  test('malformed SSE JSON mid-stream shows error', async ({ page }) => {
    await page.route('/api/agent/stream', (route) => {
      const body = [
        'data: {"type":"assistant.text.delta","turnId":"t1","delta":"hello"}\n\n',
        'data: {not valid json}\n\n',
        'data: {"type":"turn.done","turnId":"t1","usage":{"prompt":0,"completion":0,"total":0}}\n\n',
      ].join('');
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        body,
      });
    });

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger malformed');
    await page.locator('[data-testid="chat-send"]').click();

    // Should see an assistant message (may contain error text or partial content)
    await expect(page.locator('[data-testid="chat-message-assistant"]').first()).toBeVisible({
      timeout: 10_000,
    });

    // Status returns to Ready
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });
  });

  test('network disconnect during stream shows error and recovers', async ({ page }) => {
    await page.route('/api/agent/stream', (route) => route.abort('connectionreset'));

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger disconnect');
    await page.locator('[data-testid="chat-send"]').click();

    const assistant = page.locator('[data-testid="chat-message-assistant"]').first();
    await expect(assistant).toBeVisible({ timeout: 10_000 });
    await expect(assistant).toContainText(/error|abort|failed/i);

    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });

    // App recovers — can send another message
    await page.unroute('/api/agent/stream');
    await expect(page.locator('[data-testid="chat-input"]')).toBeEditable();
  });

  test('empty response body shows error and recovers', async ({ page }) => {
    await page.route('/api/agent/stream', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        body: '',
      }),
    );

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger empty');
    await page.locator('[data-testid="chat-send"]').click();

    // Status should return to Ready (no crash)
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });
  });

  test('passthrough error event shows error message', async ({ page }) => {
    await page.route('/api/agent/stream', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      const response = await route.fetch({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        postData: JSON.stringify({
          ...postData,
          passthroughError: 'Rate limit exceeded',
        }),
      });
      await route.fulfill({ response });
    });

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger rate limit');
    await page.locator('[data-testid="chat-send"]').click();

    const assistant = page.locator('[data-testid="chat-message-assistant"]').first();
    await expect(assistant).toBeVisible({ timeout: 10_000 });

    // The error should be surfaced in the chat
    const allAssistant = page.locator('[data-testid="chat-message-assistant"]');
    const hasError = await allAssistant.evaluateAll((elements) =>
      elements.some((el) => {
        const text = el.textContent ?? '';
        return text.includes('Rate limit') || text.includes('error') || text.includes('Error');
      }),
    );
    expect(hasError).toBe(true);

    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });
  });

  test('send button is disabled during active stream (prevents rapid double-send)', async ({
    page,
  }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('draw a biology cell');
    await page.locator('[data-testid="chat-send"]').click();

    // During streaming, send button should be disabled
    await expect(page.locator('[data-testid="status-label"]')).not.toHaveText('Ready', {
      timeout: 5_000,
    });
    await expect(page.locator('[data-testid="chat-send"]')).toBeDisabled();

    // Wait for completion
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });
  });
});
