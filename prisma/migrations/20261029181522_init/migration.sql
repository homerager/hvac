-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'OWNER', 'DISPATCHER', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('COMMERCIAL', 'RESIDENTIAL');

-- CreateEnum
CREATE TYPE "RequestSource" AS ENUM ('MANUAL', 'API');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'CONVERTED', 'DUPLICATE', 'REJECTED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('NEW', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "JobPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "VisitOutcome" AS ENUM ('COMPLETED', 'FOLLOW_UP_NEEDED', 'FAILED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('LABOR', 'PART', 'SERVICE_CALL', 'OTHER');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PHOTO', 'NAMEPLATE', 'CHECK_PHOTO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'FINALIZED', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceAdjustmentKind" AS ENUM ('DISCOUNT', 'CREDIT', 'CORRECTION', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE', 'CASH', 'CHECK', 'VENMO', 'ZELLE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'DISPUTED', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "notes" TEXT,
    "isContract" BOOLEAN NOT NULL DEFAULT false,
    "billingContactId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "name" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "postalCode" TEXT NOT NULL,
    "taxJurisdiction" TEXT,
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "accessNotes" TEXT,
    "siteContactId" UUID,
    "billingContactId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "location" TEXT,
    "installedOn" DATE,
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" UUID NOT NULL,
    "source" "RequestSource" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "idempotencyKey" TEXT,
    "fingerprint" TEXT,
    "rawPayload" JSONB,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "address" TEXT,
    "description" TEXT NOT NULL,
    "preferredWindow" TEXT,
    "customerId" UUID,
    "propertyId" UUID,
    "duplicateOfId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'NEW',
    "priority" "JobPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requestId" UUID,
    "customerId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "scheduledStart" TIMESTAMPTZ(3),
    "scheduledEnd" TIMESTAMPTZ(3),
    "assignedToId" UUID,
    "serviceCallWaived" BOOLEAN NOT NULL DEFAULT false,
    "serviceCallWaivedById" UUID,
    "serviceCallWaiveReason" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkEntry" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "clientId" TEXT,
    "authorId" UUID NOT NULL,
    "arrivedAt" TIMESTAMPTZ(3),
    "departedAt" TIMESTAMPTZ(3),
    "outcome" "VisitOutcome",
    "workPerformed" TEXT,
    "notes" TEXT,
    "outcomeReason" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkEntryLine" (
    "id" UUID NOT NULL,
    "workEntryId" UUID NOT NULL,
    "type" "ChargeType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPriceCents" INTEGER,
    "partNumber" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "uploadedById" UUID NOT NULL,
    "jobId" UUID,
    "workEntryId" UUID,
    "equipmentId" UUID,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "jobId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "billToName" TEXT,
    "billToEmail" TEXT,
    "billToPhone" TEXT,
    "billToAddress" TEXT,
    "taxState" CHAR(2),
    "taxJurisdiction" TEXT,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxableCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "issuedAt" TIMESTAMPTZ(3),
    "dueDate" DATE,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "finalizedById" UUID,
    "finalizedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "deliveryStatus" "DeliveryStatus",
    "deliveryError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "ChargeType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "amountCents" INTEGER NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "sourceWorkEntryLineId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAdjustment" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "kind" "InvoiceAdjustmentKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "receivedOn" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "checkPhotoId" UUID,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "failureReason" TEXT,
    "recordedById" UUID,
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ(3),
    "error" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "_WorkEntryParticipants" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_WorkEntryParticipants_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EquipmentToJob" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_EquipmentToJob_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_JobCollaborators" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_JobCollaborators_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_billingContactId_key" ON "Customer"("billingContactId");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Contact_customerId_idx" ON "Contact"("customerId");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_phone_idx" ON "Contact"("phone");

-- CreateIndex
CREATE INDEX "Property_customerId_idx" ON "Property"("customerId");

-- CreateIndex
CREATE INDEX "Property_postalCode_idx" ON "Property"("postalCode");

-- CreateIndex
CREATE INDEX "Equipment_propertyId_idx" ON "Equipment"("propertyId");

