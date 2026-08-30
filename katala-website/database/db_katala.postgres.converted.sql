-- Converted from C:/Users/AMD/Downloads/db_katala.sql for Supabase/PostgreSQL.
-- Review before applying. This is destructive: it drops/recreates the listed tables.
-- NOTE: This schema uses bigint IDs converted from the MySQL source and may not match the current React/API code, which expects UUID IDs for several tables.

BEGIN;

DROP TABLE IF EXISTS public.tbl_customer CASCADE;
CREATE TABLE public.tbl_customer (
    v_customerId bigserial NOT NULL,
    v_customerType varchar(50) NULL,
    v_firstName varchar(100) NULL,
    v_middleName varchar(100) NULL,
    v_lastName varchar(100) NULL,
    v_companyName varchar(150) NULL,
    v_contactPerson varchar(150) NULL,
    v_emailAddress varchar(150) NULL,
    v_mobileNumber varchar(30) NULL,
    v_telephoneNumber varchar(30) NULL,
    v_addressLine varchar(255) NULL,
    v_barangay varchar(100) NULL,
    v_cityMunicipality varchar(100) NULL,
    v_province varchar(100) NULL,
    v_postalCode varchar(20) NULL,
    v_notes TEXT NULL,
    v_isActive boolean NOT NULL DEFAULT TRUE,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_customerId)
);

DROP TABLE IF EXISTS public.tbl_product CASCADE;
CREATE TABLE public.tbl_product (
    v_productId bigserial NOT NULL,
    v_productCode varchar(60) NULL,
    v_productName varchar(150) NOT NULL,
    v_productCategory varchar(100) NULL,
    v_brand varchar(100) NULL,
    v_model varchar(100) NULL,
    v_productDescription TEXT NULL,
    v_unitOfMeasure varchar(50) NULL,
    v_currentPrice numeric(14,2) NULL,
    v_costPrice numeric(14,2) NULL,
    v_supplierReference varchar(150) NULL,
    v_warrantyPeriod varchar(100) NULL,
    v_isActive boolean NOT NULL DEFAULT TRUE,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_productId),
    CONSTRAINT uq_product_productcode UNIQUE (v_productCode)
);

DROP TABLE IF EXISTS public.tbl_productPriceHistory CASCADE;
CREATE TABLE public.tbl_productPriceHistory (
    v_productPriceHistoryId bigserial NOT NULL,
    v_productId bigint NOT NULL,
    v_oldPrice numeric(14,2) NULL,
    v_newPrice numeric(14,2) NOT NULL,
    v_effectiveDate timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_changeReason varchar(255) NULL,
    v_changedByUserId bigint NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (v_productPriceHistoryId),
    CONSTRAINT fk_productPriceHistory_product
        FOREIGN KEY (v_productId) REFERENCES tbl_product(v_productId)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

DROP TABLE IF EXISTS public.tbl_service CASCADE;
CREATE TABLE public.tbl_service (
    v_serviceId bigserial NOT NULL,
    v_serviceCode varchar(60) NULL,
    v_serviceName varchar(150) NOT NULL,
    v_serviceCategory varchar(100) NULL,
    v_serviceDescription TEXT NULL,
    v_basePrice numeric(14,2) NULL,
    v_isActive boolean NOT NULL DEFAULT TRUE,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_serviceId),
    CONSTRAINT uq_service_servicecode UNIQUE (v_serviceCode)
);

DROP TABLE IF EXISTS public.tbl_order CASCADE;
CREATE TABLE public.tbl_order (
    v_orderId bigserial NOT NULL,
    v_orderNumber varchar(60) NULL,
    v_customerId bigint NOT NULL,
    v_orderDate timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_orderStatus varchar(50) NULL,
    v_subtotalAmount numeric(14,2) NULL,
    v_discountAmount numeric(14,2) NOT NULL DEFAULT 0.00,
    v_deliveryFee numeric(14,2) NOT NULL DEFAULT 0.00,
    v_taxAmount numeric(14,2) NOT NULL DEFAULT 0.00,
    v_totalAmount numeric(14,2) NULL,
    v_orderNotes TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_orderId),
    CONSTRAINT uq_order_ordernumber UNIQUE (v_orderNumber),
    CONSTRAINT fk_order_customer
        FOREIGN KEY (v_customerId) REFERENCES tbl_customer(v_customerId)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

