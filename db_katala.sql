CREATE DATABASE IF NOT EXISTS db_katala
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE db_katala;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS tbl_customer;
CREATE TABLE tbl_customer (
    v_customerId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_customerType VARCHAR(50) NULL,
    v_firstName VARCHAR(100) NULL,
    v_middleName VARCHAR(100) NULL,
    v_lastName VARCHAR(100) NULL,
    v_companyName VARCHAR(150) NULL,
    v_contactPerson VARCHAR(150) NULL,
    v_emailAddress VARCHAR(150) NULL,
    v_mobileNumber VARCHAR(30) NULL,
    v_telephoneNumber VARCHAR(30) NULL,
    v_addressLine VARCHAR(255) NULL,
    v_barangay VARCHAR(100) NULL,
    v_cityMunicipality VARCHAR(100) NULL,
    v_province VARCHAR(100) NULL,
    v_postalCode VARCHAR(20) NULL,
    v_notes TEXT NULL,
    v_isActive BOOLEAN NOT NULL DEFAULT TRUE,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_customerId),
    INDEX idx_customer_name (v_lastName, v_firstName),
    INDEX idx_customer_companyName (v_companyName),
    INDEX idx_customer_emailAddress (v_emailAddress)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_product;
CREATE TABLE tbl_product (
    v_productId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_productCode VARCHAR(60) NULL,
    v_productName VARCHAR(150) NOT NULL,
    v_productCategory VARCHAR(100) NULL,
    v_brand VARCHAR(100) NULL,
    v_model VARCHAR(100) NULL,
    v_productDescription TEXT NULL,
    v_unitOfMeasure VARCHAR(50) NULL,
    v_currentPrice DECIMAL(14,2) NULL,
    v_costPrice DECIMAL(14,2) NULL,
    v_supplierReference VARCHAR(150) NULL,
    v_warrantyPeriod VARCHAR(100) NULL,
    v_isActive BOOLEAN NOT NULL DEFAULT TRUE,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_productId),
    UNIQUE KEY uq_product_productCode (v_productCode),
    INDEX idx_product_productName (v_productName),
    INDEX idx_product_productCategory (v_productCategory)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_productPriceHistory;
