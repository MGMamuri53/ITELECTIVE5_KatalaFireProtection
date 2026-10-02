-- Katala Supabase/Postgres app schema.
-- Run this in the Supabase SQL editor for a fresh project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS public.local_auth_accounts CASCADE;
DROP TABLE IF EXISTS public.tbl_notification CASCADE;
DROP TABLE IF EXISTS public.tbl_attachment CASCADE;
DROP TABLE IF EXISTS public.tbl_serviceassignment CASCADE;
DROP TABLE IF EXISTS public.tbl_appointment CASCADE;
DROP TABLE IF EXISTS public.tbl_servicerequeststatushistory CASCADE;
DROP TABLE IF EXISTS public.tbl_servicerequest CASCADE;
DROP TABLE IF EXISTS public.tbl_paymenttransaction CASCADE;
DROP TABLE IF EXISTS public.tbl_quotationstatushistory CASCADE;
DROP TABLE IF EXISTS public.tbl_quotationserviceitem CASCADE;
DROP TABLE IF EXISTS public.tbl_quotationproductitem CASCADE;
DROP TABLE IF EXISTS public.tbl_quotation CASCADE;
DROP TABLE IF EXISTS public.tbl_project CASCADE;
DROP TABLE IF EXISTS public.tbl_service CASCADE;
DROP TABLE IF EXISTS public.tbl_servicecategory CASCADE;
DROP TABLE IF EXISTS public.tbl_productvariant CASCADE;
DROP TABLE IF EXISTS public.tbl_product CASCADE;
DROP TABLE IF EXISTS public.tbl_productcategory CASCADE;
DROP TABLE IF EXISTS public.tbl_useraddress CASCADE;
DROP TABLE IF EXISTS public.tbl_userrole CASCADE;
DROP TABLE IF EXISTS public.tbl_user CASCADE;
DROP TABLE IF EXISTS public.tbl_role CASCADE;

