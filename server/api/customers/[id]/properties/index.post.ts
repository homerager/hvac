import { propertyInputSchema } from '../../../../../shared/utils/customers'
import { createProperty } from '../../../../services/customers'
import { readParsed, requireCustomers, routeParam } from '../../../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  const input = await readParsed(event, propertyInputSchema, 'Check the property and try again.')
  return createProperty(routeParam(event, 'id'), input)
})
