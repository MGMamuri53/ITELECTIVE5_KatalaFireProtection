-- Katala XAMPP/MySQL app schema.
-- Import this in phpMyAdmin when using the current React/Node app locally.
-- Destructive: this resets db_katala so old foreign keys from the original export do not block the app schema.

DROP DATABASE IF EXISTS db_katala;
CREATE DATABASE IF NOT EXISTS db_katala
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE db_katala;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS local_auth_accounts;
DROP TABLE IF EXISTS tbl_notification;
DROP TABLE IF EXISTS tbl_attachment;
DROP TABLE IF EXISTS tbl_serviceassignment;
DROP TABLE IF EXISTS tbl_appointment;
DROP TABLE IF EXISTS tbl_servicerequeststatushistory;
DROP TABLE IF EXISTS tbl_servicerequest;
DROP TABLE IF EXISTS tbl_paymenttransaction;
DROP TABLE IF EXISTS tbl_quotationstatushistory;
DROP TABLE IF EXISTS tbl_quotationserviceitem;
DROP TABLE IF EXISTS tbl_quotationproductitem;
DROP TABLE IF EXISTS tbl_quotation;
DROP TABLE IF EXISTS tbl_project;
DROP TABLE IF EXISTS tbl_service;
DROP TABLE IF EXISTS tbl_servicecategory;
DROP TABLE IF EXISTS tbl_productvariant;
DROP TABLE IF EXISTS tbl_product;
DROP TABLE IF EXISTS tbl_productcategory;
DROP TABLE IF EXISTS tbl_useraddress;
DROP TABLE IF EXISTS tbl_userrole;
DROP TABLE IF EXISTS tbl_user;
DROP TABLE IF EXISTS tbl_role;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE tbl_role (
  v_roleid varchar(36) PRIMARY KEY,
  v_rolename varchar(50) NOT NULL UNIQUE,
  v_roledescription text,
  v_isactive boolean NOT NULL DEFAULT true,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tbl_user (
  v_userid varchar(36) PRIMARY KEY,
  v_firstname varchar(100) NOT NULL,
  v_middlename varchar(100),
  v_lastname varchar(100) NOT NULL,
  v_emailaddress varchar(255) NOT NULL UNIQUE,
  v_contactnumber varchar(20),
  v_profileimageurl longtext,
  v_accountstatus varchar(30) NOT NULL DEFAULT 'Active',
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  v_companyname varchar(255),
  v_jobtitle varchar(120),
  v_industry varchar(120),
  v_companyaddress text,
  v_assignedstaffname varchar(160),
  v_staffdesignation varchar(160),
  v_department varchar(160)
) ENGINE=InnoDB;

CREATE TABLE local_auth_accounts (
  v_userid varchar(36) PRIMARY KEY,
  v_emailaddress varchar(255) NOT NULL UNIQUE,
  v_passwordhash varchar(255) NOT NULL,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_local_auth_user FOREIGN KEY (v_userid) REFERENCES tbl_user(v_userid) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tbl_userrole (
  v_userroleid varchar(36) PRIMARY KEY,
  v_userid varchar(36) NOT NULL,
  v_roleid varchar(36) NOT NULL,
  v_assignedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_userrole (v_userid, v_roleid),
  CONSTRAINT fk_userrole_user FOREIGN KEY (v_userid) REFERENCES tbl_user(v_userid) ON DELETE CASCADE,
  CONSTRAINT fk_userrole_role FOREIGN KEY (v_roleid) REFERENCES tbl_role(v_roleid)
) ENGINE=InnoDB;

CREATE TABLE tbl_useraddress (
  v_useraddressid varchar(36) PRIMARY KEY,
  v_userid varchar(36) NOT NULL,
  v_addresslabel varchar(50),
  v_establishmentname varchar(255),
  v_housebuildingnumber varchar(100),
  v_streetname varchar(255),
  v_barangay varchar(150),
  v_citymunicipality varchar(150) NOT NULL,
  v_province varchar(150) NOT NULL,
  v_postalcode varchar(10),
  v_landmark text,
  v_isdefault boolean NOT NULL DEFAULT false,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_useraddress_user FOREIGN KEY (v_userid) REFERENCES tbl_user(v_userid) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tbl_productcategory (
  v_productcategoryid varchar(36) PRIMARY KEY,
  v_categoryname varchar(150) NOT NULL UNIQUE,
  v_categorydescription text,
  v_categoryimageurl longtext,
  v_isactive boolean NOT NULL DEFAULT true,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tbl_product (
  v_productid varchar(36) PRIMARY KEY,
  v_productcategoryid varchar(36),
  v_productcategory varchar(150),
  v_productname varchar(255) NOT NULL,
  v_productdescription text,
  v_productimageurl longtext,
  v_isactive boolean NOT NULL DEFAULT true,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_category FOREIGN KEY (v_productcategoryid) REFERENCES tbl_productcategory(v_productcategoryid) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE tbl_productvariant (
  v_productvariantid varchar(36) PRIMARY KEY,
  v_productid varchar(36) NOT NULL,
  v_productcode varchar(50) NOT NULL UNIQUE,
  v_productmodel varchar(100),
  v_productsize varchar(100),
  v_productunit varchar(50),
  v_variantdescription text,
  v_variantimageurl longtext,
  v_minprice decimal(12,2),
  v_maxprice decimal(12,2),
  v_availabilitystatus varchar(30) NOT NULL DEFAULT 'Available',
  v_isactive boolean NOT NULL DEFAULT true,
  v_stockquantity int DEFAULT 0,
  v_reorderlevel int DEFAULT 0,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_variant_product FOREIGN KEY (v_productid) REFERENCES tbl_product(v_productid) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tbl_servicecategory (
  v_servicecategoryid varchar(36) PRIMARY KEY,
  v_categoryname varchar(150) NOT NULL UNIQUE,
  v_categorydescription text,
  v_categoryimageurl longtext,
  v_isactive boolean NOT NULL DEFAULT true,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tbl_service (
  v_serviceid varchar(36) PRIMARY KEY,
  v_servicecategoryid varchar(36),
  v_servicecategory varchar(150),
  v_servicecode varchar(50) NOT NULL UNIQUE,
  v_servicename varchar(255) NOT NULL,
  v_servicedescription text,
  v_servicerequirements text,
  v_estimatedduration varchar(100),
  v_serviceimageurl longtext,
  v_minprice decimal(12,2),
  v_maxprice decimal(12,2),
  v_isinspectionrequired boolean NOT NULL DEFAULT false,
  v_isactive boolean NOT NULL DEFAULT true,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_service_category FOREIGN KEY (v_servicecategoryid) REFERENCES tbl_servicecategory(v_servicecategoryid) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE tbl_project (
  v_projectid varchar(36) PRIMARY KEY,
  v_projecttitle varchar(255) NOT NULL,
  v_clientname varchar(255),
  v_projectlocation varchar(255),
  v_projecttype varchar(100),
  v_projectoverview text,
  v_servicesperformed text,
  v_completiondate date,
  v_coverimageurl longtext,
  v_isfeatured boolean NOT NULL DEFAULT false,
  v_ispublished boolean NOT NULL DEFAULT false,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tbl_quotation (
  v_quotationid varchar(36) PRIMARY KEY,
  v_userid varchar(36) NOT NULL,
  v_referencenumber varchar(50) NOT NULL UNIQUE,
  v_projectname varchar(255),
  v_establishmentname varchar(255),
  v_projectdescription text,
  v_projectaddress text,
  v_customerremarks text,
  v_adminremarks text,
  v_additionalcost decimal(12,2) NOT NULL DEFAULT 0,
  v_quotationstatus varchar(50) NOT NULL DEFAULT 'Submitted',
  v_validuntil date,
  v_submittedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_reviewedat datetime,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  v_quotationdate date,
  v_scheduleddate date,
  v_scheduledtime time,
  v_assignedstaff text,
  v_completedat datetime,
  CONSTRAINT fk_quotation_user FOREIGN KEY (v_userid) REFERENCES tbl_user(v_userid)
) ENGINE=InnoDB;

CREATE TABLE tbl_quotationproductitem (
  v_quotationproductitemid varchar(36) PRIMARY KEY,
  v_quotationid varchar(36) NOT NULL,
  v_productvariantid varchar(36) NOT NULL,
  v_quantity int NOT NULL,
  v_unitprice decimal(12,2),
  v_itemdescription text,
  v_adminremarks text,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_qpi_quote FOREIGN KEY (v_quotationid) REFERENCES tbl_quotation(v_quotationid) ON DELETE CASCADE,
  CONSTRAINT fk_qpi_variant FOREIGN KEY (v_productvariantid) REFERENCES tbl_productvariant(v_productvariantid)
) ENGINE=InnoDB;

CREATE TABLE tbl_quotationserviceitem (
  v_quotationserviceitemid varchar(36) PRIMARY KEY,
  v_quotationid varchar(36) NOT NULL,
  v_serviceid varchar(36) NOT NULL,
  v_quantity int NOT NULL DEFAULT 1,
  v_unitprice decimal(12,2),
  v_itemdescription text,
  v_adminremarks text,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_qsi_quote FOREIGN KEY (v_quotationid) REFERENCES tbl_quotation(v_quotationid) ON DELETE CASCADE,
  CONSTRAINT fk_qsi_service FOREIGN KEY (v_serviceid) REFERENCES tbl_service(v_serviceid)
) ENGINE=InnoDB;

CREATE TABLE tbl_quotationstatushistory (
  v_quotationstatushistoryid varchar(36) PRIMARY KEY,
  v_quotationid varchar(36) NOT NULL,
  v_updatedbyuserid varchar(36) NOT NULL,
  v_status varchar(50) NOT NULL,
  v_statusremarks text,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_qsh_quote FOREIGN KEY (v_quotationid) REFERENCES tbl_quotation(v_quotationid) ON DELETE CASCADE,
  CONSTRAINT fk_qsh_user FOREIGN KEY (v_updatedbyuserid) REFERENCES tbl_user(v_userid)
) ENGINE=InnoDB;

CREATE TABLE tbl_paymenttransaction (
  v_paymenttransactionid varchar(36) PRIMARY KEY,
  v_quotationid varchar(36),
  v_servicerequestid varchar(36),
  v_userid varchar(36) NOT NULL,
  v_referencenumber varchar(80) NOT NULL UNIQUE,
  v_paymongo_checkoutsessionid varchar(120) UNIQUE,
  v_paymongo_paymentintentid varchar(120),
  v_paymongo_paymentid varchar(120) UNIQUE,
  v_status varchar(30) NOT NULL DEFAULT 'Pending',
  v_amount decimal(12,2) NOT NULL,
  v_currency varchar(3) NOT NULL DEFAULT 'PHP',
  v_paymentmethod varchar(40),
  v_checkouturl text,
  v_receiptnumber varchar(80) UNIQUE,
  v_billingname varchar(180),
  v_billingemail varchar(180),
  v_billingphone varchar(80),
  v_rawpayload json,
  v_paidat datetime,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_quote FOREIGN KEY (v_quotationid) REFERENCES tbl_quotation(v_quotationid),
  CONSTRAINT fk_payment_user FOREIGN KEY (v_userid) REFERENCES tbl_user(v_userid)
) ENGINE=InnoDB;

CREATE TABLE tbl_servicerequest (
  v_servicerequestid varchar(36) PRIMARY KEY,
  v_userid varchar(36) NOT NULL,
  v_serviceid varchar(36) NOT NULL,
  v_useraddressid varchar(36),
  v_referencenumber varchar(50) NOT NULL UNIQUE,
  v_projectname varchar(255),
  v_establishmentname varchar(255),
  v_contactperson varchar(255),
  v_contactnumber varchar(20),
  v_problemdescription text NOT NULL,
  v_projectaddress text,
  v_preferreddate date,
  v_preferredtime time,
  v_prioritylevel varchar(20) NOT NULL DEFAULT 'Normal',
  v_requeststatus varchar(50) NOT NULL DEFAULT 'Submitted',
  v_customerremarks text,
  v_adminremarks text,
  v_quotedamount decimal(12,2),
  v_paymentstatus varchar(30),
  v_receiptnumber varchar(80),
  v_paidat datetime,
  v_pricehistory json,
  v_submittedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_completedat datetime,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sr_user FOREIGN KEY (v_userid) REFERENCES tbl_user(v_userid),
  CONSTRAINT fk_sr_service FOREIGN KEY (v_serviceid) REFERENCES tbl_service(v_serviceid),
  CONSTRAINT fk_sr_address FOREIGN KEY (v_useraddressid) REFERENCES tbl_useraddress(v_useraddressid) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE tbl_paymenttransaction
  ADD CONSTRAINT fk_payment_service_request
  FOREIGN KEY (v_servicerequestid) REFERENCES tbl_servicerequest(v_servicerequestid);

CREATE TABLE tbl_servicerequeststatushistory (
  v_servicerequeststatushistoryid varchar(36) PRIMARY KEY,
  v_servicerequestid varchar(36) NOT NULL,
  v_updatedbyuserid varchar(36) NOT NULL,
  v_status varchar(50) NOT NULL,
  v_statusremarks text,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_srsh_sr FOREIGN KEY (v_servicerequestid) REFERENCES tbl_servicerequest(v_servicerequestid) ON DELETE CASCADE,
  CONSTRAINT fk_srsh_user FOREIGN KEY (v_updatedbyuserid) REFERENCES tbl_user(v_userid)
) ENGINE=InnoDB;

CREATE TABLE tbl_appointment (
  v_appointmentid varchar(36) PRIMARY KEY,
  v_servicerequestid varchar(36) NOT NULL,
  v_appointmenttype varchar(50) NOT NULL,
  v_scheduleddate date NOT NULL,
  v_starttime time NOT NULL,
  v_endtime time,
  v_appointmentstatus varchar(30) NOT NULL DEFAULT 'Pending',
  v_locationdetails text,
  v_adminremarks text,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_updatedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_appt_sr FOREIGN KEY (v_servicerequestid) REFERENCES tbl_servicerequest(v_servicerequestid) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tbl_serviceassignment (
  v_serviceassignmentid varchar(36) PRIMARY KEY,
  v_servicerequestid varchar(36) NOT NULL,
  v_technicianuserid varchar(36) NOT NULL,
  v_assignmentrole varchar(100),
  v_assignmentstatus varchar(30) NOT NULL DEFAULT 'Assigned',
  v_assignmentremarks text,
  v_assignedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  v_completedat datetime,
  UNIQUE KEY uq_servicerequesttechnician (v_servicerequestid, v_technicianuserid),
  CONSTRAINT fk_assign_sr FOREIGN KEY (v_servicerequestid) REFERENCES tbl_servicerequest(v_servicerequestid) ON DELETE CASCADE,
  CONSTRAINT fk_assign_user FOREIGN KEY (v_technicianuserid) REFERENCES tbl_user(v_userid)
) ENGINE=InnoDB;

CREATE TABLE tbl_attachment (
  v_attachmentid varchar(36) PRIMARY KEY,
  v_uploadedbyuserid varchar(36) NOT NULL,
  v_quotationid varchar(36),
  v_servicerequestid varchar(36),
  v_filename varchar(255) NOT NULL,
  v_fileurl text NOT NULL,
  v_filetype varchar(100),
  v_filesize bigint,
  v_attachmentdescription text,
  v_uploadedat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attachment_user FOREIGN KEY (v_uploadedbyuserid) REFERENCES tbl_user(v_userid),
  CONSTRAINT fk_attachment_quote FOREIGN KEY (v_quotationid) REFERENCES tbl_quotation(v_quotationid) ON DELETE CASCADE,
  CONSTRAINT fk_attachment_sr FOREIGN KEY (v_servicerequestid) REFERENCES tbl_servicerequest(v_servicerequestid) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tbl_notification (
  v_notificationid varchar(36) PRIMARY KEY,
  v_userid varchar(36) NOT NULL,
  v_notificationtype varchar(50) NOT NULL,
  v_quotationid varchar(36),
  v_servicerequestid varchar(36),
  v_appointmentid varchar(36),
  v_notificationtitle varchar(255) NOT NULL,
  v_notificationmessage text NOT NULL,
  v_isread boolean NOT NULL DEFAULT false,
  v_readat datetime,
  v_createdat datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (v_userid) REFERENCES tbl_user(v_userid) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO tbl_role (v_roleid, v_rolename, v_roledescription, v_isactive) VALUES
  (UUID(), 'Admin', 'Katala administrator portal account', true),
  (UUID(), 'Staff', 'Katala staff portal account', true),
  (UUID(), 'Customer', 'Katala customer portal account', true);

INSERT INTO tbl_productcategory (v_productcategoryid, v_categoryname, v_categorydescription) VALUES
  (UUID(), 'Fire Protection', 'Fire safety products'),
  (UUID(), 'Security', 'Security and surveillance products');

INSERT INTO tbl_servicecategory (v_servicecategoryid, v_categoryname, v_categorydescription) VALUES
  (UUID(), 'Installation', 'Installation services'),
  (UUID(), 'Maintenance', 'Maintenance and inspection services');

INSERT INTO tbl_product (v_productid, v_productcategoryid, v_productcategory, v_productname, v_productdescription, v_isactive)
SELECT UUID(), v_productcategoryid, 'Fire Protection', 'Fire Extinguisher', 'Standard fire extinguisher supply.', true
FROM tbl_productcategory WHERE v_categoryname = 'Fire Protection' LIMIT 1;

INSERT INTO tbl_productvariant (v_productvariantid, v_productid, v_productcode, v_productmodel, v_productsize, v_productunit, v_stockquantity, v_reorderlevel)
SELECT UUID(), v_productid, 'FE-10LB', 'Dry Chemical', '10 lb', 'unit', 20, 5
FROM tbl_product WHERE v_productname = 'Fire Extinguisher' LIMIT 1;

INSERT INTO tbl_service (v_serviceid, v_servicecategoryid, v_servicecategory, v_servicecode, v_servicename, v_servicedescription, v_estimatedduration, v_isactive)
SELECT UUID(), v_servicecategoryid, 'Installation', 'SYS-INSTALL', 'System Installation', 'Fire and security system installation.', '1-3 days', true
FROM tbl_servicecategory WHERE v_categoryname = 'Installation' LIMIT 1;

INSERT INTO tbl_service (v_serviceid, v_servicecategoryid, v_servicecategory, v_servicecode, v_servicename, v_servicedescription, v_estimatedduration, v_isactive)
SELECT UUID(), v_servicecategoryid, 'Maintenance', 'SYS-MAINT', 'Preventive Maintenance', 'Routine safety system inspection and maintenance.', '2-4 hours', true
FROM tbl_servicecategory WHERE v_categoryname = 'Maintenance' LIMIT 1;
