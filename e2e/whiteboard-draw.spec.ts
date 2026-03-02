import { test, expect } from '@playwright/test';
import { FIXTURE_SIMPLE_RECT_BATCH, FIXTURE_MULTI_ELEMENT_BATCH, FIXTURE_CLEAR_BATCH } from './fixtures/batches';
import { waitForDrawComplete, sendAndWait } from './helpers/wait-for-draw';

test.describe('Whiteboard Draw Verification', () => {
  test.describe('Interactive Mode — Committed Stroke Counts', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/?mode=interactive');
    });

    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.evaluate(() => localStorage.clear());
    });

    test('mock math batch produces expected committed stroke count', async ({ page }) => {
      await sendAndWait(page, 'draw a math circle');

      const committedText = await page
        .locator('[data-testid="whiteboard-committed"]')
        .textContent();
      const match = committedText?.match(/Committed:\s*(\d+)/);
      expect(match).not.toBeNull();
      const committed = Number(match![1]);
      // Mock math batch has 3 elements (rect, text, ellipse) → each produces ≥1 stroke
      expect(committed).toBeGreaterThanOrEqual(3);
    });

    test('passthrough batch with known elements renders correct count', async ({ page }) => {
      // Intercept stream API to inject a passthrough batch with exactly 5 elements
      await page.route('/api/agent/stream', async (route) => {
        const postData = route.request().postDataJSON();
        const response = await route.fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          postData: JSON.stringify({
            ...postData,
            passthroughBatch: FIXTURE_MULTI_ELEMENT_BATCH,
          }),
        });
        await route.fulfill({ response });
      });

      await sendAndWait(page, 'draw a passthrough test');

      const committedText = await page
        .locator('[data-testid="whiteboard-committed"]')
        .textContent();
      const match = committedText?.match(/Committed:\s*(\d+)/);
      expect(match).not.toBeNull();
      const committed = Number(match![1]);
      // FIXTURE_MULTI_ELEMENT_BATCH has 5 elements → each produces ≥1 stroke
      expect(committed).toBeGreaterThanOrEqual(5);
    });

    test('clear element resets committed to 0', async ({ page }) => {
      // First draw something
      await sendAndWait(page, 'draw a math circle');

      const committedBefore = await page
        .locator('[data-testid="whiteboard-committed"]')
        .textContent();
      const matchBefore = committedBefore?.match(/Committed:\s*(\d+)/);
      expect(Number(matchBefore?.[1])).toBeGreaterThan(0);

      // Now send a clear batch via passthrough
      await page.route('/api/agent/stream', async (route) => {
        const postData = route.request().postDataJSON();
        const response = await route.fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          postData: JSON.stringify({
            ...postData,
            passthroughBatch: FIXTURE_CLEAR_BATCH,
          }),
        });
        await route.fulfill({ response });
      });

      await sendAndWait(page, 'clear everything');

      const committedAfter = await page
        .locator('[data-testid="whiteboard-committed"]')
        .textContent();
      const matchAfter = committedAfter?.match(/Committed:\s*(\d+)/);
      expect(Number(matchAfter?.[1])).toBe(0);
    });

    test('active strokes transition to committed after animation completes', async ({ page }) => {
      const chatInput = page.locator('[data-testid="chat-input"]');
      const sendBtn = page.locator('[data-testid="chat-send"]');

      await chatInput.fill('draw a biology cell diagram');
      await sendBtn.click();

      // Wait for streaming to start — status should leave Ready
      await expect(page.locator('[data-testid="status-label"]')).not.toHaveText('Ready', {
        timeout: 5_000,
      });

      // Eventually active should drain and committed should grow
      await waitForDrawComplete(page, { timeout: 15_000 });

      const activeText = await page
        .locator('[data-testid="whiteboard-active"]')
        .textContent();
      const activeMatch = activeText?.match(/Active:\s*(\d+)/);
      expect(Number(activeMatch?.[1])).toBe(0);

      const committedText = await page
        .locator('[data-testid="whiteboard-committed"]')
        .textContent();
      const committedMatch = committedText?.match(/Committed:\s*(\d+)/);
      expect(Number(committedMatch?.[1])).toBeGreaterThan(0);
    });
  });

  test.describe('Agent Mode — Committed Stroke Counts', () => {
    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.evaluate(() => localStorage.clear());
    });
    test('agent auto-draw produces committed strokes', async ({ page }) => {
      await page.goto('/?mode=agent');

      // Wait for first turn to complete
      await page.waitForFunction(
        () =>
          window.__agentAPI?.getStatus() === 'idle' &&
          window.__agentAPI?.getElementCount() > 0,
        { timeout: 30_000 },
      );

      const committedText = await page
        .locator('[data-testid="whiteboard-committed"]')
        .textContent();
      const match = committedText?.match(/Committed:\s*(\d+)/);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThan(0);
    });
  });
});

// Re-declare for agent-mode type checking
declare global {
  interface Window {
    __agentAPI?: {
      submitQuery: (text: string) => Promise<void>;
      getStatus: () => 'idle' | 'thinking' | 'streaming' | 'drawing';
      getMessages: () => { role: string; content: string }[];
      getElementCount: () => number;
      clearActiveChat: () => void;
      getLastTurnEvents: () => string[];
      getLastDomain: () => string;
    };
  }
}
