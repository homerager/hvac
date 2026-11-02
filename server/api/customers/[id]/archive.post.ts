import { archiveCustomer } from '../../../services/customers'
import { requireCustomers, routeParam } from '../../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  return archiveCustomer(routeParam(event, 'id'))
})
