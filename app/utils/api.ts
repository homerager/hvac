type ApiOptions = {
  method?: 'PUT' | 'POST' | 'DELETE'
  body?: unknown
}

/**
 * Calls the app API without Nitro's route-literal matcher.
 * That matcher overflows TypeScript once branding routes are included.
 */
export function apiFetch<T>(path: string, options?: ApiOptions): Promise<T> {
  // Server renders must forward the session cookie. A bare $fetch does not.
  const request = (import.meta.server ? useRequestFetch() : $fetch) as (path: string, options?: ApiOptions) => Promise<T>
  return request(path, options)
}

export function apiErrorMessage(caught: unknown, fallback: string): string {
  const body = apiErrorBody(caught)
  const message = body?.statusMessage ?? body?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

export function apiErrorFields(caught: unknown): Record<string, string> {
  const body = apiErrorBody(caught)
  const payload = body && isRecord(body.data) ? body.data : body
  const fields = payload && isRecord(payload.fields) ? payload.fields : undefined
  if (!fields) return {}
  const result: Record<string, string> = {}
  for (const [key, message] of Object.entries(fields)) {
    if (typeof message === 'string' && message) result[key] = message
  }
  return result
}

function apiErrorBody(caught: unknown): Record<string, unknown> | undefined {
  if (!isRecord(caught) || !isRecord(caught.data)) return undefined
  return caught.data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