-- CreateIndex
CREATE INDEX "Equipment_serialNumber_idx" ON "Equipment"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Request_idempotencyKey_key" ON "Request"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Request_status_createdAt_idx" ON "Request"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Request_fingerprint_idx" ON "Request"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "Job_number_key" ON "Job"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Job_requestId_key" ON "Job"("requestId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_assignedToId_scheduledStart_idx" ON "Job"("assignedToId", "scheduledStart");

-- CreateIndex
CREATE INDEX "Job_scheduledStart_idx" ON "Job"("scheduledStart");

-- CreateIndex
CREATE INDEX "Job_customerId_idx" ON "Job"("customerId");

-- CreateIndex
CREATE INDEX "Job_propertyId_idx" ON "Job"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkEntry_clientId_key" ON "WorkEntry"("clientId");

-- CreateIndex
CREATE INDEX "WorkEntry_jobId_idx" ON "WorkEntry"("jobId");

-- CreateIndex
CREATE INDEX "WorkEntry_authorId_arrivedAt_idx" ON "WorkEntry"("authorId", "arrivedAt");

-- CreateIndex
CREATE INDEX "WorkEntryLine_workEntryId_idx" ON "WorkEntryLine"("workEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_jobId_idx" ON "Attachment"("jobId");

-- CreateIndex
CREATE INDEX "Attachment_workEntryId_idx" ON "Attachment"("workEntryId");

-- CreateIndex
CREATE INDEX "Attachment_equipmentId_idx" ON "Attachment"("equipmentId");

-- CreateIndex
CREATE INDEX "Attachment_kind_createdAt_idx" ON "Attachment"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_jobId_key" ON "Invoice"("jobId");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_position_key" ON "InvoiceLine"("invoiceId", "position");

-- CreateIndex
CREATE INDEX "InvoiceAdjustment_invoiceId_idx" ON "InvoiceAdjustment"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_checkPhotoId_key" ON "Payment"("checkPhotoId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_status_idx" ON "Payment"("invoiceId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "_WorkEntryParticipants_B_index" ON "_WorkEntryParticipants"("B");

-- CreateIndex
CREATE INDEX "_EquipmentToJob_B_index" ON "_EquipmentToJob"("B");

-- CreateIndex
CREATE INDEX "_JobCollaborators_B_index" ON "_JobCollaborators"("B");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_billingContactId_fkey" FOREIGN KEY ("billingContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_siteContactId_fkey" FOREIGN KEY ("siteContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_billingContactId_fkey" FOREIGN KEY ("billingContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_serviceCallWaivedById_fkey" FOREIGN KEY ("serviceCallWaivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEntryLine" ADD CONSTRAINT "WorkEntryLine_workEntryId_fkey" FOREIGN KEY ("workEntryId") REFERENCES "WorkEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workEntryId_fkey" FOREIGN KEY ("workEntryId") REFERENCES "WorkEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_sourceWorkEntryLineId_fkey" FOREIGN KEY ("sourceWorkEntryLineId") REFERENCES "WorkEntryLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_checkPhotoId_fkey" FOREIGN KEY ("checkPhotoId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkEntryParticipants" ADD CONSTRAINT "_WorkEntryParticipants_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkEntryParticipants" ADD CONSTRAINT "_WorkEntryParticipants_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EquipmentToJob" ADD CONSTRAINT "_EquipmentToJob_A_fkey" FOREIGN KEY ("A") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EquipmentToJob" ADD CONSTRAINT "_EquipmentToJob_B_fkey" FOREIGN KEY ("B") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobCollaborators" ADD CONSTRAINT "_JobCollaborators_A_fkey" FOREIGN KEY ("A") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobCollaborators" ADD CONSTRAINT "_JobCollaborators_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written CHECK constraints (not expressible in schema.prisma) ───

-- A check payment cannot exist without a photo of the check (BR-10).
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_check_requires_photo" CHECK ("method" <> 'CHECK' OR "checkPhotoId" IS NOT NULL);
-- Stripe payments carry a PaymentIntent id; manual payments never do.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_stripe_intent_matches_method" CHECK (("method" = 'STRIPE') = ("stripePaymentIntentId" IS NOT NULL));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refund_within_amount" CHECK ("refundedCents" >= 0 AND "refundedCents" <= "amountCents");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_non_negative" CHECK (
  "subtotalCents" >= 0 AND "discountCents" >= 0 AND "taxableCents" >= 0
  AND "taxCents" >= 0 AND "totalCents" >= 0 AND "taxRateBps" >= 0
);
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_values_valid" CHECK (
  "quantity" > 0 AND "unitPriceCents" >= 0 AND "discountCents" >= 0
);
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_amount_non_zero" CHECK ("amountCents" <> 0);

ALTER TABLE "WorkEntryLine" ADD CONSTRAINT "WorkEntryLine_values_valid" CHECK (
  "quantity" > 0 AND ("unitPriceCents" IS NULL OR "unitPriceCents" >= 0)
);

ALTER TABLE "Job" ADD CONSTRAINT "Job_schedule_window_valid" CHECK (
  "scheduledStart" IS NULL OR "scheduledEnd" IS NULL OR "scheduledEnd" > "scheduledStart"
);
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_times_valid" CHECK (
  "arrivedAt" IS NULL OR "departedAt" IS NULL OR "departedAt" >= "arrivedAt"
);

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_size_non_negative" CHECK ("sizeBytes" >= 0);
