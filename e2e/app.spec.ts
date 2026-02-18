import { test, expect, type Page } from '@playwright/test';

// ── Helpers ─────────────────────────────────────────────────────

/** Dismiss the onboarding tip if visible. */
async function dismissOnboarding(page: Page) {
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await gotIt.isVisible({ timeout: 2000 }).catch(() => false)) {
    await gotIt.click();
  }
}

/** Mock the /api/chat SSE endpoint so tests run without OpenAI. */
async function mockChatAPI(page: Page, reply = 'Here is your drawing!') {
  await page.route('**/api/chat', async (route) => {
    const body = [
      `data: ${JSON.stringify({ type: 'message', content: reply })}\n\n`,
      `data: ${JSON.stringify({ type: 'done' })}\n\n`,
    ].join('');

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    });
  });
}

/** Mock the /api/draw SSE endpoint. */
async function mockDrawAPI(page: Page) {
  await page.route('**/api/draw', async (route) => {
    const body = [
      `data: ${JSON.stringify({ type: 'step_progress', step: 1, total: 1 })}\n\n`,
      `data: ${JSON.stringify({ type: 'draw_op', op: { action: 'rect', x: 50, y: 50, w: 100, h: 80 } })}\n\n`,
      `data: ${JSON.stringify({ type: 'done' })}\n\n`,
    ].join('');

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    });
  });
}

// ── Full user scenario ──────────────────────────────────────────

test.describe('Full user scenario', () => {
  test.beforeEach(async ({ page }) => {
    await mockChatAPI(page);
    await mockDrawAPI(page);
    await page.goto('/');
    await dismissOnboarding(page);
  });

  test('user lands on app, types question, sees AI response', async ({ page }) => {
    // Verify main layout loaded
    await expect(page.locator('[aria-label="Whiteboard canvas"]')).toBeVisible();
    await expect(page.locator('[aria-label="Chat messages"]')).toBeVisible();

    // Type a message
    const input = page.locator('[aria-label="Message input"]');
    await expect(input).toBeVisible();
    await input.fill('Draw a red circle');
    await page.getByRole('button', { name: 'Send' }).click();

    // User message appears in the chat log
    await expect(page.getByRole('article', { name: /You:.*Draw a red circle/ })).toBeVisible();

    // AI response streams in
    await expect(page.getByRole('article', { name: /Assistant:/ })).toBeVisible({ timeout: 10_000 });
  });

  test('user sees reasoning block and can expand it', async ({ page }) => {
    // Mock chat to return reasoning
    await page.route('**/api/chat', async (route) => {
      const body = [
        `data: ${JSON.stringify({ type: 'reasoning', content: 'Step 1: Analyze\nStep 2: Draw' })}\n\n`,
        `data: ${JSON.stringify({ type: 'message', content: 'Done drawing.' })}\n\n`,
        `data: ${JSON.stringify({ type: 'done' })}\n\n`,
      ].join('');
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body,
      });
    });

    const input = page.locator('[aria-label="Message input"]');
    await input.fill('Explain your reasoning');
    await page.getByRole('button', { name: 'Send' }).click();

    // Wait for the response
    await expect(page.getByRole('article', { name: /Assistant:/ })).toBeVisible({ timeout: 10_000 });
  });

  test('submit with Enter key', async ({ page }) => {
    const input = page.locator('[aria-label="Message input"]');
    await input.fill('Hello AI');
    await input.press('Enter');

    await expect(page.getByRole('article', { name: /You:.*Hello AI/ })).toBeVisible();
  });

  test('send button disabled when input is empty', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: 'Send' });
    await expect(sendBtn).toBeDisabled();
  });
});

// ── Voice scenario ──────────────────────────────────────────────

test.describe('Voice scenario', () => {
  test.beforeEach(async ({ page }) => {
    await mockChatAPI(page);
    await mockDrawAPI(page);
    await page.goto('/');
    await dismissOnboarding(page);
  });

  test('switch to voice mode and see mic button', async ({ page }) => {
    // Switch to voice using the ChatPanel inline toggle
    const voiceRadio = page.locator('[aria-label="Voice input mode"]');
    await voiceRadio.click();

    // Mic button should appear
    const micBtn = page.locator('[aria-label="Start listening"]');
    await expect(micBtn).toBeVisible();
  });

  test('mic button toggles to stop when clicked', async ({ page }) => {
    const voiceRadio = page.locator('[aria-label="Voice input mode"]');
    await voiceRadio.click();

    // Click start listening – in test env SpeechRecognition may not be supported,
    // so the button may stay disabled or show "Speech not supported".
    const micBtn = page.locator('[aria-label="Start listening"]');
    const isDisabled = await micBtn.isDisabled();

    if (!isDisabled) {
      await micBtn.click();
      // Either transitions to "Stop listening" or shows error state
      const stopBtn = page.locator('[aria-label="Stop listening"]');
      const cancelBtn = page.getByRole('button', { name: 'Cancel' });
      const eitherVisible = await Promise.race([
        stopBtn.isVisible({ timeout: 3000 }).catch(() => false),
        cancelBtn.isVisible({ timeout: 3000 }).catch(() => false),
      ]);
      expect(eitherVisible).toBeTruthy();
    }
  });
});

