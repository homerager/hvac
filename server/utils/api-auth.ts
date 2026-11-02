export type ApiAuthMode = 'skip' | 'optional' | 'required'

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

/**
 * Health stays anonymous so a broken session secret cannot hide an outage.
 * Login establishes a session. Logout and the session reads succeed without one
 * so the browser can clear a dead cookie and learn that nobody is signed in.
 * Company branding is readable without a session so the mark matches on the
 * sign-in page and after login. Changes stay on the authenticated settings routes.
 * A missing method is not treated as a public read.
 */
export function apiAuthMode(pathname: string, method?: string): ApiAuthMode {
  const path = normalizePath(pathname)
  if (!path.startsWith('/api/') || path === '/api/health' || path === '/api/auth/login') return 'skip'
  if (isPublicBrandingRead(path, method)) return 'skip'
  if (
    path === '/api/auth/logout'
    || path === '/api/auth/session'
    || path.startsWith('/api/_auth/')
  ) {
    return 'optional'
  }
  return 'required'
}

function isPublicBrandingRead(path: string, method: string | undefined): boolean {
  if (path !== '/api/branding' && path !== '/api/branding/logo') return false
  const verb = method?.toUpperCase()
  return verb === 'GET' || verb === 'HEAD'
}
