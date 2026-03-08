import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  // Allow health checks without auth (used by load balancers and readiness probes)
  const path = req.nextUrl.pathname;
  if (path === '/api/health' || path === '/api/health/ready') return NextResponse.next()

  const apiKey = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  const serverKey = process.env.API_SECRET_KEY

  // If no key is configured, allow in dev only
  if (!serverKey) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 })
    }
    return NextResponse.next()
  }

  if (!apiKey || apiKey !== serverKey) {
    return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_API_KEY' }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
