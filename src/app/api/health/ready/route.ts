import { getServerEnv } from '@/lib/server/env';
import { createLogger } from '@/lib/server/logger';

const log = createLogger({ route: '/api/health/ready' });

export async function GET() {
  let envValid = false;
  try {
    getServerEnv();
    envValid = true;
  } catch {
    // env invalid
  }

  const allPassed = envValid;
  const status = allPassed ? 200 : 503;

  if (!allPassed) {
    log.warn('readiness_check_failed', { env_valid: envValid });
  } else {
    log.debug('readiness_check', { ready: true });
  }

  return Response.json(
    {
      ready: allPassed,
      checks: { env_valid: envValid },
      ts: Date.now(),
    },
    { status },
  );
}
