import { normalizeEmail } from '../../shared/utils/email'
import { isRole, type AuthUser } from '../../shared/utils/rbac'
import { clearEmailLoginAttempts, consumeLoginAttempt } from './login-attempt'
import { hashPassword, needsRehash, verifyPassword } from './password'
import { usePrisma } from '../utils/prisma'

let dummyHash: Promise<string> | undefined

/**
 * One shared scrypt for every unknown email, at the current N/r/p.
 * A failed computation is dropped so the next request can try again.
 */
function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword('invalid-password-placeholder').catch((error: unknown) => {
    dummyHash = undefined
    throw error
  })
  return dummyHash
}

export async function findActiveUser(id: string): Promise<AuthUser | null> {
  const user = await usePrisma().user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  })
  if (!user?.isActive || !isRole(user.role)) return null
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

/**
 * Checks the password even when the email is unknown, so the response time
 * does not reveal which accounts exist. Email is normalized before lookup.
 */
export async function authenticate(email: string, password: string): Promise<AuthUser | null> {
  const user = await usePrisma().user.findUnique({ where: { email: normalizeEmail(email) } })
  const valid = await verifyPassword(user?.passwordHash ?? await dummyPasswordHash(), password)
  if (!user?.passwordHash || !user.isActive || !isRole(user.role) || !valid) return null

  const passwordHash = needsRehash(user.passwordHash) ? await hashPassword(password) : undefined
  await usePrisma().user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      ...(passwordHash ? { passwordHash } : {}),
    },
  })

  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

export type SignInResult
  = | { status: 'ok', user: AuthUser }
    | { status: 'invalid' }
    | { status: 'limited' }

/** Rate limit first, then the password check. A success clears only the email counter. */
export async function signIn(input: { email: string, password: string, ip: string | null }): Promise<SignInResult> {
  const email = normalizeEmail(input.email)
  if (!(await consumeLoginAttempt({ email, ip: input.ip }))) {
    return { status: 'limited' }
  }

  const user = await authenticate(email, input.password)
  if (!user) return { status: 'invalid' }

  await clearEmailLoginAttempts(email)
  return { status: 'ok', user }
}

export function sessionUserId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const id = (value as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : null
}