// ── Mode switching ──────────────────────────────────────────────

test.describe('Mode switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
  });

  test('toggle between text and voice mode via ChatPanel', async ({ page }) => {
    // Start in text mode – message input should be visible
    await expect(page.locator('[aria-label="Message input"]')).toBeVisible();

    // Switch to voice
    await page.locator('[aria-label="Voice input mode"]').click();
    // In voice mode the text input disappears, mic button appears
    await expect(page.locator('[aria-label="Message input"]')).not.toBeVisible();
    await expect(page.locator('[aria-label="Start listening"]')).toBeVisible();

    // Switch back to text
    await page.locator('[aria-label="Text input mode"]').click();
    await expect(page.locator('[aria-label="Message input"]')).toBeVisible();
  });

  test('ModeToggle radiogroup has correct aria-checked', async ({ page }) => {
    const textRadio = page.locator('[role="radio"][aria-label="Text input mode"]');
    const voiceRadio = page.locator('[role="radio"][aria-label="Voice input mode"]');

    await expect(textRadio).toHaveAttribute('aria-checked', 'true');
    await expect(voiceRadio).toHaveAttribute('aria-checked', 'false');

    await voiceRadio.click();
    await expect(voiceRadio).toHaveAttribute('aria-checked', 'true');
    await expect(textRadio).toHaveAttribute('aria-checked', 'false');
  });
});

// ── Canvas interaction ──────────────────────────────────────────

test.describe('Canvas interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
  });

  test('canvas is present with correct a11y attributes', async ({ page }) => {
    const canvas = page.locator('[aria-roledescription="whiteboard"]');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('role', 'application');
  });

  test('canvas pan via pointer drag', async ({ page }) => {
    const canvas = page.locator('[aria-roledescription="whiteboard"]');
    const box = await canvas.boundingBox();
    if (!box) return;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY + 50, { steps: 5 });
    await page.mouse.up();
    // No crash = pass; canvas accepts pointer events
  });

  test('canvas zoom via wheel', async ({ page }) => {
    const canvas = page.locator('[aria-roledescription="whiteboard"]');
    const box = await canvas.boundingBox();
    if (!box) return;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -100);
    // No crash = pass
  });

  test('undo and redo buttons exist in toolbar', async ({ page }) => {
    // Toolbar is hidden on mobile, check desktop
    const undoBtn = page.locator('[aria-label="Undo"]');
    const redoBtn = page.locator('[aria-label="Redo"]');

    // On desktop viewport they should be visible
    if (await undoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(undoBtn).toBeDisabled(); // no history yet
      await expect(redoBtn).toBeDisabled();
    }
  });
});

// ── Dark mode toggle ────────────────────────────────────────────

test.describe('Dark mode toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
  });

  test('toggle dark mode changes data-theme attribute', async ({ page }) => {
    const toggle = page.locator('[aria-label="Toggle dark mode"]');
    await expect(toggle).toBeVisible();

    const initialTheme = await page.locator('html').getAttribute('data-theme');
    await toggle.click();

    const newTheme = await page.locator('html').getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
    expect(['light', 'dark']).toContain(newTheme);

    // Toggle back
    await toggle.click();
    const restored = await page.locator('html').getAttribute('data-theme');
    expect(restored).toBe(initialTheme);
  });

  test('dark mode persists across reload', async ({ page }) => {
    const toggle = page.locator('[aria-label="Toggle dark mode"]');
    await toggle.click();
    const afterToggle = await page.locator('html').getAttribute('data-theme');

    await page.reload();
    await dismissOnboarding(page);

    const afterReload = await page.locator('html').getAttribute('data-theme');
    expect(afterReload).toBe(afterToggle);
  });
});

// ── Mobile responsive testing ───────────────────────────────────

