import { normalizeEmail } from '../../shared/utils/email'
import { usePrisma } from '../utils/prisma'

const WINDOW_MS = 15 * 60 * 1000

export const LOGIN_EMAIL_LIMIT = 5
export const LOGIN_IP_LIMIT = 10

export function loginAttemptEmailKey(email: string): string {
  return `email:${normalizeEmail(email)}`
}

function loginAttemptIpKey(ip: string): string {
  return `ip:${ip}`
}

/**
 * Counts this attempt and returns false when the email or IP window is already full.
 * The caller must do this before scrypt. A missing IP is not bucketed with other missing IPs.
 * Two overlapping requests can both pass the count; that race is accepted.
 */
export async function consumeLoginAttempt(input: { email: string, ip: string | null }): Promise<boolean> {
  const prisma = usePrisma()
  const cutoff = new Date(Date.now() - WINDOW_MS)
  await prisma.loginAttempt.deleteMany({
    where: { attemptedAt: { lt: cutoff } },
  })

  const emailKey = loginAttemptEmailKey(input.email)
  const ipKey = input.ip ? loginAttemptIpKey(input.ip) : null
  const emailCount = await prisma.loginAttempt.count({
    where: { key: emailKey, attemptedAt: { gte: cutoff } },
  })
  if (emailCount >= LOGIN_EMAIL_LIMIT) return false

  if (ipKey) {
    const ipCount = await prisma.loginAttempt.count({
      where: { key: ipKey, attemptedAt: { gte: cutoff } },
    })
    if (ipCount >= LOGIN_IP_LIMIT) return false
  }

  await prisma.loginAttempt.createMany({
    data: ipKey ? [{ key: emailKey }, { key: ipKey }] : [{ key: emailKey }],
  })
  return true
}

export async function clearEmailLoginAttempts(email: string): Promise<void> {
  await usePrisma().loginAttempt.deleteMany({
    where: { key: loginAttemptEmailKey(email) },
  })
}