CREATE TABLE public.tbl_role (
  v_roleid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_rolename varchar(50) NOT NULL UNIQUE,
  v_roledescription text,
  v_isactive boolean NOT NULL DEFAULT true,
  v_createdat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_user (
  v_userid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_firstname varchar(100) NOT NULL,
  v_middlename varchar(100),
  v_lastname varchar(100) NOT NULL,
  v_emailaddress varchar(255) NOT NULL UNIQUE,
  v_contactnumber varchar(20),
  v_profileimageurl text,
  v_accountstatus varchar(30) NOT NULL DEFAULT 'Active',
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now(),
  v_companyname varchar(255),
  v_jobtitle varchar(120),
  v_industry varchar(120),
  v_companyaddress text,
  v_assignedstaffname varchar(160),
  v_staffdesignation varchar(160),
  v_department varchar(160)
);

CREATE TABLE public.local_auth_accounts (
  v_userid uuid PRIMARY KEY REFERENCES public.tbl_user(v_userid) ON DELETE CASCADE,
  v_emailaddress varchar(255) NOT NULL UNIQUE,
  v_passwordhash varchar(255) NOT NULL,
  v_createdat timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.katala_sync_local_auth_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.v_userid IS NOT NULL
    AND NEW.v_emailaddress IS NOT NULL
    AND NEW.v_passwordhash IS NOT NULL THEN
    INSERT INTO public.local_auth_accounts (v_userid, v_emailaddress, v_passwordhash)
    VALUES (NEW.v_userid, NEW.v_emailaddress, NEW.v_passwordhash)
    ON CONFLICT (v_userid) DO UPDATE SET
      v_emailaddress = EXCLUDED.v_emailaddress,
      v_passwordhash = EXCLUDED.v_passwordhash;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER katala_sync_local_auth_account
AFTER INSERT OR UPDATE OF v_userid, v_emailaddress, v_passwordhash ON public.tbl_user
FOR EACH ROW EXECUTE FUNCTION public.katala_sync_local_auth_account();

CREATE TABLE public.tbl_userrole (
  v_userroleid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_userid uuid NOT NULL REFERENCES public.tbl_user(v_userid) ON DELETE CASCADE,
  v_roleid uuid NOT NULL REFERENCES public.tbl_role(v_roleid),
  v_assignedat timestamptz NOT NULL DEFAULT now(),
  UNIQUE (v_userid, v_roleid)
);

CREATE TABLE public.tbl_useraddress (
  v_useraddressid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_userid uuid NOT NULL REFERENCES public.tbl_user(v_userid) ON DELETE CASCADE,
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
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_productcategory (
  v_productcategoryid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_categoryname varchar(150) NOT NULL UNIQUE,
  v_categorydescription text,
  v_categoryimageurl text,
  v_isactive boolean NOT NULL DEFAULT true,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_product (
  v_productid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_productcategoryid uuid REFERENCES public.tbl_productcategory(v_productcategoryid) ON DELETE SET NULL,
  v_productcategory varchar(150),
  v_productname varchar(255) NOT NULL,
  v_productdescription text,
  v_productimageurl text,
  v_isactive boolean NOT NULL DEFAULT true,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now(),
  UNIQUE (v_productcategory, v_productname)
);

CREATE TABLE public.tbl_productvariant (
  v_productvariantid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_productid uuid NOT NULL REFERENCES public.tbl_product(v_productid) ON DELETE CASCADE,
  v_productcode varchar(80) NOT NULL UNIQUE,
  v_productmodel varchar(100),
  v_productsize varchar(100),
  v_productunit varchar(50),
  v_variantdescription text,
  v_variantimageurl text,
  v_minprice numeric(12,2),
  v_maxprice numeric(12,2),
  v_availabilitystatus varchar(30) NOT NULL DEFAULT 'Available',
  v_isactive boolean NOT NULL DEFAULT true,
  v_stockquantity int DEFAULT 0,
  v_reorderlevel int DEFAULT 0,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_servicecategory (
  v_servicecategoryid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_categoryname varchar(150) NOT NULL UNIQUE,
  v_categorydescription text,
  v_categoryimageurl text,
  v_isactive boolean NOT NULL DEFAULT true,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_service (
  v_serviceid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_servicecategoryid uuid REFERENCES public.tbl_servicecategory(v_servicecategoryid) ON DELETE SET NULL,
  v_servicecategory varchar(150),
  v_servicecode varchar(50) NOT NULL UNIQUE,
  v_servicename varchar(255) NOT NULL,
  v_servicedescription text,
  v_servicerequirements text,
  v_estimatedduration varchar(100),
  v_serviceimageurl text,
  v_minprice numeric(12,2),
  v_maxprice numeric(12,2),
  v_isinspectionrequired boolean NOT NULL DEFAULT false,
  v_isactive boolean NOT NULL DEFAULT true,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_project (
  v_projectid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_projecttitle varchar(255) NOT NULL,
  v_clientname varchar(255),
  v_projectlocation varchar(255),
  v_projecttype varchar(100),
  v_projectoverview text,
  v_servicesperformed text,
  v_completiondate date,
  v_coverimageurl text,
  v_isfeatured boolean NOT NULL DEFAULT false,
  v_ispublished boolean NOT NULL DEFAULT false,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_quotation (
  v_quotationid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_userid uuid NOT NULL REFERENCES public.tbl_user(v_userid),
  v_referencenumber varchar(50) NOT NULL UNIQUE,
  v_projectname varchar(255),
  v_establishmentname varchar(255),
  v_projectdescription text,
  v_projectaddress text,
  v_customerremarks text,
  v_adminremarks text,
  v_additionalcost numeric(12,2) NOT NULL DEFAULT 0,
  v_quotationstatus varchar(50) NOT NULL DEFAULT 'Submitted',
  v_validuntil date,
  v_submittedat timestamptz NOT NULL DEFAULT now(),
  v_reviewedat timestamptz,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now(),
  v_quotationdate date,
  v_scheduleddate date,
  v_scheduledtime time,
  v_assignedstaff text,
  v_completedat timestamptz
);

CREATE TABLE public.tbl_quotationproductitem (
  v_quotationproductitemid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_quotationid uuid NOT NULL REFERENCES public.tbl_quotation(v_quotationid) ON DELETE CASCADE,
  v_productvariantid uuid NOT NULL REFERENCES public.tbl_productvariant(v_productvariantid),
  v_quantity int NOT NULL,
  v_unitprice numeric(12,2),
  v_itemdescription text,
  v_adminremarks text,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_quotationserviceitem (
  v_quotationserviceitemid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_quotationid uuid NOT NULL REFERENCES public.tbl_quotation(v_quotationid) ON DELETE CASCADE,
  v_serviceid uuid NOT NULL REFERENCES public.tbl_service(v_serviceid),
  v_quantity int NOT NULL DEFAULT 1,
  v_unitprice numeric(12,2),
  v_itemdescription text,
  v_adminremarks text,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_quotationstatushistory (
  v_quotationstatushistoryid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_quotationid uuid NOT NULL REFERENCES public.tbl_quotation(v_quotationid) ON DELETE CASCADE,
  v_updatedbyuserid uuid NOT NULL REFERENCES public.tbl_user(v_userid),
  v_status varchar(50) NOT NULL,
  v_statusremarks text,
  v_createdat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_paymenttransaction (
  v_paymenttransactionid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_quotationid uuid REFERENCES public.tbl_quotation(v_quotationid),
  v_servicerequestid uuid,
  v_userid uuid NOT NULL REFERENCES public.tbl_user(v_userid),
  v_referencenumber varchar(80) NOT NULL UNIQUE,
  v_paymongo_checkoutsessionid varchar(120) UNIQUE,
  v_paymongo_paymentintentid varchar(120),
  v_paymongo_paymentid varchar(120) UNIQUE,
  v_status varchar(30) NOT NULL DEFAULT 'Pending',
  v_amount numeric(12,2) NOT NULL,
  v_currency varchar(3) NOT NULL DEFAULT 'PHP',
  v_paymentmethod varchar(40),
  v_checkouturl text,
  v_receiptnumber varchar(80) UNIQUE,
  v_billingname varchar(180),
  v_billingemail varchar(180),
  v_billingphone varchar(80),
  v_rawpayload jsonb,
  v_paidat timestamptz,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_servicerequest (
  v_servicerequestid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_userid uuid NOT NULL REFERENCES public.tbl_user(v_userid),
  v_serviceid uuid NOT NULL REFERENCES public.tbl_service(v_serviceid),
  v_useraddressid uuid REFERENCES public.tbl_useraddress(v_useraddressid) ON DELETE SET NULL,
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
  v_quotedamount numeric(12,2),
  v_paymentstatus varchar(30),
  v_receiptnumber varchar(80),
  v_paidat timestamptz,
  v_pricehistory jsonb,
  v_submittedat timestamptz NOT NULL DEFAULT now(),
  v_completedat timestamptz,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tbl_paymenttransaction
  ADD CONSTRAINT fk_payment_service_request
  FOREIGN KEY (v_servicerequestid) REFERENCES public.tbl_servicerequest(v_servicerequestid);

CREATE TABLE public.tbl_servicerequeststatushistory (
  v_servicerequeststatushistoryid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_servicerequestid uuid NOT NULL REFERENCES public.tbl_servicerequest(v_servicerequestid) ON DELETE CASCADE,
  v_updatedbyuserid uuid NOT NULL REFERENCES public.tbl_user(v_userid),
  v_status varchar(50) NOT NULL,
  v_statusremarks text,
  v_createdat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_appointment (
  v_appointmentid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_servicerequestid uuid NOT NULL REFERENCES public.tbl_servicerequest(v_servicerequestid) ON DELETE CASCADE,
  v_appointmenttype varchar(50) NOT NULL,
  v_scheduleddate date NOT NULL,
  v_starttime time NOT NULL,
  v_endtime time,
  v_appointmentstatus varchar(30) NOT NULL DEFAULT 'Pending',
  v_locationdetails text,
  v_adminremarks text,
  v_createdat timestamptz NOT NULL DEFAULT now(),
  v_updatedat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_serviceassignment (
  v_serviceassignmentid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_servicerequestid uuid NOT NULL REFERENCES public.tbl_servicerequest(v_servicerequestid) ON DELETE CASCADE,
  v_technicianuserid uuid NOT NULL REFERENCES public.tbl_user(v_userid),
  v_assignmentrole varchar(100),
  v_assignmentstatus varchar(30) NOT NULL DEFAULT 'Assigned',
  v_assignmentremarks text,
  v_assignedat timestamptz NOT NULL DEFAULT now(),
  v_completedat timestamptz,
  UNIQUE (v_servicerequestid, v_technicianuserid)
);

CREATE TABLE public.tbl_attachment (
  v_attachmentid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_uploadedbyuserid uuid NOT NULL REFERENCES public.tbl_user(v_userid),
  v_quotationid uuid REFERENCES public.tbl_quotation(v_quotationid) ON DELETE CASCADE,
  v_servicerequestid uuid REFERENCES public.tbl_servicerequest(v_servicerequestid) ON DELETE CASCADE,
  v_filename varchar(255) NOT NULL,
  v_fileurl text NOT NULL,
  v_filetype varchar(100),
  v_filesize bigint,
  v_attachmentdescription text,
  v_uploadedat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tbl_notification (
  v_notificationid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_userid uuid NOT NULL REFERENCES public.tbl_user(v_userid) ON DELETE CASCADE,
  v_notificationtype varchar(50) NOT NULL,
  v_quotationid uuid,
  v_servicerequestid uuid,
  v_appointmentid uuid,
  v_notificationtitle varchar(255) NOT NULL,
  v_notificationmessage text NOT NULL,
  v_isread boolean NOT NULL DEFAULT false,
  v_readat timestamptz,
  v_createdat timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tbl_userrole_user ON public.tbl_userrole(v_userid);
CREATE INDEX idx_tbl_productvariant_product ON public.tbl_productvariant(v_productid);
CREATE INDEX idx_tbl_quotation_user ON public.tbl_quotation(v_userid);
CREATE INDEX idx_tbl_quotation_reference ON public.tbl_quotation(v_referencenumber);
CREATE INDEX idx_tbl_payment_user ON public.tbl_paymenttransaction(v_userid);
CREATE INDEX idx_tbl_payment_quotation ON public.tbl_paymenttransaction(v_quotationid);
CREATE INDEX idx_tbl_payment_service_request ON public.tbl_paymenttransaction(v_servicerequestid);
CREATE INDEX idx_tbl_service_request_user ON public.tbl_servicerequest(v_userid);
CREATE INDEX idx_tbl_notification_user ON public.tbl_notification(v_userid);

INSERT INTO public.tbl_role (v_rolename, v_roledescription, v_isactive) VALUES
  ('Admin', 'Katala administrator portal account', true),
  ('Staff', 'Katala staff portal account', true),
  ('Customer', 'Katala customer portal account', true)
ON CONFLICT (v_rolename) DO NOTHING;

INSERT INTO public.tbl_productcategory (v_categoryname, v_categorydescription) VALUES
  ('Fire Extinguishers', 'Fire extinguisher products'),
  ('Cabinets & Fittings', 'Cabinets and fittings'),
  ('Fire Alarm & Detection', 'Fire alarm and detection products'),
  ('Fire Pumps', 'Fire pump assemblies')
ON CONFLICT (v_categoryname) DO NOTHING;

INSERT INTO public.tbl_servicecategory (v_categoryname, v_categorydescription) VALUES
  ('Products', 'Product supply and quotation support'),
  ('Installation', 'Fire safety installation and system services'),
  ('Maintenance', 'Maintenance and inspection services')
ON CONFLICT (v_categoryname) DO NOTHING;

WITH seed(product_name, category_name, model_name, size_name, description_text, min_price, max_price) AS (
  VALUES
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '1 lb', 'Empty tank with complete set acc.', 1500.00, 2500.00),
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '3 lb', 'Empty tank with complete set acc.', 2000.00, 3500.00),
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '5 lb', 'Empty tank with complete set acc.', 2500.00, 4500.00),
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '10 lb', 'Empty tank with complete set acc.', 3500.00, 6500.00),
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '20 lb', 'Empty tank with complete set acc.', 5500.00, 9500.00),
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '50 lb', 'Empty tank with complete set acc.', 12000.00, 24000.00),
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-02', '10 lb', 'Empty tank with complete set acc.', 3500.00, 6500.00),
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-02', '20 lb', 'Empty tank with complete set acc.', 5500.00, 9500.00),
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-03', '10 lb', 'Empty tank with complete set acc.', 3500.00, 6500.00),
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-03', '20 lb', 'Empty tank with complete set acc.', 5500.00, 9500.00),
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-04', '10 lb', 'Empty tank with complete set acc.', 3500.00, 6500.00),
    ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-04', '15 lb', 'Empty tank with complete set acc.', 4500.00, 8500.00),
    ('Firehose Cabinet', 'Cabinets & Fittings', 'HK-C-01', '50 ft', 'Firehose cabinet', 7000.00, 15000.00),
    ('Firehose Cabinet', 'Cabinets & Fittings', 'HK-C-01', '100 ft', 'Firehose cabinet', 9000.00, 18000.00),
    ('Fire Extinguisher Cabinet', 'Cabinets & Fittings', 'HK-C-02', '10 lb', 'Fire extinguisher cabinet', 2500.00, 6000.00),
    ('Fire Extinguisher Cabinet', 'Cabinets & Fittings', 'HK-C-02', '20 lb', 'Fire extinguisher cabinet', 3500.00, 8000.00),
    ('Firehose Cabinet', 'Cabinets & Fittings', 'HK-C-03', '50 ft', 'Firehose cabinet', 7000.00, 15000.00),
    ('Firehose Cabinet', 'Cabinets & Fittings', 'HK-C-03', '100 ft', 'Firehose cabinet', 9000.00, 18000.00),
    ('Siamese Twin', 'Cabinets & Fittings', 'HK-C-04', 'Standard', 'Siamese twin', 5000.00, 14000.00),
    ('Fire Alarm Control Panel', 'Fire Alarm & Detection', 'FACP', '4 zones', 'Fire alarm control panel', 12000.00, 45000.00),
    ('Smoke Detector - Battery', 'Fire Alarm & Detection', 'SD-BAT', 'Standard', 'Smoke detector battery', 750.00, 1800.00),
    ('Smoke Electric Detector', 'Fire Alarm & Detection', 'HK-D-09', 'Standard', 'Smoke electric', 900.00, 2500.00),
    ('Smoke & Heat Detector', 'Fire Alarm & Detection', 'HK-D-10', 'Standard', 'Smoke and heat', 1000.00, 2800.00),
    ('Fire Pump / Jockey Pump Assembly', 'Fire Pumps', 'PUMP', 'Standard', 'Fire protection product shown in company profile', 18000.00, 160000.00)
),
products AS (
  INSERT INTO public.tbl_product (v_productcategoryid, v_productcategory, v_productname, v_productdescription, v_isactive)
  SELECT pc.v_productcategoryid, seed.category_name, seed.product_name, min(seed.description_text), true
  FROM seed
  JOIN public.tbl_productcategory pc ON pc.v_categoryname = seed.category_name
  GROUP BY pc.v_productcategoryid, seed.category_name, seed.product_name
  ON CONFLICT (v_productcategory, v_productname) DO NOTHING
  RETURNING v_productid, v_productcategory, v_productname
)
INSERT INTO public.tbl_productvariant
  (v_productid, v_productcode, v_productmodel, v_productsize, v_productunit, v_variantdescription, v_minprice, v_maxprice, v_isactive, v_stockquantity, v_reorderlevel)
SELECT
  p.v_productid,
  upper(regexp_replace(coalesce(nullif(seed.model_name, ''), left(seed.product_name, 12)), '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
    upper(regexp_replace(coalesce(nullif(seed.size_name, ''), 'STD'), '[^a-zA-Z0-9]+', '-', 'g')),
  nullif(seed.model_name, ''),
  nullif(seed.size_name, ''),
  'unit',
  seed.description_text,
  seed.min_price,
  seed.max_price,
  true,
  50,
  5
FROM seed
JOIN public.tbl_product p ON p.v_productname = seed.product_name AND p.v_productcategory = seed.category_name
ON CONFLICT (v_productcode) DO NOTHING;

INSERT INTO public.tbl_service
  (v_servicecategoryid, v_servicecategory, v_servicecode, v_servicename, v_servicedescription, v_estimatedduration, v_minprice, v_maxprice, v_isactive)
SELECT sc.v_servicecategoryid, item.service_category, item.service_code, item.service_name, item.description_text, item.duration_text, item.min_price, item.max_price, true
FROM (
  VALUES
    ('Installation', 'Installation', 'SYS-INSTALL', 'System Installation', 'Fire and security system installation.', '1-3 days', 25000.00, 75000.00),
    ('Maintenance', 'Maintenance', 'SYS-MAINT', 'Preventive Maintenance', 'Routine safety system inspection and maintenance.', '2-4 hours', 5000.00, 25000.00),
    ('Products', 'Products', 'SVC-FE', 'Fire Extinguishers', 'Supply of fire extinguisher units, cabinets, and related accessories for facility fire-safety requirements.', 'After site review', 1500.00, 8000.00),
    ('Installation', 'Systems', 'SVC-FDAS', 'Fire Detection & Alarm Systems', 'Fire alarm control panels, smoke and heat detection devices, and related installation or system support.', 'After site review', 12000.00, 85000.00),
    ('Installation', 'Systems', 'SVC-SPRINKLER', 'Automatic Fire Sprinkler Systems', 'Automatic fire sprinkler system support for new installations, upgrades, and project requirements.', 'After site review', 25000.00, 200000.00),
    ('Installation', 'Systems', 'SVC-PUMP', 'Fire Pump & Jockey Pump', 'Supply, installation, and testing support for fire pump and jockey pump system requirements.', 'After site review', 18000.00, 160000.00),
    ('Installation', 'Systems', 'SVC-KITCHEN-CCTV', 'Kitchen Suppression & CCTV', 'Kitchen suppression and CCTV solutions for sites that require additional safety and monitoring coverage.', 'After site review', 10000.00, 90000.00)
) AS item(category_name, service_category, service_code, service_name, description_text, duration_text, min_price, max_price)
JOIN public.tbl_servicecategory sc ON sc.v_categoryname = item.category_name
ON CONFLICT (v_servicecode) DO NOTHING;
