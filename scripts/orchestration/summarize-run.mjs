#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const runDirArg = process.argv[2];
if (!runDirArg) {
  console.error('Usage: node scripts/orchestration/summarize-run.mjs <runDir>');
  process.exit(1);
}

const runDir = path.resolve(runDirArg);
const entries = await fs.readdir(runDir, { withFileTypes: true });
const agentDirs = entries
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('agent-'))
  .map((entry) => entry.name)
  .sort();

const summaries = [];
for (const agentName of agentDirs) {
  const summaryPath = path.join(runDir, agentName, 'summary.json');
  try {
    const raw = await fs.readFile(summaryPath, 'utf8');
    const parsed = JSON.parse(raw);
    summaries.push({ agentName, ...parsed });
  } catch (error) {
    summaries.push({
      agentName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const successful = summaries.filter((item) => !item.error && typeof item.completedTurns === 'number');
const totals = {
  agents: summaries.length,
  successfulAgents: successful.length,
  failedAgents: summaries.length - successful.length,
  totalTurns: successful.reduce((sum, item) => sum + (item.completedTurns ?? 0), 0),
  totalRecoveries: successful.reduce((sum, item) => sum + (item.recoveries ?? 0), 0),
  totalScreenshots: successful.reduce((sum, item) => sum + (item.screenshots ?? 0), 0),
};

const aggregate = {
  runDir,
  generatedAt: new Date().toISOString(),
  totals,
  lanes: summaries,
};

const summaryJsonPath = path.join(runDir, 'aggregate-summary.json');
await fs.writeFile(summaryJsonPath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');

const lines = [];
lines.push('# Orchestration Run Summary');
lines.push('');
lines.push(`- Run dir: \`${runDir}\``);
lines.push(`- Generated: ${aggregate.generatedAt}`);
lines.push(`- Agents: ${totals.agents}`);
lines.push(`- Successful lanes: ${totals.successfulAgents}`);
lines.push(`- Failed lanes: ${totals.failedAgents}`);
lines.push(`- Total turns: ${totals.totalTurns}`);
lines.push(`- Total recoveries: ${totals.totalRecoveries}`);
lines.push(`- Total screenshots: ${totals.totalScreenshots}`);
lines.push('');
lines.push('## Lane Results');
for (const lane of summaries) {
  if (lane.error) {
    lines.push(`- ${lane.agentName}: FAILED (${lane.error})`);
  } else {
    lines.push(
      `- ${lane.agentName}: turns=${lane.completedTurns} recoveries=${lane.recoveries} screenshots=${lane.screenshots} durationMs=${lane.durationMs}`,
    );
  }
}

const summaryMdPath = path.join(runDir, 'aggregate-summary.md');
await fs.writeFile(summaryMdPath, `${lines.join('\n')}\n`, 'utf8');

console.log(`Wrote:\n- ${summaryJsonPath}\n- ${summaryMdPath}`);
