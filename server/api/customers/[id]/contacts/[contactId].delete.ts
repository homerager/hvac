import { deleteContact } from '../../../../services/customers'
import { requireCustomers, routeParam } from '../../../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  return deleteContact(routeParam(event, 'id'), routeParam(event, 'contactId'))
})
