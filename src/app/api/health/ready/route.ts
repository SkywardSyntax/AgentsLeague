import { getServerEnv } from '@/lib/server/env';

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

  return Response.json(
    {
      ready: allPassed,
      checks: { env_valid: envValid },
      ts: Date.now(),
    },
    { status },
  );
}
