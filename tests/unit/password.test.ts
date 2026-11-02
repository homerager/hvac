import { describe, expect, it } from 'vitest'
import { hashPassword, needsRehash, PASSWORD_SCRYPT, verifyPassword } from '../../server/services/password'

const PASSWORD = 'ServoraDemo!'

describe('password', () => {
  it('verifies a matching password and rejects the others', async () => {
    const hash = await hashPassword(PASSWORD)
    expect(hash.startsWith(`scrypt$${PASSWORD_SCRYPT.n}$${PASSWORD_SCRYPT.r}$${PASSWORD_SCRYPT.p}$`)).toBe(true)
    expect(PASSWORD_SCRYPT).toEqual({ n: 2 ** 16, r: 8, p: 1 })
    expect(await verifyPassword(hash, PASSWORD)).toBe(true)
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false)
    expect(await verifyPassword('not-a-hash', PASSWORD)).toBe(false)
    expect(await verifyPassword('scrypt$999999999$8$1$c2FsdA$aGFzaA', PASSWORD)).toBe(false)
  })

  it('still verifies a hash stored at N=16384 and marks it for rehash', async () => {
    const legacy = await hashPassword(PASSWORD, { n: 16_384, r: 8, p: 1 })
    expect(legacy.startsWith('scrypt$16384$8$1$')).toBe(true)
    expect(await verifyPassword(legacy, PASSWORD)).toBe(true)
    expect(await verifyPassword(legacy, 'wrong-password')).toBe(false)
    expect(needsRehash(legacy)).toBe(true)
    expect(needsRehash(await hashPassword(PASSWORD))).toBe(false)
    expect(needsRehash('not-a-hash')).toBe(false)
  })

  it('verifies a hash at N=131072 without a maxmem error', async () => {
    const hash = await hashPassword(PASSWORD, { n: 131_072, r: 8, p: 1 })
    expect(await verifyPassword(hash, PASSWORD)).toBe(true)
    expect(needsRehash(hash)).toBe(true)
  }, 20_000)
})
