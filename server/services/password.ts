import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

type ScryptParams = { n: number, r: number, p: number }

const SCRYPT_N = 2 ** 16
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64
const MAX_N = 131_072

export const PASSWORD_SCRYPT = { n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P } as const

/**
 * OpenSSL needs about `128 * N * r * p` bytes. Twice that keeps N=131072 from
 * being rejected by the default 32 MiB cap, including hashes stored at an older cost.
 */
function scryptMaxMemory(n: number, r: number, p: number): number {
  return 256 * n * r * p
}

function scrypt(password: string, salt: Buffer, keyLength: number, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, {
      N: params.n,
      r: params.r,
      p: params.p,
      maxmem: scryptMaxMemory(params.n, params.r, params.p),
    }, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

/** Format stays `scrypt$N$r$p$salt$hash`. Verification reads N/r/p from the hash. */
export async function hashPassword(password: string, params: ScryptParams = PASSWORD_SCRYPT): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEY_LENGTH, params)
  return encodeHash(params.n, params.r, params.p, salt, hash)
}

export async function verifyPassword(hashedPassword: string, password: string): Promise<boolean> {
  const parsed = decodeHash(hashedPassword)
  if (!parsed) return false
  const actual = await scrypt(password, parsed.salt, parsed.hash.length, parsed)
  if (actual.length !== parsed.hash.length) return false
  return timingSafeEqual(actual, parsed.hash)
}

export function needsRehash(hashedPassword: string): boolean {
  const parsed = decodeHash(hashedPassword)
  if (!parsed) return false
  return parsed.n !== SCRYPT_N || parsed.r !== SCRYPT_R || parsed.p !== SCRYPT_P
}

function encodeHash(n: number, r: number, p: number, salt: Buffer, hash: Buffer): string {
  return `scrypt$${n}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

function decodeHash(value: string): { n: number, r: number, p: number, salt: Buffer, hash: Buffer } | null {
  const parts = value.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null
  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(n) || n < 2 || n > MAX_N || (n & (n - 1)) !== 0) return null
  if (!Number.isInteger(r) || r < 1 || r > 32) return null
  if (!Number.isInteger(p) || p < 1 || p > 16) return null
  try {
    const salt = Buffer.from(parts[4] ?? '', 'base64url')
    const hash = Buffer.from(parts[5] ?? '', 'base64url')
    if (salt.length < 8 || hash.length < 16) return null
    return { n, r, p, salt, hash }
  }
  catch {
    return null
  }
}
