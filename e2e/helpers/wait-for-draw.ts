import type { Page } from '@playwright/test';

/**
 * Wait for the current turn to complete and all active strokes to drain.
 * Polls status-label and the whiteboard stats overlay.
 */
export async function waitForDrawComplete(page: Page, opts?: { timeout?: number }) {
  const timeout = opts?.timeout ?? 10_000;

  // Wait for status to return to Ready (turn complete)
  await page.locator('[data-testid="status-label"]').filter({ hasText: 'Ready' }).waitFor({ timeout });

  // Wait for active strokes to drain to 0
  await page
    .locator('[data-testid="whiteboard-active"]')
    .filter({ hasText: /^Active:\s*0$/ })
    .waitFor({ timeout: 5_000 });
}

/**
 * Send a message in interactive mode and wait for the turn to complete.
 */
export async function sendAndWait(page: Page, message: string, opts?: { timeout?: number }) {
  const chatInput = page.locator('[data-testid="chat-input"]');
  const sendBtn = page.locator('[data-testid="chat-send"]');

  await chatInput.fill(message);
  await sendBtn.click();

  await waitForDrawComplete(page, opts);
}
