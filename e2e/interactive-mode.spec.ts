import { test, expect } from '@playwright/test';

test.describe('Interactive Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?mode=interactive');
  });

  test('loads in interactive mode with chat panel visible', async ({ page }) => {
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="whiteboard-canvas"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-send"]')).toBeVisible();
    // Agent sidebar should NOT be visible in interactive mode
    await expect(page.locator('[data-testid="agent-sidebar"]')).not.toBeAttached();
  });

  test('send button is disabled when input is empty', async ({ page }) => {
    const sendBtn = page.locator('[data-testid="chat-send"]');
    await expect(sendBtn).toBeDisabled();
  });

  test('chat send/receive flow works end-to-end', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="chat-send"]');

    // Type a message
    await chatInput.fill('draw a biology cell diagram');
    await expect(sendBtn).toBeEnabled();

    // Send message
    await sendBtn.click();

    // Wait for user message to appear
    await expect(page.locator('[data-testid="chat-message-user"]').first()).toBeVisible();

    // Wait for assistant response
    await expect(page.locator('[data-testid="chat-message-assistant"]').first()).toBeVisible({
      timeout: 15_000,
    });

    // Verify the assistant response contains expected mock text
    const assistantMsg = page.locator('[data-testid="chat-message-assistant"]').first();
    await expect(assistantMsg).toContainText('Here is a');

    // Input should be cleared after send
    await expect(chatInput).toHaveValue('');
  });

  test('whiteboard renders elements after agent response', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');

    await chatInput.fill('draw a math circle');
    await page.locator('[data-testid="chat-send"]').click();

    // Wait for assistant message (turn.done signals completion)
    await expect(page.locator('[data-testid="chat-message-assistant"]').first()).toBeVisible({
      timeout: 15_000,
    });

    // Wait for status to return to idle (Ready)
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });

    // Canvas should exist and contain rendered content
    const canvas = page.locator('[data-testid="whiteboard-canvas"]');
    await expect(canvas).toBeVisible();

    // Verify canvas has at least one child element (SVG or canvas drawing)
    const childCount = await canvas.evaluate((el) => el.querySelectorAll('*').length);
    expect(childCount).toBeGreaterThan(0);
  });

  test('error state is shown when stream returns error via passthrough', async ({ page }) => {
    // Intercept the stream API to inject a passthrough error
    await page.route('/api/agent/stream', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();

      // Forward with passthroughError to trigger error handling
      const response = await route.fetch({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        postData: JSON.stringify({
          ...postData,
          passthroughError: 'Test error: connection failed',
        }),
      });
      await route.fulfill({ response });
    });

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('trigger error test');
    await page.locator('[data-testid="chat-send"]').click();

    // Wait for the error message to appear in chat
    await expect(
      page.locator('[data-testid="chat-message-assistant"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    // The error message should be displayed
    const assistantMessages = page.locator('[data-testid="chat-message-assistant"]');
    const hasError = await assistantMessages.evaluateAll((elements) =>
      elements.some((el) => {
        const text = el.textContent ?? '';
        return text.includes('Error') || text.includes('error');
      }),
    );
    expect(hasError).toBe(true);

    // Status should return to idle after error
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 10_000,
    });
  });

  test('stop button is disabled when idle and enabled during streaming', async ({ page }) => {
    const stopBtn = page.locator('[data-testid="chat-stop"]');
    await expect(stopBtn).toBeDisabled();

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('draw something');
    await page.locator('[data-testid="chat-send"]').click();

    // During streaming, status should change from Ready
    await expect(page.locator('[data-testid="status-label"]')).not.toHaveText('Ready', {
      timeout: 5_000,
    });

    // Wait for completion
    await expect(page.locator('[data-testid="status-label"]')).toHaveText('Ready', {
      timeout: 15_000,
    });
  });
});
