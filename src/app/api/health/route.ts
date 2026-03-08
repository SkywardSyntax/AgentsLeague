import { getServerEnv } from '@/lib/server/env';
import { createLogger } from '@/lib/server/logger';

const processStartTime = Date.now();
const log = createLogger({ route: '/api/health' });

export async function GET() {
  let envValid = false;
  try {
    getServerEnv();
    envValid = true;
  } catch {
    // env invalid
  }

  const checks = { env_valid: envValid };
  const ok = envValid;
  const uptimeMs = Date.now() - processStartTime;

  log.debug('health_check', { ok, env_valid: envValid, uptime_ms: uptimeMs });

  return Response.json(
    {
      status: 'ok',
      version: '1.0.0',
      ok,
      checks,
      uptime_ms: uptimeMs,
      node_version: process.version,
      ts: Date.now(),
    },
    { status: 200 },
  );
}
