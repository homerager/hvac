import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { afterAll, describe, expect, it } from 'vitest'
import { authenticate, signIn } from '../../server/services/auth'
import { LOGIN_EMAIL_LIMIT, LOGIN_IP_LIMIT, loginAttemptEmailKey } from '../../server/services/login-attempt'
import { hashPassword, needsRehash, PASSWORD_SCRYPT, verifyPassword } from '../../server/services/password'
import { usePrisma } from '../../server/utils/prisma'

const describeDb = process.env.DATABASE_URL && process.env.NUXT_SESSION_PASSWORD ? describe : describe.skip
const PASSWORD = 'ServoraDemo!'

describeDb('auth security', () => {
  const stamp = randomUUID()
  const email = `auth-${stamp}@x.com`
  const ip = `test-${stamp}`
  let userId: string | undefined

  afterAll(async () => {
    const prisma = usePrisma()
    if (userId) {
      await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: userId }, { actorId: userId }] } })
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
    }
    await prisma.loginAttempt.deleteMany({
      where: { OR: [{ key: { contains: stamp } }, { key: loginAttemptEmailKey(email) }] },
    })
    await prisma.$disconnect()
  })

  it('returns null for an unknown email, an inactive user, and a wrong password', async () => {
    expect(await authenticate(`missing-${stamp}@x.com`, PASSWORD)).toBeNull()

    const prisma = usePrisma()
    const created = await prisma.user.create({
      data: {
        email,
        name: 'Auth Test',
        role: 'TECHNICIAN',
        isActive: false,
        passwordHash: await hashPassword(PASSWORD),
      },
    })
    userId = created.id
    expect(await authenticate(email, PASSWORD)).toBeNull()

    await prisma.user.update({ where: { id: created.id }, data: { isActive: true } })
    expect(await authenticate(email, 'wrong-password')).toBeNull()
    expect((await prisma.user.findUnique({ where: { id: created.id } }))?.lastLoginAt).toBeNull()
  }, 30_000)

  it('treats User@X.com and user@x.com as the same account and rehashes an old cost', async () => {
    if (!userId) throw new Error('user was not created')
    const prisma = usePrisma()
    const legacy = await hashPassword(PASSWORD, { n: 16_384, r: 8, p: 1 })
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: legacy, lastLoginAt: null },
    })

    const signedIn = await authenticate(`  AUTH-${stamp}@X.com  `, PASSWORD)
    expect(signedIn).toMatchObject({ id: userId, email })

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(stored.passwordHash?.startsWith(`scrypt$${PASSWORD_SCRYPT.n}$8$1$`)).toBe(true)
    expect(needsRehash(stored.passwordHash ?? '')).toBe(false)
    expect(await verifyPassword(stored.passwordHash ?? '', PASSWORD)).toBe(true)
    expect(stored.lastLoginAt).not.toBeNull()
  }, 30_000)

  it('limits attempts and clears the email counter after a successful sign-in', async () => {
    expect(LOGIN_EMAIL_LIMIT).toBe(5)
    expect(LOGIN_IP_LIMIT).toBe(10)

    const prisma = usePrisma()
    await prisma.loginAttempt.create({
      data: {
        key: loginAttemptEmailKey(email),
        attemptedAt: new Date(Date.now() - 16 * 60 * 1000),
      },
    })

    for (let attempt = 0; attempt < LOGIN_EMAIL_LIMIT; attempt++) {
      expect(await signIn({ email, password: 'wrong-password', ip: null })).toEqual({ status: 'invalid' })
    }
    const limitedAt = performance.now()
    expect(await signIn({ email: `  AUTH-${stamp}@X.com `, password: 'wrong-password', ip: null })).toEqual({ status: 'limited' })
    expect(performance.now() - limitedAt).toBeLessThan(120)
    expect(await prisma.loginAttempt.count({ where: { key: loginAttemptEmailKey(email) } })).toBe(LOGIN_EMAIL_LIMIT)

    await prisma.loginAttempt.deleteMany({ where: { key: loginAttemptEmailKey(email) } })
    for (let attempt = 0; attempt < LOGIN_EMAIL_LIMIT - 1; attempt++) {
      expect(await signIn({ email, password: 'wrong-password', ip })).toEqual({ status: 'invalid' })
    }
    expect(await signIn({ email, password: PASSWORD, ip })).toMatchObject({ status: 'ok', user: { email } })
    expect(await prisma.loginAttempt.count({ where: { key: loginAttemptEmailKey(email) } })).toBe(0)
    expect(await prisma.loginAttempt.count({ where: { key: `ip:${ip}` } })).toBe(LOGIN_EMAIL_LIMIT)

    for (let attempt = 0; attempt < LOGIN_IP_LIMIT - LOGIN_EMAIL_LIMIT; attempt++) {
      expect(await signIn({
        email: `missing-${stamp}-${attempt}@x.com`,
        password: 'wrong-password',
        ip,
      })).toEqual({ status: 'invalid' })
    }
    expect(await signIn({ email: `other-${stamp}@x.com`, password: PASSWORD, ip })).toEqual({ status: 'limited' })
    expect(await signIn({ email: `nobody-${stamp}@x.com`, password: 'wrong-password', ip })).toEqual({ status: 'limited' })
  }, 60_000)
})
