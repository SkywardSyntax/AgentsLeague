#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

function readNumberEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readStringEnv(name, fallback) {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function appendJsonl(filePath, payload) {
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

const config = {
  agentId: readStringEnv('AGENT_ID', 'unknown'),
  baseUrl: readStringEnv('BASE_URL', 'http://127.0.0.1:3000'),
  runDir: path.resolve(readStringEnv('RUN_DIR', path.join('orchestration', 'runs', 'local', 'agent-unknown'))),
  durationMs: readNumberEnv('DURATION_MS', 6 * 60 * 60 * 1000),
  pollMs: readNumberEnv('POLL_MS', 5_000),
  screenshotEveryTurns: readNumberEnv('SCREENSHOT_EVERY_TURNS', 1),
  progressTimeoutMs: readNumberEnv('PROGRESS_TIMEOUT_MS', 120_000),
  maxRecoveries: readNumberEnv('MAX_RECOVERIES', 32),
};

const screenshotsDir = path.join(config.runDir, 'screenshots');
const eventsPath = path.join(config.runDir, 'events.jsonl');
const summaryPath = path.join(config.runDir, 'summary.json');

await fs.mkdir(screenshotsDir, { recursive: true });
await fs.writeFile(eventsPath, '', 'utf8');

let browser;
let context;
let page;
let completedTurns = 0;
let recoveries = 0;
let failedSnapshots = 0;
let screenshots = 0;
let stalledIntervals = 0;
let lastProgressAt = Date.now();
let lastMessageCount = 0;
let lastElementCount = 0;
const startedAt = Date.now();

await appendJsonl(eventsPath, {
  ts: nowIso(),
  type: 'run.start',
  config,
});

try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1728, height: 1117 } });
  page = await context.newPage();

  await page.goto(`${config.baseUrl}/?mode=agent`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__agentAPI?.getStatus), undefined, { timeout: 120_000 });

  await appendJsonl(eventsPath, {
    ts: nowIso(),
    type: 'run.connected',
    baseUrl: config.baseUrl,
  });

  while (Date.now() - startedAt < config.durationMs) {
    let snapshot;
    try {
      snapshot = await page.evaluate(() => {
        const api = window.__agentAPI;
        const messages = api?.getMessages?.() ?? [];
        const userCount = messages.filter((m) => m.role === 'user').length;
        const assistantCount = messages.filter((m) => m.role === 'assistant').length;
        return {
          ts: Date.now(),
          status: api?.getStatus?.() ?? 'unavailable',
          messageCount: messages.length,
          userCount,
          assistantCount,
          elementCount: api?.getElementCount?.() ?? 0,
          lastDomain: api?.getLastDomain?.() ?? 'unknown',
          lastEvents: api?.getLastTurnEvents?.() ?? [],
        };
      });
    } catch (error) {
      failedSnapshots += 1;
      await appendJsonl(eventsPath, {
        ts: nowIso(),
        type: 'snapshot.error',
        message: error instanceof Error ? error.message : String(error),
      });
      await sleep(config.pollMs);
      continue;
    }

    const hasProgress = snapshot.messageCount > lastMessageCount || snapshot.elementCount > lastElementCount;
    if (hasProgress) {
      completedTurns += 1;
      lastProgressAt = Date.now();
      lastMessageCount = snapshot.messageCount;
      lastElementCount = snapshot.elementCount;

      if (config.screenshotEveryTurns > 0 && completedTurns % config.screenshotEveryTurns === 0) {
        const screenshotPath = path.join(screenshotsDir, `turn-${String(completedTurns).padStart(6, '0')}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        screenshots += 1;
      }

      await appendJsonl(eventsPath, {
        ts: nowIso(),
        type: 'turn.progress',
        turn: completedTurns,
        snapshot,
      });
    } else {
      stalledIntervals += 1;
      await appendJsonl(eventsPath, {
        ts: nowIso(),
        type: 'turn.stall',
        stalledForMs: Date.now() - lastProgressAt,
        snapshot,
      });
    }

    const stalledForMs = Date.now() - lastProgressAt;
    if (stalledForMs > config.progressTimeoutMs && recoveries < config.maxRecoveries) {
      recoveries += 1;
      const recoveryPrompt = 'Generate a new non-repetitive explanation and draw a clear whiteboard visualization in a different domain.';
      await page.evaluate((prompt) => window.__agentAPI?.submitQuery?.(prompt), recoveryPrompt);
      lastProgressAt = Date.now();
      await appendJsonl(eventsPath, {
        ts: nowIso(),
        type: 'recovery.submitQuery',
        prompt: recoveryPrompt,
        recoveries,
      });
    }

    await sleep(config.pollMs);
  }

  const endedAt = Date.now();
  const summary = {
    agentId: config.agentId,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationMs: endedAt - startedAt,
    completedTurns,
    recoveries,
    failedSnapshots,
    stalledIntervals,
    screenshots,
    eventLog: eventsPath,
    screenshotsDir,
    baseUrl: config.baseUrl,
  };

  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await appendJsonl(eventsPath, {
    ts: nowIso(),
    type: 'run.complete',
    summary,
  });
} catch (error) {
  const failure = {
    ts: nowIso(),
    type: 'run.failure',
    message: error instanceof Error ? error.message : String(error),
  };
  await appendJsonl(eventsPath, failure);
  await fs.writeFile(summaryPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  await Promise.allSettled([
    page?.close(),
    context?.close(),
    browser?.close(),
  ]);
}