CREATE TABLE tbl_productPriceHistory (
    v_productPriceHistoryId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_productId BIGINT UNSIGNED NOT NULL,
    v_oldPrice DECIMAL(14,2) NULL,
    v_newPrice DECIMAL(14,2) NOT NULL,
    v_effectiveDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_changeReason VARCHAR(255) NULL,
    v_changedByUserId BIGINT UNSIGNED NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (v_productPriceHistoryId),
    CONSTRAINT fk_productPriceHistory_product
        FOREIGN KEY (v_productId) REFERENCES tbl_product(v_productId)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_service;
CREATE TABLE tbl_service (
    v_serviceId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_serviceCode VARCHAR(60) NULL,
    v_serviceName VARCHAR(150) NOT NULL,
    v_serviceCategory VARCHAR(100) NULL,
    v_serviceDescription TEXT NULL,
    v_basePrice DECIMAL(14,2) NULL,
    v_isActive BOOLEAN NOT NULL DEFAULT TRUE,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_serviceId),
    UNIQUE KEY uq_service_serviceCode (v_serviceCode)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_order;
CREATE TABLE tbl_order (
    v_orderId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_orderNumber VARCHAR(60) NULL,
    v_customerId BIGINT UNSIGNED NOT NULL,
    v_orderDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_orderStatus VARCHAR(50) NULL,
    v_subtotalAmount DECIMAL(14,2) NULL,
    v_discountAmount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    v_deliveryFee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    v_taxAmount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    v_totalAmount DECIMAL(14,2) NULL,
    v_orderNotes TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_orderId),
    UNIQUE KEY uq_order_orderNumber (v_orderNumber),
    CONSTRAINT fk_order_customer
        FOREIGN KEY (v_customerId) REFERENCES tbl_customer(v_customerId)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_orderItem;
CREATE TABLE tbl_orderItem (
    v_orderItemId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_orderId BIGINT UNSIGNED NOT NULL,
    v_productId BIGINT UNSIGNED NOT NULL,
    v_productNameSnapshot VARCHAR(150) NULL,
    v_quantity DECIMAL(14,2) NOT NULL,
    v_unitPrice DECIMAL(14,2) NOT NULL,
    v_discountAmount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    v_lineAmount DECIMAL(14,2)
        GENERATED ALWAYS AS ((v_quantity * v_unitPrice) - v_discountAmount) STORED,
    v_notes TEXT NULL,
    PRIMARY KEY (v_orderItemId),
    CONSTRAINT fk_orderItem_order
        FOREIGN KEY (v_orderId) REFERENCES tbl_order(v_orderId)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_orderItem_product
        FOREIGN KEY (v_productId) REFERENCES tbl_product(v_productId)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_deliveryPickup;
CREATE TABLE tbl_deliveryPickup (
    v_deliveryPickupId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_orderId BIGINT UNSIGNED NOT NULL,
    v_fulfillmentType ENUM('delivery','pickup') NOT NULL,
    v_recipientName VARCHAR(150) NULL,
    v_recipientContactNumber VARCHAR(30) NULL,
    v_deliveryAddress VARCHAR(255) NULL,
    v_barangay VARCHAR(100) NULL,
    v_cityMunicipality VARCHAR(100) NULL,
    v_province VARCHAR(100) NULL,
    v_postalCode VARCHAR(20) NULL,
    v_pickupLocation VARCHAR(255) NULL,
    v_scheduledDate DATETIME NULL,
    v_completedDate DATETIME NULL,
    v_fulfillmentStatus VARCHAR(50) NULL,
    v_trackingReference VARCHAR(100) NULL,
    v_deliveryPickupNotes TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_deliveryPickupId),
    CONSTRAINT fk_deliveryPickup_order
        FOREIGN KEY (v_orderId) REFERENCES tbl_order(v_orderId)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_serviceRequest;
CREATE TABLE tbl_serviceRequest (
    v_serviceRequestId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_serviceRequestNumber VARCHAR(60) NULL,
    v_customerId BIGINT UNSIGNED NOT NULL,
    v_serviceId BIGINT UNSIGNED NULL,
    v_requestDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_projectName VARCHAR(150) NULL,
    v_projectType VARCHAR(100) NULL,
    v_buildingStructureType VARCHAR(100) NULL,
    v_projectLocation VARCHAR(255) NULL,
    v_projectRequirements TEXT NULL,
    v_customerConcerns TEXT NULL,
    v_preferredSchedule DATETIME NULL,
    v_requestStatus VARCHAR(50) NULL,
    v_notes TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_serviceRequestId),
    UNIQUE KEY uq_serviceRequest_number (v_serviceRequestNumber),
    CONSTRAINT fk_serviceRequest_customer
        FOREIGN KEY (v_customerId) REFERENCES tbl_customer(v_customerId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_serviceRequest_service
        FOREIGN KEY (v_serviceId) REFERENCES tbl_service(v_serviceId)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_systemDesign;
CREATE TABLE tbl_systemDesign (
    v_systemDesignId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_serviceRequestId BIGINT UNSIGNED NOT NULL,
    v_designTitle VARCHAR(150) NULL,
    v_designDescription TEXT NULL,
    v_designFileReference VARCHAR(255) NULL,
    v_designVersion VARCHAR(50) NULL,
    v_preparedDate DATETIME NULL,
    v_presentedDate DATETIME NULL,
    v_approvalStatus VARCHAR(50) NULL,
    v_approvalDate DATETIME NULL,
    v_customerRemarks TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_systemDesignId),
    CONSTRAINT fk_systemDesign_serviceRequest
        FOREIGN KEY (v_serviceRequestId) REFERENCES tbl_serviceRequest(v_serviceRequestId)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_material;
CREATE TABLE tbl_material (
    v_materialId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_materialCode VARCHAR(60) NULL,
    v_materialName VARCHAR(150) NOT NULL,
    v_materialCategory VARCHAR(100) NULL,
    v_materialDescription TEXT NULL,
    v_unitOfMeasure VARCHAR(50) NULL,
    v_currentPrice DECIMAL(14,2) NULL,
    v_costPrice DECIMAL(14,2) NULL,
    v_supplierReference VARCHAR(150) NULL,
    v_isActive BOOLEAN NOT NULL DEFAULT TRUE,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_materialId),
    UNIQUE KEY uq_material_materialCode (v_materialCode)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_materialPriceHistory;
CREATE TABLE tbl_materialPriceHistory (
    v_materialPriceHistoryId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_materialId BIGINT UNSIGNED NOT NULL,
    v_oldPrice DECIMAL(14,2) NULL,
    v_newPrice DECIMAL(14,2) NOT NULL,
    v_effectiveDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_changeReason VARCHAR(255) NULL,
    v_changedByUserId BIGINT UNSIGNED NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (v_materialPriceHistoryId),
    CONSTRAINT fk_materialPriceHistory_material
        FOREIGN KEY (v_materialId) REFERENCES tbl_material(v_materialId)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_quotation;
CREATE TABLE tbl_quotation (
    v_quotationId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_quotationNumber VARCHAR(60) NULL,
    v_serviceRequestId BIGINT UNSIGNED NOT NULL,
    v_systemDesignId BIGINT UNSIGNED NULL,
    v_quotationDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_validUntil DATETIME NULL,
    v_subtotalAmount DECIMAL(14,2) NULL,
    v_discountAmount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    v_taxAmount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    v_totalAmount DECIMAL(14,2) NULL,
    v_termsAndConditions TEXT NULL,
    v_quotationStatus VARCHAR(50) NULL,
    v_approvedDate DATETIME NULL,
    v_customerRemarks TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_quotationId),
    UNIQUE KEY uq_quotation_number (v_quotationNumber),
    CONSTRAINT fk_quotation_serviceRequest
        FOREIGN KEY (v_serviceRequestId) REFERENCES tbl_serviceRequest(v_serviceRequestId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_quotation_systemDesign
        FOREIGN KEY (v_systemDesignId) REFERENCES tbl_systemDesign(v_systemDesignId)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_quotationItem;
CREATE TABLE tbl_quotationItem (
    v_quotationItemId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_quotationId BIGINT UNSIGNED NOT NULL,
    v_itemType VARCHAR(50) NULL,
    v_productId BIGINT UNSIGNED NULL,
    v_materialId BIGINT UNSIGNED NULL,
    v_serviceId BIGINT UNSIGNED NULL,
    v_itemDescription VARCHAR(255) NOT NULL,
    v_quantity DECIMAL(14,2) NOT NULL DEFAULT 1.00,
    v_unitOfMeasure VARCHAR(50) NULL,
    v_unitPrice DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    v_lineAmount DECIMAL(14,2)
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
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_project;
CREATE TABLE tbl_project (
    v_projectId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_projectNumber VARCHAR(60) NULL,
    v_serviceRequestId BIGINT UNSIGNED NOT NULL,
    v_quotationId BIGINT UNSIGNED NULL,
    v_projectName VARCHAR(150) NULL,
    v_projectDescription TEXT NULL,
    v_projectLocation VARCHAR(255) NULL,
    v_startDate DATETIME NULL,
    v_targetCompletionDate DATETIME NULL,
    v_actualCompletionDate DATETIME NULL,
    v_projectStatus VARCHAR(50) NULL,
    v_progressPercentage DECIMAL(5,2) NULL,
    v_contractAmount DECIMAL(14,2) NULL,
    v_notes TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_projectId),
    UNIQUE KEY uq_project_number (v_projectNumber),
    CONSTRAINT fk_project_serviceRequest
        FOREIGN KEY (v_serviceRequestId) REFERENCES tbl_serviceRequest(v_serviceRequestId)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_project_quotation
        FOREIGN KEY (v_quotationId) REFERENCES tbl_quotation(v_quotationId)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_projectMaterial;
CREATE TABLE tbl_projectMaterial (
    v_projectMaterialId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_projectId BIGINT UNSIGNED NOT NULL,
    v_materialId BIGINT UNSIGNED NOT NULL,
    v_estimatedQuantity DECIMAL(14,2) NULL,
    v_actualQuantity DECIMAL(14,2) NULL,
    v_unitPrice DECIMAL(14,2) NULL,
    v_totalEstimatedAmount DECIMAL(14,2)
        GENERATED ALWAYS AS (COALESCE(v_estimatedQuantity,0) * COALESCE(v_unitPrice,0)) STORED,
    v_notes TEXT NULL,
    PRIMARY KEY (v_projectMaterialId),
    CONSTRAINT fk_projectMaterial_project
        FOREIGN KEY (v_projectId) REFERENCES tbl_project(v_projectId)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_projectMaterial_material
        FOREIGN KEY (v_materialId) REFERENCES tbl_material(v_materialId)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_payment;
CREATE TABLE tbl_payment (
    v_paymentId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_paymentReferenceNumber VARCHAR(100) NULL,
    v_orderId BIGINT UNSIGNED NULL,
    v_projectId BIGINT UNSIGNED NULL,
    v_customerId BIGINT UNSIGNED NOT NULL,
    v_paymentType VARCHAR(50) NULL,
    v_paymentMethod VARCHAR(50) NULL,
    v_paymentAmount DECIMAL(14,2) NOT NULL,
    v_paymentDate DATETIME NULL,
    v_paymentStatus VARCHAR(50) NULL,
    v_bankName VARCHAR(150) NULL,
    v_bankTransactionReference VARCHAR(150) NULL,
    v_gatewayName VARCHAR(100) NULL,
    v_gatewayTransactionId VARCHAR(150) NULL,
    v_receiptReference VARCHAR(150) NULL,
    v_verifiedDate DATETIME NULL,
    v_verifiedByUserId BIGINT UNSIGNED NULL,
    v_paymentNotes TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_paymentId),
    UNIQUE KEY uq_payment_reference (v_paymentReferenceNumber),
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
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_projectBilling;
CREATE TABLE tbl_projectBilling (
    v_projectBillingId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_projectId BIGINT UNSIGNED NOT NULL,
    v_billingNumber VARCHAR(60) NULL,
    v_billingType VARCHAR(50) NULL,
    v_progressPercentage DECIMAL(5,2) NULL,
    v_billingAmount DECIMAL(14,2) NOT NULL,
    v_billingDate DATETIME NULL,
    v_dueDate DATETIME NULL,
    v_billingStatus VARCHAR(50) NULL,
    v_notes TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_projectBillingId),
    UNIQUE KEY uq_projectBilling_number (v_billingNumber),
    CONSTRAINT fk_projectBilling_project
        FOREIGN KEY (v_projectId) REFERENCES tbl_project(v_projectId)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_inventory;
CREATE TABLE tbl_inventory (
    v_inventoryId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_productId BIGINT UNSIGNED NULL,
    v_materialId BIGINT UNSIGNED NULL,
    v_quantityOnHand DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    v_quantityReserved DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    v_quantityAvailable DECIMAL(14,2)
        GENERATED ALWAYS AS (v_quantityOnHand - v_quantityReserved) STORED,
    v_reorderLevel DECIMAL(14,2) NULL,
    v_storageLocation VARCHAR(150) NULL,
    v_lastStockUpdate DATETIME NULL,
    v_notes TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
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
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_inventoryTransaction;
CREATE TABLE tbl_inventoryTransaction (
    v_inventoryTransactionId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_inventoryId BIGINT UNSIGNED NOT NULL,
    v_transactionType VARCHAR(50) NULL,
    v_quantity DECIMAL(14,2) NOT NULL,
    v_referenceType VARCHAR(50) NULL,
    v_referenceId BIGINT UNSIGNED NULL,
    v_transactionDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_reason VARCHAR(255) NULL,
    v_performedByUserId BIGINT UNSIGNED NULL,
    v_notes TEXT NULL,
    PRIMARY KEY (v_inventoryTransactionId),
    CONSTRAINT fk_inventoryTransaction_inventory
        FOREIGN KEY (v_inventoryId) REFERENCES tbl_inventory(v_inventoryId)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_warranty;
CREATE TABLE tbl_warranty (
    v_warrantyId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_warrantyNumber VARCHAR(60) NULL,
    v_customerId BIGINT UNSIGNED NOT NULL,
    v_orderId BIGINT UNSIGNED NULL,
    v_projectId BIGINT UNSIGNED NULL,
    v_productId BIGINT UNSIGNED NULL,
    v_warrantyType VARCHAR(50) NULL,
    v_startDate DATETIME NULL,
    v_endDate DATETIME NULL,
    v_coverageDetails TEXT NULL,
    v_termsAndConditions TEXT NULL,
    v_warrantyStatus VARCHAR(50) NULL,
    v_notes TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_warrantyId),
    UNIQUE KEY uq_warranty_number (v_warrantyNumber),
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
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_warrantyClaim;
CREATE TABLE tbl_warrantyClaim (
    v_warrantyClaimId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_warrantyId BIGINT UNSIGNED NOT NULL,
    v_claimNumber VARCHAR(60) NULL,
    v_claimDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_concernDescription TEXT NOT NULL,
    v_claimStatus VARCHAR(50) NULL,
    v_resolutionDetails TEXT NULL,
    v_resolvedDate DATETIME NULL,
    v_notes TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_warrantyClaimId),
    UNIQUE KEY uq_warrantyClaim_number (v_claimNumber),
    CONSTRAINT fk_warrantyClaim_warranty
        FOREIGN KEY (v_warrantyId) REFERENCES tbl_warranty(v_warrantyId)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_maintenance;
CREATE TABLE tbl_maintenance (
    v_maintenanceId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_maintenanceNumber VARCHAR(60) NULL,
    v_customerId BIGINT UNSIGNED NOT NULL,
    v_projectId BIGINT UNSIGNED NULL,
    v_warrantyId BIGINT UNSIGNED NULL,
    v_serviceId BIGINT UNSIGNED NULL,
    v_maintenanceType VARCHAR(100) NULL,
    v_equipmentSystemDescription TEXT NULL,
    v_location VARCHAR(255) NULL,
    v_scheduledDate DATETIME NULL,
    v_completedDate DATETIME NULL,
    v_maintenanceStatus VARCHAR(50) NULL,
    v_findings TEXT NULL,
    v_actionsPerformed TEXT NULL,
    v_recommendations TEXT NULL,
    v_nextMaintenanceDate DATETIME NULL,
    v_notes TEXT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_maintenanceId),
    UNIQUE KEY uq_maintenance_number (v_maintenanceNumber),
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
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_role;
CREATE TABLE tbl_role (
    v_roleId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_roleName VARCHAR(100) NOT NULL,
    v_roleDescription VARCHAR(255) NULL,
    v_isActive BOOLEAN NOT NULL DEFAULT TRUE,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_roleId),
    UNIQUE KEY uq_role_roleName (v_roleName)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_user;
CREATE TABLE tbl_user (
    v_userId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_roleId BIGINT UNSIGNED NULL,
    v_customerId BIGINT UNSIGNED NULL,
    v_userName VARCHAR(100) NOT NULL,
    v_passwordHash VARCHAR(255) NULL,
    v_firstName VARCHAR(100) NULL,
    v_lastName VARCHAR(100) NULL,
    v_emailAddress VARCHAR(150) NULL,
    v_mobileNumber VARCHAR(30) NULL,
    v_accountStatus VARCHAR(50) NULL,
    v_lastLoginAt DATETIME NULL,
    v_isActive BOOLEAN NOT NULL DEFAULT TRUE,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    v_updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (v_userId),
    UNIQUE KEY uq_user_userName (v_userName),
    UNIQUE KEY uq_user_emailAddress (v_emailAddress),
    CONSTRAINT fk_user_role
        FOREIGN KEY (v_roleId) REFERENCES tbl_role(v_roleId)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_user_customer
        FOREIGN KEY (v_customerId) REFERENCES tbl_customer(v_customerId)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_permission;
CREATE TABLE tbl_permission (
    v_permissionId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_permissionCode VARCHAR(100) NOT NULL,
    v_permissionName VARCHAR(150) NOT NULL,
    v_permissionDescription VARCHAR(255) NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (v_permissionId),
    UNIQUE KEY uq_permission_code (v_permissionCode)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_rolePermission;
CREATE TABLE tbl_rolePermission (
    v_rolePermissionId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_roleId BIGINT UNSIGNED NOT NULL,
    v_permissionId BIGINT UNSIGNED NOT NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (v_rolePermissionId),
    UNIQUE KEY uq_rolePermission_pair (v_roleId, v_permissionId),
    CONSTRAINT fk_rolePermission_role
        FOREIGN KEY (v_roleId) REFERENCES tbl_role(v_roleId)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_rolePermission_permission
        FOREIGN KEY (v_permissionId) REFERENCES tbl_permission(v_permissionId)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

DROP TABLE IF EXISTS tbl_activityLog;
CREATE TABLE tbl_activityLog (
    v_activityLogId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    v_userId BIGINT UNSIGNED NULL,
    v_actionType VARCHAR(100) NOT NULL,
    v_tableName VARCHAR(100) NULL,
    v_recordId BIGINT UNSIGNED NULL,
    v_actionDescription TEXT NULL,
    v_ipAddress VARCHAR(45) NULL,
    v_createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (v_activityLogId),
    CONSTRAINT fk_activityLog_user
        FOREIGN KEY (v_userId) REFERENCES tbl_user(v_userId)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE tbl_productPriceHistory
    ADD CONSTRAINT fk_productPriceHistory_user
        FOREIGN KEY (v_changedByUserId) REFERENCES tbl_user(v_userId)
        ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE tbl_materialPriceHistory
    ADD CONSTRAINT fk_materialPriceHistory_user
        FOREIGN KEY (v_changedByUserId) REFERENCES tbl_user(v_userId)
        ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE tbl_payment
    ADD CONSTRAINT fk_payment_verifiedByUser
        FOREIGN KEY (v_verifiedByUserId) REFERENCES tbl_user(v_userId)
        ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE tbl_inventoryTransaction
    ADD CONSTRAINT fk_inventoryTransaction_user
        FOREIGN KEY (v_performedByUserId) REFERENCES tbl_user(v_userId)
        ON UPDATE CASCADE ON DELETE SET NULL;

SET FOREIGN_KEY_CHECKS = 1;