DROP TABLE IF EXISTS public.tbl_orderItem CASCADE;
CREATE TABLE public.tbl_orderItem (
    v_orderItemId bigserial NOT NULL,
    v_orderId bigint NOT NULL,
    v_productId bigint NOT NULL,
    v_productNameSnapshot varchar(150) NULL,
    v_quantity numeric(14,2) NOT NULL,
    v_unitPrice numeric(14,2) NOT NULL,
    v_discountAmount numeric(14,2) NOT NULL DEFAULT 0.00,
    v_lineAmount numeric(14,2)
        GENERATED ALWAYS AS ((v_quantity * v_unitPrice) - v_discountAmount) STORED,
    v_notes TEXT NULL,
    PRIMARY KEY (v_orderItemId),
    CONSTRAINT fk_orderItem_order
        FOREIGN KEY (v_orderId) REFERENCES tbl_order(v_orderId)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_orderItem_product
        FOREIGN KEY (v_productId) REFERENCES tbl_product(v_productId)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

DROP TABLE IF EXISTS public.tbl_deliveryPickup CASCADE;
CREATE TABLE public.tbl_deliveryPickup (
    v_deliveryPickupId bigserial NOT NULL,
    v_orderId bigint NOT NULL,
    v_fulfillmentType varchar(50) NOT NULL,
    v_recipientName varchar(150) NULL,
    v_recipientContactNumber varchar(30) NULL,
    v_deliveryAddress varchar(255) NULL,
    v_barangay varchar(100) NULL,
    v_cityMunicipality varchar(100) NULL,
    v_province varchar(100) NULL,
    v_postalCode varchar(20) NULL,
    v_pickupLocation varchar(255) NULL,
    v_scheduledDate timestamp with time zone NULL,
    v_completedDate timestamp with time zone NULL,
    v_fulfillmentStatus varchar(50) NULL,
    v_trackingReference varchar(100) NULL,
    v_deliveryPickupNotes TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_deliveryPickupId),
    CONSTRAINT fk_deliveryPickup_order
        FOREIGN KEY (v_orderId) REFERENCES tbl_order(v_orderId)
        ON UPDATE CASCADE ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.tbl_serviceRequest CASCADE;
CREATE TABLE public.tbl_serviceRequest (
    v_serviceRequestId bigserial NOT NULL,
    v_serviceRequestNumber varchar(60) NULL,
    v_customerId bigint NOT NULL,
    v_serviceId bigint NULL,
    v_requestDate timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_projectName varchar(150) NULL,
    v_projectType varchar(100) NULL,
    v_buildingStructureType varchar(100) NULL,
    v_projectLocation varchar(255) NULL,
    v_projectRequirements TEXT NULL,
    v_customerConcerns TEXT NULL,
    v_preferredSchedule timestamp with time zone NULL,
    v_requestStatus varchar(50) NULL,
    v_notes TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_serviceRequestId),
    CONSTRAINT uq_servicerequest_number UNIQUE (v_serviceRequestNumber),
    CONSTRAINT fk_serviceRequest_customer
        FOREIGN KEY (v_customerId) REFERENCES tbl_customer(v_customerId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_serviceRequest_service
        FOREIGN KEY (v_serviceId) REFERENCES tbl_service(v_serviceId)
        ON UPDATE CASCADE ON DELETE SET NULL
);

DROP TABLE IF EXISTS public.tbl_systemDesign CASCADE;
CREATE TABLE public.tbl_systemDesign (
    v_systemDesignId bigserial NOT NULL,
    v_serviceRequestId bigint NOT NULL,
    v_designTitle varchar(150) NULL,
    v_designDescription TEXT NULL,
    v_designFileReference varchar(255) NULL,
    v_designVersion varchar(50) NULL,
    v_preparedDate timestamp with time zone NULL,
    v_presentedDate timestamp with time zone NULL,
    v_approvalStatus varchar(50) NULL,
    v_approvalDate timestamp with time zone NULL,
    v_customerRemarks TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_systemDesignId),
    CONSTRAINT fk_systemDesign_serviceRequest
        FOREIGN KEY (v_serviceRequestId) REFERENCES tbl_serviceRequest(v_serviceRequestId)
        ON UPDATE CASCADE ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.tbl_material CASCADE;
CREATE TABLE public.tbl_material (
    v_materialId bigserial NOT NULL,
    v_materialCode varchar(60) NULL,
    v_materialName varchar(150) NOT NULL,
    v_materialCategory varchar(100) NULL,
    v_materialDescription TEXT NULL,
    v_unitOfMeasure varchar(50) NULL,
    v_currentPrice numeric(14,2) NULL,
    v_costPrice numeric(14,2) NULL,
    v_supplierReference varchar(150) NULL,
    v_isActive boolean NOT NULL DEFAULT TRUE,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_materialId),
    CONSTRAINT uq_material_materialcode UNIQUE (v_materialCode)
);

