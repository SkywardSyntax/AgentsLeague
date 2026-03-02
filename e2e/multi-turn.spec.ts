import { test, expect } from '@playwright/test';
import { sendAndWait, waitForDrawComplete } from './helpers/wait-for-draw';

test.describe('Multi-Turn Conversation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?mode=interactive');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.evaluate(() => localStorage.clear());
  });

  test('two consecutive sends accumulate messages', async ({ page }) => {
    await sendAndWait(page, 'draw a biology cell');

    const userMsgs = page.locator('[data-testid="chat-message-user"]');
    const assistantMsgs = page.locator('[data-testid="chat-message-assistant"]');

    await expect(userMsgs).toHaveCount(1);
    await expect(assistantMsgs).toHaveCount(1);

    await sendAndWait(page, 'now add labels');

    await expect(userMsgs).toHaveCount(2);
    await expect(assistantMsgs).toHaveCount(2);
  });

  test('whiteboard accumulates elements across turns', async ({ page }) => {
    await sendAndWait(page, 'draw a math circle');

    // Read committed count after first turn
    const committedEl = page.locator('[data-testid="whiteboard-committed"]');
    const firstText = await committedEl.textContent();
    const firstCount = parseInt(firstText?.match(/Committed:\s*(\d+)/)?.[1] ?? '0');
    expect(firstCount).toBeGreaterThan(0);

    await sendAndWait(page, 'draw a biology cell');

    // Committed count should grow (second batch adds to first)
    const secondText = await committedEl.textContent();
    const secondCount = parseInt(secondText?.match(/Committed:\s*(\d+)/)?.[1] ?? '0');
    expect(secondCount).toBeGreaterThan(firstCount);
  });

  test('history is sent to backend on second turn', async ({ page }) => {
    await sendAndWait(page, 'draw a biology cell');

    // Intercept the second request to inspect the body
    let capturedBody: Record<string, unknown> | null = null;
    await page.route('/api/agent/stream', async (route) => {
      const postData = route.request().postDataJSON();
      capturedBody = postData;
      // Continue to actual endpoint so turn completes
      return route.continue();
    });

    await sendAndWait(page, 'now add labels');
    await page.unroute('/api/agent/stream');

    expect(capturedBody).not.toBeNull();
    const history = (capturedBody as unknown as Record<string, unknown>)['history'];
    expect(Array.isArray(history)).toBe(true);
    // History should contain messages from the first turn
    expect((history as Array<Record<string, unknown>>).length).toBeGreaterThanOrEqual(2);
  });

  test('clear chat resets multi-turn state', async ({ page }) => {
    await sendAndWait(page, 'draw a math circle');

    const userMsgs = page.locator('[data-testid="chat-message-user"]');
    await expect(userMsgs).toHaveCount(1);

    // Look for a clear/new-chat button
    const clearBtn = page.locator('button').filter({ hasText: /new chat|clear/i }).first();
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      // After clear, messages should be gone
      await expect(userMsgs).toHaveCount(0);

      // Can send a new message — app is functional
      await sendAndWait(page, 'draw a physics vector');
      await expect(userMsgs).toHaveCount(1);
    } else {
      // If no clear button exists, skip gracefully
      test.skip(true, 'No clear/new-chat button found in UI');
    }
  });

  test('third turn after error recovery preserves conversation', async ({ page }) => {
    // Turn 1: succeeds normally
    await sendAndWait(page, 'draw a biology cell');
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toHaveCount(1);

    // Turn 2: error via route interception
    await page.route('/api/agent/stream', (route) =>
      route.fulfill({ status: 500, body: 'Server Error' }),
    );
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger error');
    await page.locator('[data-testid="chat-send"]').click();

    await expect(page.locator('[data-testid="chat-message-assistant"]').nth(1)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });
    await page.unroute('/api/agent/stream');

    // Turn 3: succeeds normally
    await sendAndWait(page, 'draw a math circle');

    // All three turns' user messages should be present
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(3);
    // All three assistant responses should be present (including the error one)
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toHaveCount(3);
  });
});
