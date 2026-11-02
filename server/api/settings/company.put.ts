import { requirePermission } from '../../utils/rbac'
import { saveCompanySettings } from '../../services/branding'
import { companySettingsInputSchema, settingsFieldErrors } from '../../../shared/utils/branding'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'settings.manage')
  const parsed = companySettingsInputSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Check the company details and try again.',
      data: { fields: settingsFieldErrors(parsed.error) },
    })
  }
  return saveCompanySettings(parsed.data, actor.id)
})
