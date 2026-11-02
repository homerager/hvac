import { z } from 'zod'
import { normalizeEmail } from './email'

export const LOGIN_RATE_LIMIT_MESSAGE = 'Too many sign-in attempts. Try again later.'

export const loginSchema = z.object({
  email: z.string().transform(normalizeEmail).pipe(z.string().min(1).max(254).pipe(z.email())),
  password: z.string().min(1).max(1024),
})

export type LoginInput = z.infer<typeof loginSchema>
