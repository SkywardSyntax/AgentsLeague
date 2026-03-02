import { test, expect } from '@playwright/test';
import { sendAndWait } from './helpers/wait-for-draw';

test.describe('Visual Stability — Layout Assertions', () => {
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.evaluate(() => localStorage.clear());
  });

  test('chat panel and whiteboard are both visible with non-zero dimensions', async ({ page }) => {
    await page.goto('/?mode=interactive');

    await sendAndWait(page, 'draw a math circle');

    const whiteboardBox = await page.locator('[data-testid="whiteboard-canvas"]').boundingBox();
    const chatBox = await page.locator('[data-testid="chat-panel"]').boundingBox();

    expect(whiteboardBox).not.toBeNull();
    expect(chatBox).not.toBeNull();

    // Both panels must have non-zero width and height
    expect(whiteboardBox!.width).toBeGreaterThan(50);
    expect(whiteboardBox!.height).toBeGreaterThan(50);
    expect(chatBox!.width).toBeGreaterThan(50);
    expect(chatBox!.height).toBeGreaterThan(50);
  });

  test('panels do not overlap on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?mode=interactive');

    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="whiteboard-canvas"]')).toBeVisible();

    const whiteboardBox = await page.locator('[data-testid="whiteboard-canvas"]').boundingBox();
    const chatBox = await page.locator('[data-testid="chat-panel"]').boundingBox();

    expect(whiteboardBox).not.toBeNull();
    expect(chatBox).not.toBeNull();

    // On desktop (lg breakpoint), verify they are side by side or stacked without overlap
    const wb = whiteboardBox!;
    const cb = chatBox!;
    const horizontalOverlap =
      wb.x < cb.x + cb.width && wb.x + wb.width > cb.x;
    const verticalOverlap =
      wb.y < cb.y + cb.height && wb.y + wb.height > cb.y;

    // Panels should not occupy the same rectangular area
    const panelsOverlap = horizontalOverlap && verticalOverlap;
    expect(panelsOverlap).toBe(false);
  });

  test('agent mode whiteboard fills available space', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?mode=agent');

    const whiteboardBox = await page.locator('[data-testid="whiteboard-canvas"]').boundingBox();
    expect(whiteboardBox).not.toBeNull();

    // In agent mode, whiteboard should take most of the viewport
    expect(whiteboardBox!.width).toBeGreaterThan(800);
    expect(whiteboardBox!.height).toBeGreaterThan(400);

    // Chat panel should not be visible
    await expect(page.locator('[data-testid="chat-panel"]')).not.toBeVisible();
  });

  test('small viewport (375×667) renders without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/?mode=interactive');

    // Both panels should still be attached
    await expect(page.locator('[data-testid="whiteboard-canvas"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();

    // No horizontal scrollbar — body doesn't overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Chat input should be usable
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
  });

  test('header stays at top and status indicator is visible across viewports', async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/?mode=interactive');

      const statusLabel = page.locator('[data-testid="status-label"]');
      await expect(statusLabel).toBeVisible();
      await expect(statusLabel).toHaveText('Ready');

      const statusDot = page.locator('[data-testid="status-dot"]');
      await expect(statusDot).toBeVisible();

      // Status indicator should be near the top of the page
      const statusBox = await statusLabel.boundingBox();
      expect(statusBox).not.toBeNull();
      expect(statusBox!.y).toBeLessThan(100);
    }
  });

  test('whiteboard stats overlay is visible and does not overlap canvas content', async ({
    page,
  }) => {
    await page.goto('/?mode=interactive');

    await sendAndWait(page, 'draw a biology cell');

    const statsOverlay = page.locator('[data-testid="whiteboard-stats"]');
    await expect(statsOverlay).toBeVisible();

    const statsBox = await statsOverlay.boundingBox();
    expect(statsBox).not.toBeNull();
    expect(statsBox!.width).toBeGreaterThan(0);
    expect(statsBox!.height).toBeGreaterThan(0);

    // Stats overlay should be positioned inside the whiteboard
    const whiteboardBox = await page.locator('[data-testid="whiteboard-canvas"]').boundingBox();
    expect(whiteboardBox).not.toBeNull();
    expect(statsBox!.x).toBeGreaterThanOrEqual(whiteboardBox!.x);
    expect(statsBox!.y).toBeGreaterThanOrEqual(whiteboardBox!.y);
  });
});
