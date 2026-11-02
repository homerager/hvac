import { getCustomer } from '../../services/customers'
import { requireCustomers, routeParam } from '../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  return getCustomer(routeParam(event, 'id'))
})
