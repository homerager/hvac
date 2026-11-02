type ApiOptions = {
  method?: 'PUT' | 'POST' | 'DELETE'
  body?: unknown
}

/**
 * Calls the app API without Nitro's route-literal matcher.
 * That matcher overflows TypeScript once branding routes are included.
 */
export function apiFetch<T>(path: string, options?: ApiOptions): Promise<T> {
  const request = $fetch as (path: string, options?: ApiOptions) => Promise<T>
  return request(path, options)
}
