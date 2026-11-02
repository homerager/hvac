import { send } from 'h3'
import { readCompanyLogo } from '../../services/branding'

// `v` is only a cache buster. The handler always serves the current logo.
export default defineEventHandler(async (event) => {
  const logo = await readCompanyLogo()
  if (!logo) {
    throw createError({ statusCode: 404, statusMessage: 'No logo is set.' })
  }
  setHeader(event, 'content-type', logo.contentType)
  setHeader(event, 'cache-control', 'public, max-age=86400')
  setHeader(event, 'x-content-type-options', 'nosniff')
  return send(event, logo.bytes)
})
