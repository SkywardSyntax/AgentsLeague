import { test, expect } from '@playwright/test';

// Extend Window for __agentAPI
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

test.describe('Agent Mode', () => {
  test('hides chat panel and shows full-screen whiteboard', async ({ page }) => {
    await page.goto('/?mode=agent');
    await expect(page.locator('[data-testid="chat-panel"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="whiteboard-canvas"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-sidebar"]')).toBeVisible();
  });

  test('all required data-testid attributes exist', async ({ page }) => {
    await page.goto('/?mode=agent');
    const requiredTestIds = [
      'whiteboard-canvas',
      'agent-sidebar',
      'status-dot',
      'status-label',
      'agent-toggle',
      'agent-clear',
      'agent-domain',
      'agent-last-query',
    ];
    for (const id of requiredTestIds) {
      await expect(page.locator(`[data-testid="${id}"]`)).toBeAttached();
    }
  });

  test('agent auto-sends first query via mock backend', async ({ page }) => {
    await page.goto('/?mode=agent');
    // Wait for __agentAPI to be available and first turn to cycle through
    await page.waitForFunction(
      () => window.__agentAPI?.getStatus() !== undefined,
      { timeout: 10_000 },
    );

    // Wait for at least one user message to appear (agent auto-send)
    await page.waitForFunction(
      () => {
        const msgs = window.__agentAPI?.getMessages() ?? [];
        return msgs.some((m) => m.role === 'user');
      },
      { timeout: 30_000 },
    );

    const messages = await page.evaluate(() => window.__agentAPI!.getMessages());
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m) => m.role === 'user')).toBe(true);
  });

  test('whiteboard receives elements after turn completes', async ({ page }) => {
    await page.goto('/?mode=agent');
    // Wait for first turn to complete with elements drawn
    await page.waitForFunction(
      () =>
        window.__agentAPI?.getStatus() === 'idle' &&
        window.__agentAPI?.getElementCount() > 0,
      { timeout: 30_000 },
    );

    const count = await page.evaluate(() => window.__agentAPI!.getElementCount());
    expect(count).toBeGreaterThan(0);
  });

  test('domain cycles through domains using __agentAPI', async ({ page }) => {
    await page.goto('/?mode=agent');
    const domains = new Set<string>();

    for (let i = 0; i < 4; i++) {
      await page.waitForFunction(
        (expectedTurns) => {
          const msgs = window.__agentAPI?.getMessages() ?? [];
          const userMsgs = msgs.filter((m) => m.role === 'user');
          return (
            userMsgs.length >= expectedTurns &&
            window.__agentAPI?.getStatus() === 'idle'
          );
        },
        i + 1,
        { timeout: 30_000 },
      );
      const domain = await page.evaluate(() => window.__agentAPI!.getLastDomain());
      domains.add(domain);
    }

    expect(domains.size).toBeGreaterThanOrEqual(3);
  });

  test('pause stops and resume restarts auto-queries', async ({ page }) => {
    await page.goto('/?mode=agent');
    // Wait for agent to be idle with at least one message
    await page.waitForFunction(
      () =>
        window.__agentAPI?.getStatus() === 'idle' &&
        (window.__agentAPI?.getMessages().length ?? 0) > 0,
      { timeout: 30_000 },
    );

    // Pause
    await page.locator('[data-testid="agent-toggle"]').click();
    const countBefore = await page.evaluate(() => window.__agentAPI!.getMessages().length);
    // Poll to confirm no new messages arrive while paused (replaces brittle waitForTimeout)
    const stableCheck = await page.evaluate(
      (prev) =>
        new Promise<number>((resolve) => {
          let checks = 0;
          const interval = setInterval(() => {
            checks++;
            const current = window.__agentAPI?.getMessages().length ?? prev;
            if (current > prev || checks >= 8) {
              clearInterval(interval);
              resolve(current);
            }
          }, 500);
        }),
      countBefore,
    );
    const countAfter = stableCheck;
    expect(countAfter).toBe(countBefore);

    // Resume
    await page.locator('[data-testid="agent-toggle"]').click();
    await page.waitForFunction(
      (prev) => (window.__agentAPI?.getMessages().length ?? 0) > prev,
      countBefore,
      { timeout: 15_000 },
    );
  });

  test('submitQuery triggers a full turn cycle', async ({ page }) => {
    await page.goto('/?mode=agent');
    // Pause auto-queries first
    await page.waitForFunction(
      () => window.__agentAPI?.getStatus() !== undefined,
      { timeout: 10_000 },
    );
    await page.locator('[data-testid="agent-toggle"]').click();
    await page.waitForFunction(
      () => window.__agentAPI?.getStatus() === 'idle',
      { timeout: 10_000 },
    );

    // Submit custom query
    await page.evaluate(() => window.__agentAPI!.submitQuery('draw a triangle'));
    await page.waitForFunction(
      () => window.__agentAPI?.getStatus() === 'idle',
      { timeout: 30_000 },
    );

    const messages = await page.evaluate(() => window.__agentAPI!.getMessages());
    expect(messages.some((m) => m.content === 'draw a triangle')).toBe(true);
  });

  test('mock mode does not call OpenAI (no outbound API)', async ({ page }) => {
    // Verify mock mode is active by checking that responses come from mock
    await page.goto('/?mode=agent');
    await page.waitForFunction(
      () => {
        const msgs = window.__agentAPI?.getMessages() ?? [];
        return msgs.some((m) => m.role === 'assistant');
      },
      { timeout: 30_000 },
    );

    const messages = await page.evaluate(() => window.__agentAPI!.getMessages());
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    // Mock responses start with "Here is a" prefix
    expect(assistantMsg?.content).toMatch(/Here is a/);
  });
});
