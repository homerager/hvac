import { requirePermission } from '../../utils/rbac'
import { clearCompanyLogo } from '../../services/branding'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'settings.manage')
  return clearCompanyLogo(actor.id)
})
