import { restoreCustomer } from '../../../services/customers'
import { requireCustomers, routeParam } from '../../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  return restoreCustomer(routeParam(event, 'id'))
})
