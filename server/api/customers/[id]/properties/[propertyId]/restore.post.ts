import { restoreProperty } from '../../../../../services/customers'
import { requireCustomers, routeParam } from '../../../../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  return restoreProperty(routeParam(event, 'id'), routeParam(event, 'propertyId'))
})
