import { requirePermission } from '../../utils/rbac'
import { replaceCompanyLogo } from '../../services/branding'
import { LOGO_MAX_BYTES } from '../../../shared/utils/branding'

const MAX_BODY_BYTES = LOGO_MAX_BYTES + 32 * 1024

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'settings.manage')
  const length = Number(getRequestHeader(event, 'content-length') ?? '')
  if (!Number.isFinite(length) || length <= 0) {
    throw createError({ statusCode: 411, statusMessage: 'Choose a PNG, JPEG, or WebP logo.' })
  }
  if (length > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Logo must be 1 MB or smaller.' })
  }

  const parts = await readMultipartFormData(event)
  const part = parts?.find(item => item.name === 'logo' && item.data.length > 0)
  if (!part) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a PNG, JPEG, or WebP logo.' })
  }

  return replaceCompanyLogo({
    bytes: part.data,
    fileName: part.filename,
    actorId: actor.id,
  })
})
