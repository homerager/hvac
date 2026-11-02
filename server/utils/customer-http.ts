import type { H3Event } from 'h3'
import { createError, getRouterParam, readBody } from 'h3'
import type { z } from 'zod'
import { formFieldErrors } from '../../shared/utils/customers'
import { requirePermission } from './rbac'

export function requireCustomers(event: H3Event) {
  return requirePermission(event, 'customers.manage')
}

export function routeParam(event: H3Event, name: string): string {
  return getRouterParam(event, name) ?? ''
}

export async function readParsed<T>(event: H3Event, schema: z.ZodType<T>, statusMessage: string): Promise<T> {
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage,
      data: { fields: formFieldErrors(parsed.error) },
    })
  }
  return parsed.data
}
