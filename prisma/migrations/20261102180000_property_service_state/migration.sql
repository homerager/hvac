-- Tax context comes from the property (BR-02). The pilot serves New York and New Jersey only.
ALTER TABLE "Property" ADD CONSTRAINT "Property_service_state" CHECK ("state" IN ('NY', 'NJ'));
