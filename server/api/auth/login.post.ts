import { getRequestIP } from 'h3'
import { LOGIN_RATE_LIMIT_MESSAGE, loginSchema } from '../../../shared/utils/login-schema'
import { signIn } from '../../services/auth'
import { dropIncomingSession, sessionCookie } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const parsed = loginSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid email and password.' })
  }

  const result = await signIn({
    email: parsed.data.email,
    password: parsed.data.password,
    ip: getRequestIP(event) ?? null,
  })
  if (result.status === 'limited') {
    throw createError({ statusCode: 429, statusMessage: LOGIN_RATE_LIMIT_MESSAGE })
  }
  if (result.status === 'invalid') {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' })
  }

  dropIncomingSession(event)
  await replaceUserSession(event, {
    user: result.user,
    loggedInAt: new Date().toISOString(),
  }, sessionCookie)
  event.context.auth = result.user
  return { user: result.user }
})
