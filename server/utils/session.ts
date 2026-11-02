import type { H3Event } from 'h3'

/** Signed-in sessions last two weeks. The sealing password comes from NUXT_SESSION_PASSWORD. */
export const sessionCookie = {
  maxAge: 60 * 60 * 24 * 14,
}

/**
 * Drop the incoming session cookie before a new seal.
 * replaceUserSession clears the stored session, then h3 reads this request's
 * cookie and would otherwise restore the same id.
 */
export function dropIncomingSession(event: H3Event) {
  const name = useRuntimeConfig(event).session.name || 'nuxt-session'
  const headers = event.node?.req.headers
  if (!headers || typeof headers.cookie !== 'string') return
  const kept = headers.cookie
    .split(';')
    .map(part => part.trim())
    .filter(part => part.length > 0 && !part.startsWith(`${name}=`))
  if (kept.length === 0) delete headers.cookie
  else headers.cookie = kept.join('; ')
}
