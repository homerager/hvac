import { getRequestIP } from 'h3'
import { apiAuthMode } from '../utils/api-auth'
import { bindAuditContext } from '../utils/audit-context'
import { findActiveUser, sessionUserId } from '../services/auth'
import { sessionCookie } from '../utils/session'

export default defineEventHandler(async (event) => {
  const mode = apiAuthMode(getRequestURL(event).pathname)
  if (mode === 'skip') return

  const session = await getUserSession(event)
  const userId = sessionUserId(session.user)
  if (!userId) {
    bindAudit(event, null)
    if (mode === 'required') {
      throw createError({ statusCode: 401, statusMessage: 'Authentication required.' })
    }
    return
  }

  const user = await findActiveUser(userId)
  if (!user) {
    await clearUserSession(event)
    bindAudit(event, null)
    if (mode === 'required') {
      throw createError({ statusCode: 401, statusMessage: 'Authentication required.' })
    }
    return
  }

  event.context.auth = user
  const sessionUser = session.user
  if (!sessionUser || sessionUser.role !== user.role || sessionUser.email !== user.email || sessionUser.name !== user.name) {
    await setUserSession(event, { user }, sessionCookie)
  }
  bindAudit(event, user.id)
})

function bindAudit(event: Parameters<typeof getRequestIP>[0], actorId: string | null) {
  bindAuditContext({
    actorId,
    ipAddress: getRequestIP(event) ?? null,
  })
}
