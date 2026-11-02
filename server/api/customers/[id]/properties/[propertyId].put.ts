import { propertyInputSchema } from '../../../../../shared/utils/customers'
import { updateProperty } from '../../../../services/customers'
import { readParsed, requireCustomers, routeParam } from '../../../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  const input = await readParsed(event, propertyInputSchema, 'Check the property and try again.')
  return updateProperty(routeParam(event, 'id'), routeParam(event, 'propertyId'), input)
})
