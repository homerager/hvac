export type ApiAuthMode = 'skip' | 'optional' | 'required'

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

/**
 * Health stays anonymous so a broken session secret cannot hide an outage.
 * Login establishes a session. Logout and the session reads succeed without one
 * so the browser can clear a dead cookie and learn that nobody is signed in.
 */
export function apiAuthMode(pathname: string): ApiAuthMode {
  const path = normalizePath(pathname)
  if (!path.startsWith('/api/') || path === '/api/health' || path === '/api/auth/login') return 'skip'
  if (
    path === '/api/auth/logout'
    || path === '/api/auth/session'
    || path.startsWith('/api/_auth/')
  ) {
    return 'optional'
  }
  return 'required'
}