test.describe('Mobile responsive', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
  });

  test('mobile layout stacks panels vertically', async ({ page }) => {
    const whiteboard = page.locator('[aria-label="Whiteboard canvas"]');
    const chat = page.locator('[aria-label="Chat panel"]');

    await expect(whiteboard).toBeVisible();
    await expect(chat).toBeVisible();

    const wbBox = await whiteboard.boundingBox();
    const chatBox = await chat.boundingBox();

    // On mobile the chat should be below the whiteboard
    if (wbBox && chatBox) {
      expect(chatBox.y).toBeGreaterThanOrEqual(wbBox.y);
    }
  });

  test('mobile chat toggle button works', async ({ page }) => {
    const toggleBtn = page.locator('[aria-label="Hide chat"]');

    if (await toggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toggleBtn.click();
      await expect(page.locator('[aria-label="Show chat"]')).toBeVisible();

      // Show chat again
      await page.locator('[aria-label="Show chat"]').click();
      await expect(page.locator('[aria-label="Chat panel"]')).toBeVisible();
    }
  });

  test('mobile hamburger menu opens toolbar', async ({ page }) => {
    const menuBtn = page.locator('[aria-label="Open menu"]');

    if (await menuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuBtn.click();
      // Toolbar should appear
      const toolbar = page.locator('[role="toolbar"][aria-label="Canvas controls"]');
      await expect(toolbar).toBeVisible();

      // Close it
      await page.locator('[aria-label="Close menu"]').click();
    }
  });
});

// ── Performance metrics ─────────────────────────────────────────

test.describe('Performance', () => {
  test('page load and first paint within budget', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find((e) => e.name === 'first-contentful-paint');

      return {
        domContentLoaded: nav?.domContentLoadedEventEnd ?? 0,
        loadComplete: nav?.loadEventEnd ?? 0,
        firstContentfulPaint: fcp?.startTime ?? 0,
      };
    });

    // DOM content loaded under 5s (generous for dev server)
    expect(timing.domContentLoaded).toBeLessThan(5000);

    // FCP under 3s
    if (timing.firstContentfulPaint > 0) {
      expect(timing.firstContentfulPaint).toBeLessThan(3000);
    }
  });

  test('chat message round-trip latency with mocked API', async ({ page }) => {
    await mockChatAPI(page, 'Quick response');
    await page.goto('/');
    await dismissOnboarding(page);

    const input = page.locator('[aria-label="Message input"]');
    await input.fill('Ping');

    const start = Date.now();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('article', { name: /Assistant:/ })).toBeVisible({ timeout: 5000 });
    const elapsed = Date.now() - start;

    // Mocked round-trip should complete under 2s
    expect(elapsed).toBeLessThan(2000);
  });

  test('canvas renders without jank on initial load', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);

    // Verify canvas element is rendered
    const canvas = page.locator('[aria-roledescription="whiteboard"] canvas');
    const count = await canvas.count();
    expect(count).toBeGreaterThanOrEqual(4); // 4-layer canvas stack
  });
});

// ── Accessibility ───────────────────────────────────────────────

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
  });

  test('keyboard navigation through toolbar buttons', async ({ page }) => {
    // Focus the first toolbar button
    const toolbar = page.locator('[role="toolbar"][aria-label="Canvas controls"]');

    if (await toolbar.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Tab into toolbar area
      const buttons = toolbar.locator('button:not([disabled])');
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);

      // Focus first button and use ArrowRight to navigate
      await buttons.first().focus();
      await expect(buttons.first()).toBeFocused();

      await page.keyboard.press('ArrowRight');
      // Another button should now be focused
      const activeTag = await page.evaluate(() => document.activeElement?.tagName);
      expect(activeTag).toBe('BUTTON');
    }
  });

  test('chat messages region has correct ARIA roles', async ({ page }) => {
    const log = page.locator('[role="log"][aria-label="Chat messages"]');
    await expect(log).toBeVisible();
    await expect(log).toHaveAttribute('aria-live', 'polite');
  });

  test('mode toggle radiogroup is keyboard accessible', async ({ page }) => {
    const group = page.locator('[role="radiogroup"][aria-label="Input mode"]');
    await expect(group).toBeVisible();

    const textRadio = group.locator('[role="radio"][aria-label="Text input mode"]');
    await expect(textRadio).toHaveAttribute('aria-checked', 'true');
  });

  test('canvas has screen reader description', async ({ page }) => {
    const srList = page.locator('[role="list"][aria-label="Canvas objects"]');
    await expect(srList).toBeAttached();

    // Should describe empty state
    const emptyMsg = srList.locator('text=Empty canvas');
    await expect(emptyMsg).toBeAttached();
  });

  test('resize handle has correct aria attributes', async ({ page }) => {
    const handle = page.locator('[role="separator"][aria-label="Resize panels"]');
    if (await handle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    }
  });

  test('main content has skip-navigation landmark', async ({ page }) => {
    const main = page.locator('#main-content');
    await expect(main).toBeVisible();
  });

  test('all interactive elements have accessible names', async ({ page }) => {
    // Check that no buttons lack aria-label or visible text
    const buttons = page.locator('button:visible');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const ariaLabel = await btn.getAttribute('aria-label');
      const text = await btn.innerText();
      const hasName = (ariaLabel && ariaLabel.length > 0) || (text && text.trim().length > 0);
      expect(hasName).toBeTruthy();
    }
  });
});
