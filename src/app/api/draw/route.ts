// POST /api/draw — streaming AI drawing endpoint (stub)
export async function POST(_request: Request): Promise<Response> {
  return new Response(
    JSON.stringify({ message: 'Draw endpoint not yet implemented' }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