DROP TABLE IF EXISTS public.tbl_materialPriceHistory CASCADE;
CREATE TABLE public.tbl_materialPriceHistory (
    v_materialPriceHistoryId bigserial NOT NULL,
    v_materialId bigint NOT NULL,
    v_oldPrice numeric(14,2) NULL,
    v_newPrice numeric(14,2) NOT NULL,
    v_effectiveDate timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_changeReason varchar(255) NULL,
    v_changedByUserId bigint NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (v_materialPriceHistoryId),
    CONSTRAINT fk_materialPriceHistory_material
        FOREIGN KEY (v_materialId) REFERENCES tbl_material(v_materialId)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

DROP TABLE IF EXISTS public.tbl_quotation CASCADE;
CREATE TABLE public.tbl_quotation (
    v_quotationId bigserial NOT NULL,
    v_quotationNumber varchar(60) NULL,
    v_serviceRequestId bigint NOT NULL,
    v_systemDesignId bigint NULL,
    v_quotationDate timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_validUntil timestamp with time zone NULL,
    v_subtotalAmount numeric(14,2) NULL,
    v_discountAmount numeric(14,2) NOT NULL DEFAULT 0.00,
    v_taxAmount numeric(14,2) NOT NULL DEFAULT 0.00,
    v_totalAmount numeric(14,2) NULL,
    v_termsAndConditions TEXT NULL,
    v_quotationStatus varchar(50) NULL,
    v_approvedDate timestamp with time zone NULL,
    v_customerRemarks TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_quotationId),
    CONSTRAINT uq_quotation_number UNIQUE (v_quotationNumber),
    CONSTRAINT fk_quotation_serviceRequest
        FOREIGN KEY (v_serviceRequestId) REFERENCES tbl_serviceRequest(v_serviceRequestId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_quotation_systemDesign
        FOREIGN KEY (v_systemDesignId) REFERENCES tbl_systemDesign(v_systemDesignId)
        ON UPDATE CASCADE ON DELETE SET NULL
);

DROP TABLE IF EXISTS public.tbl_quotationItem CASCADE;
CREATE TABLE public.tbl_quotationItem (
    v_quotationItemId bigserial NOT NULL,
    v_quotationId bigint NOT NULL,
    v_itemType varchar(50) NULL,
    v_productId bigint NULL,
    v_materialId bigint NULL,
    v_serviceId bigint NULL,
    v_itemDescription varchar(255) NOT NULL,
    v_quantity numeric(14,2) NOT NULL DEFAULT 1.00,
    v_unitOfMeasure varchar(50) NULL,
    v_unitPrice numeric(14,2) NOT NULL DEFAULT 0.00,
    v_lineAmount numeric(14,2)
        GENERATED ALWAYS AS (v_quantity * v_unitPrice) STORED,
    v_notes TEXT NULL,
    PRIMARY KEY (v_quotationItemId),
    CONSTRAINT fk_quotationItem_quotation
        FOREIGN KEY (v_quotationId) REFERENCES tbl_quotation(v_quotationId)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_quotationItem_product
        FOREIGN KEY (v_productId) REFERENCES tbl_product(v_productId)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_quotationItem_material
        FOREIGN KEY (v_materialId) REFERENCES tbl_material(v_materialId)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_quotationItem_service
        FOREIGN KEY (v_serviceId) REFERENCES tbl_service(v_serviceId)
        ON UPDATE CASCADE ON DELETE SET NULL
);

DROP TABLE IF EXISTS public.tbl_project CASCADE;
CREATE TABLE public.tbl_project (
    v_projectId bigserial NOT NULL,
    v_projectNumber varchar(60) NULL,
    v_serviceRequestId bigint NOT NULL,
    v_quotationId bigint NULL,
    v_projectName varchar(150) NULL,
    v_projectDescription TEXT NULL,
    v_projectLocation varchar(255) NULL,
    v_startDate timestamp with time zone NULL,
    v_targetCompletionDate timestamp with time zone NULL,
    v_actualCompletionDate timestamp with time zone NULL,
    v_projectStatus varchar(50) NULL,
    v_progressPercentage numeric(5,2) NULL,
    v_contractAmount numeric(14,2) NULL,
    v_notes TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_projectId),
    CONSTRAINT uq_project_number UNIQUE (v_projectNumber),
    CONSTRAINT fk_project_serviceRequest
        FOREIGN KEY (v_serviceRequestId) REFERENCES tbl_serviceRequest(v_serviceRequestId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_project_quotation
        FOREIGN KEY (v_quotationId) REFERENCES tbl_quotation(v_quotationId)
        ON UPDATE CASCADE ON DELETE SET NULL
);

DROP TABLE IF EXISTS public.tbl_projectMaterial CASCADE;
CREATE TABLE public.tbl_projectMaterial (
    v_projectMaterialId bigserial NOT NULL,
    v_projectId bigint NOT NULL,
    v_materialId bigint NOT NULL,
    v_estimatedQuantity numeric(14,2) NULL,
    v_actualQuantity numeric(14,2) NULL,
    v_unitPrice numeric(14,2) NULL,
    v_totalEstimatedAmount numeric(14,2)
        GENERATED ALWAYS AS (COALESCE(v_estimatedQuantity,0) * COALESCE(v_unitPrice,0)) STORED,
    v_notes TEXT NULL,
    PRIMARY KEY (v_projectMaterialId),
    CONSTRAINT fk_projectMaterial_project
        FOREIGN KEY (v_projectId) REFERENCES tbl_project(v_projectId)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_projectMaterial_material
        FOREIGN KEY (v_materialId) REFERENCES tbl_material(v_materialId)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

DROP TABLE IF EXISTS public.tbl_payment CASCADE;
CREATE TABLE public.tbl_payment (
    v_paymentId bigserial NOT NULL,
    v_paymentReferenceNumber varchar(100) NULL,
    v_orderId bigint NULL,
    v_projectId bigint NULL,
    v_customerId bigint NOT NULL,
    v_paymentType varchar(50) NULL,
    v_paymentMethod varchar(50) NULL,
    v_paymentAmount numeric(14,2) NOT NULL,
    v_paymentDate timestamp with time zone NULL,
    v_paymentStatus varchar(50) NULL,
    v_bankName varchar(150) NULL,
    v_bankTransactionReference varchar(150) NULL,
    v_gatewayName varchar(100) NULL,
    v_gatewayTransactionId varchar(150) NULL,
    v_receiptReference varchar(150) NULL,
    v_verifiedDate timestamp with time zone NULL,
    v_verifiedByUserId bigint NULL,
    v_paymentNotes TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_paymentId),
    CONSTRAINT uq_payment_reference UNIQUE (v_paymentReferenceNumber),
    CONSTRAINT fk_payment_order
        FOREIGN KEY (v_orderId) REFERENCES tbl_order(v_orderId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_payment_project
        FOREIGN KEY (v_projectId) REFERENCES tbl_project(v_projectId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_payment_customer
        FOREIGN KEY (v_customerId) REFERENCES tbl_customer(v_customerId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_payment_parent CHECK (
        (v_orderId IS NOT NULL AND v_projectId IS NULL)
        OR
        (v_orderId IS NULL AND v_projectId IS NOT NULL)
    )
);

DROP TABLE IF EXISTS public.tbl_projectBilling CASCADE;
CREATE TABLE public.tbl_projectBilling (
    v_projectBillingId bigserial NOT NULL,
    v_projectId bigint NOT NULL,
    v_billingNumber varchar(60) NULL,
    v_billingType varchar(50) NULL,
    v_progressPercentage numeric(5,2) NULL,
    v_billingAmount numeric(14,2) NOT NULL,
    v_billingDate timestamp with time zone NULL,
    v_dueDate timestamp with time zone NULL,
    v_billingStatus varchar(50) NULL,
    v_notes TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_projectBillingId),
    CONSTRAINT uq_projectbilling_number UNIQUE (v_billingNumber),
    CONSTRAINT fk_projectBilling_project
        FOREIGN KEY (v_projectId) REFERENCES tbl_project(v_projectId)
        ON UPDATE CASCADE ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.tbl_inventory CASCADE;
CREATE TABLE public.tbl_inventory (
    v_inventoryId bigserial NOT NULL,
    v_productId bigint NULL,
    v_materialId bigint NULL,
    v_quantityOnHand numeric(14,2) NOT NULL DEFAULT 0.00,
    v_quantityReserved numeric(14,2) NOT NULL DEFAULT 0.00,
    v_quantityAvailable numeric(14,2)
        GENERATED ALWAYS AS (v_quantityOnHand - v_quantityReserved) STORED,
    v_reorderLevel numeric(14,2) NULL,
    v_storageLocation varchar(150) NULL,
    v_lastStockUpdate timestamp with time zone NULL,
    v_notes TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_inventoryId),
    CONSTRAINT fk_inventory_product
        FOREIGN KEY (v_productId) REFERENCES tbl_product(v_productId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_inventory_material
        FOREIGN KEY (v_materialId) REFERENCES tbl_material(v_materialId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_inventory_item CHECK (
        (v_productId IS NOT NULL AND v_materialId IS NULL)
        OR
        (v_productId IS NULL AND v_materialId IS NOT NULL)
    )
);

DROP TABLE IF EXISTS public.tbl_inventoryTransaction CASCADE;
CREATE TABLE public.tbl_inventoryTransaction (
    v_inventoryTransactionId bigserial NOT NULL,
    v_inventoryId bigint NOT NULL,
    v_transactionType varchar(50) NULL,
    v_quantity numeric(14,2) NOT NULL,
    v_referenceType varchar(50) NULL,
    v_referenceId bigint NULL,
    v_transactionDate timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_reason varchar(255) NULL,
    v_performedByUserId bigint NULL,
    v_notes TEXT NULL,
    PRIMARY KEY (v_inventoryTransactionId),
    CONSTRAINT fk_inventoryTransaction_inventory
        FOREIGN KEY (v_inventoryId) REFERENCES tbl_inventory(v_inventoryId)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

DROP TABLE IF EXISTS public.tbl_warranty CASCADE;
CREATE TABLE public.tbl_warranty (
    v_warrantyId bigserial NOT NULL,
    v_warrantyNumber varchar(60) NULL,
    v_customerId bigint NOT NULL,
    v_orderId bigint NULL,
    v_projectId bigint NULL,
    v_productId bigint NULL,
    v_warrantyType varchar(50) NULL,
    v_startDate timestamp with time zone NULL,
    v_endDate timestamp with time zone NULL,
    v_coverageDetails TEXT NULL,
    v_termsAndConditions TEXT NULL,
    v_warrantyStatus varchar(50) NULL,
    v_notes TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_warrantyId),
    CONSTRAINT uq_warranty_number UNIQUE (v_warrantyNumber),
    CONSTRAINT fk_warranty_customer
        FOREIGN KEY (v_customerId) REFERENCES tbl_customer(v_customerId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_warranty_order
        FOREIGN KEY (v_orderId) REFERENCES tbl_order(v_orderId)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_warranty_project
        FOREIGN KEY (v_projectId) REFERENCES tbl_project(v_projectId)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_warranty_product
        FOREIGN KEY (v_productId) REFERENCES tbl_product(v_productId)
        ON UPDATE CASCADE ON DELETE SET NULL
);

DROP TABLE IF EXISTS public.tbl_warrantyClaim CASCADE;
CREATE TABLE public.tbl_warrantyClaim (
    v_warrantyClaimId bigserial NOT NULL,
    v_warrantyId bigint NOT NULL,
    v_claimNumber varchar(60) NULL,
    v_claimDate timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_concernDescription TEXT NOT NULL,
    v_claimStatus varchar(50) NULL,
    v_resolutionDetails TEXT NULL,
    v_resolvedDate timestamp with time zone NULL,
    v_notes TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_warrantyClaimId),
    CONSTRAINT uq_warrantyclaim_number UNIQUE (v_claimNumber),
    CONSTRAINT fk_warrantyClaim_warranty
        FOREIGN KEY (v_warrantyId) REFERENCES tbl_warranty(v_warrantyId)
        ON UPDATE CASCADE ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.tbl_maintenance CASCADE;
CREATE TABLE public.tbl_maintenance (
    v_maintenanceId bigserial NOT NULL,
    v_maintenanceNumber varchar(60) NULL,
    v_customerId bigint NOT NULL,
    v_projectId bigint NULL,
    v_warrantyId bigint NULL,
    v_serviceId bigint NULL,
    v_maintenanceType varchar(100) NULL,
    v_equipmentSystemDescription TEXT NULL,
    v_location varchar(255) NULL,
    v_scheduledDate timestamp with time zone NULL,
    v_completedDate timestamp with time zone NULL,
    v_maintenanceStatus varchar(50) NULL,
    v_findings TEXT NULL,
    v_actionsPerformed TEXT NULL,
    v_recommendations TEXT NULL,
    v_nextMaintenanceDate timestamp with time zone NULL,
    v_notes TEXT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_maintenanceId),
    CONSTRAINT uq_maintenance_number UNIQUE (v_maintenanceNumber),
    CONSTRAINT fk_maintenance_customer
        FOREIGN KEY (v_customerId) REFERENCES tbl_customer(v_customerId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_maintenance_project
        FOREIGN KEY (v_projectId) REFERENCES tbl_project(v_projectId)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_maintenance_warranty
        FOREIGN KEY (v_warrantyId) REFERENCES tbl_warranty(v_warrantyId)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_maintenance_service
        FOREIGN KEY (v_serviceId) REFERENCES tbl_service(v_serviceId)
        ON UPDATE CASCADE ON DELETE SET NULL
);

DROP TABLE IF EXISTS public.tbl_role CASCADE;
CREATE TABLE public.tbl_role (
    v_roleId bigserial NOT NULL,
    v_roleName varchar(100) NOT NULL,
    v_roleDescription varchar(255) NULL,
    v_isActive boolean NOT NULL DEFAULT TRUE,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_roleId),
    CONSTRAINT uq_role_rolename UNIQUE (v_roleName)
);

DROP TABLE IF EXISTS public.tbl_user CASCADE;
CREATE TABLE public.tbl_user (
    v_userId bigserial NOT NULL,
    v_roleId bigint NULL,
    v_customerId bigint NULL,
    v_userName varchar(100) NOT NULL,
    v_passwordHash varchar(255) NULL,
    v_firstName varchar(100) NULL,
    v_lastName varchar(100) NULL,
    v_emailAddress varchar(150) NULL,
    v_mobileNumber varchar(30) NULL,
    v_accountStatus varchar(50) NULL,
    v_lastLoginAt timestamp with time zone NULL,
    v_isActive boolean NOT NULL DEFAULT TRUE,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
        ,
    PRIMARY KEY (v_userId),
    CONSTRAINT uq_user_username UNIQUE (v_userName),
    CONSTRAINT uq_user_emailaddress UNIQUE (v_emailAddress),
    CONSTRAINT fk_user_role
        FOREIGN KEY (v_roleId) REFERENCES tbl_role(v_roleId)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_user_customer
        FOREIGN KEY (v_customerId) REFERENCES tbl_customer(v_customerId)
        ON UPDATE CASCADE ON DELETE SET NULL
);

DROP TABLE IF EXISTS public.tbl_permission CASCADE;
CREATE TABLE public.tbl_permission (
    v_permissionId bigserial NOT NULL,
    v_permissionCode varchar(100) NOT NULL,
    v_permissionName varchar(150) NOT NULL,
    v_permissionDescription varchar(255) NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (v_permissionId),
    CONSTRAINT uq_permission_code UNIQUE (v_permissionCode)
);

DROP TABLE IF EXISTS public.tbl_rolePermission CASCADE;
CREATE TABLE public.tbl_rolePermission (
    v_rolePermissionId bigserial NOT NULL,
    v_roleId bigint NOT NULL,
    v_permissionId bigint NOT NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (v_rolePermissionId),
    CONSTRAINT uq_rolepermission_pair UNIQUE (v_roleId, v_permissionId),
    CONSTRAINT fk_rolePermission_role
        FOREIGN KEY (v_roleId) REFERENCES tbl_role(v_roleId)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_rolePermission_permission
        FOREIGN KEY (v_permissionId) REFERENCES tbl_permission(v_permissionId)
        ON UPDATE CASCADE ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.tbl_activityLog CASCADE;
CREATE TABLE public.tbl_activityLog (
    v_activityLogId bigserial NOT NULL,
    v_userId bigint NULL,
    v_actionType varchar(100) NOT NULL,
    v_tableName varchar(100) NULL,
    v_recordId bigint NULL,
    v_actionDescription TEXT NULL,
    v_ipAddress varchar(45) NULL,
    v_createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (v_activityLogId),
    CONSTRAINT fk_activityLog_user
        FOREIGN KEY (v_userId) REFERENCES tbl_user(v_userId)
        ON UPDATE CASCADE ON DELETE SET NULL
);

ALTER TABLE public.tbl_productPriceHistory
    ADD CONSTRAINT fk_productPriceHistory_user
        FOREIGN KEY (v_changedByUserId) REFERENCES tbl_user(v_userId)
        ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.tbl_materialPriceHistory
    ADD CONSTRAINT fk_materialPriceHistory_user
        FOREIGN KEY (v_changedByUserId) REFERENCES tbl_user(v_userId)
        ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.tbl_payment
    ADD CONSTRAINT fk_payment_verifiedByUser
        FOREIGN KEY (v_verifiedByUserId) REFERENCES tbl_user(v_userId)
        ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.tbl_inventoryTransaction
    ADD CONSTRAINT fk_inventoryTransaction_user
        FOREIGN KEY (v_performedByUserId) REFERENCES tbl_user(v_userId)
        ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_name ON public.tbl_customer (v_lastName, v_firstName);
CREATE INDEX IF NOT EXISTS idx_customer_companyname ON public.tbl_customer (v_companyName);
CREATE INDEX IF NOT EXISTS idx_customer_emailaddress ON public.tbl_customer (v_emailAddress);
CREATE INDEX IF NOT EXISTS idx_product_productname ON public.tbl_product (v_productName);
CREATE INDEX IF NOT EXISTS idx_product_productcategory ON public.tbl_product (v_productCategory);

COMMIT;
