SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_servicerequest' AND COLUMN_NAME = 'v_quotedamount') = 0,
  'ALTER TABLE tbl_servicerequest ADD COLUMN v_quotedamount decimal(12,2) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_servicerequest' AND COLUMN_NAME = 'v_paymentstatus') = 0,
  'ALTER TABLE tbl_servicerequest ADD COLUMN v_paymentstatus varchar(30) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_servicerequest' AND COLUMN_NAME = 'v_receiptnumber') = 0,
  'ALTER TABLE tbl_servicerequest ADD COLUMN v_receiptnumber varchar(80) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_servicerequest' AND COLUMN_NAME = 'v_paidat') = 0,
  'ALTER TABLE tbl_servicerequest ADD COLUMN v_paidat datetime NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_servicerequest' AND COLUMN_NAME = 'v_pricehistory') = 0,
  'ALTER TABLE tbl_servicerequest ADD COLUMN v_pricehistory json NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE tbl_service
SET v_minprice = CASE v_servicecode
    WHEN 'SYS-INSTALL' THEN 25000.00
    WHEN 'SYS-MAINT' THEN 5000.00
    WHEN 'SVC-FE' THEN 1500.00
    WHEN 'SVC-FDAS' THEN 12000.00
    WHEN 'SVC-SPRINKLER' THEN 25000.00
    WHEN 'SVC-PUMP' THEN 18000.00
    WHEN 'SVC-KITCHEN-CCTV' THEN 10000.00
    ELSE COALESCE(v_minprice, 2500.00)
  END,
  v_maxprice = CASE v_servicecode
    WHEN 'SYS-INSTALL' THEN 75000.00
    WHEN 'SYS-MAINT' THEN 25000.00
    WHEN 'SVC-FE' THEN 8000.00
    WHEN 'SVC-FDAS' THEN 85000.00
    WHEN 'SVC-SPRINKLER' THEN 200000.00
    WHEN 'SVC-PUMP' THEN 160000.00
    WHEN 'SVC-KITCHEN-CCTV' THEN 90000.00
    ELSE COALESCE(v_maxprice, 15000.00)
  END
WHERE v_minprice IS NULL OR v_maxprice IS NULL OR v_minprice = 0 OR v_maxprice = 0;

INSERT INTO tbl_servicecategory (v_servicecategoryid, v_categoryname, v_categorydescription, v_isactive)
SELECT UUID(), 'Products', 'Product supply and quotation support', true
WHERE NOT EXISTS (SELECT 1 FROM tbl_servicecategory WHERE v_categoryname = 'Products');

INSERT INTO tbl_servicecategory (v_servicecategoryid, v_categoryname, v_categorydescription, v_isactive)
SELECT UUID(), 'Installation', 'Fire safety installation and system services', true
WHERE NOT EXISTS (SELECT 1 FROM tbl_servicecategory WHERE v_categoryname = 'Installation');

INSERT INTO tbl_service (v_serviceid, v_servicecategoryid, v_servicecategory, v_servicecode, v_servicename, v_servicedescription, v_estimatedduration, v_minprice, v_maxprice, v_isactive)
SELECT UUID(), sc.v_servicecategoryid, 'Products', 'SVC-FE', 'Fire Extinguishers',
       'Supply of fire extinguisher units, cabinets, and related accessories for facility fire-safety requirements.',
       'After site review', 1500.00, 8000.00, true
FROM tbl_servicecategory sc
WHERE sc.v_categoryname = 'Products'
  AND NOT EXISTS (SELECT 1 FROM tbl_service WHERE v_servicecode = 'SVC-FE');

INSERT INTO tbl_service (v_serviceid, v_servicecategoryid, v_servicecategory, v_servicecode, v_servicename, v_servicedescription, v_estimatedduration, v_minprice, v_maxprice, v_isactive)
SELECT UUID(), sc.v_servicecategoryid, 'Systems', 'SVC-FDAS', 'Fire Detection & Alarm Systems',
       'Fire alarm control panels, smoke and heat detection devices, and related installation or system support.',
       'After site review', 12000.00, 85000.00, true
FROM tbl_servicecategory sc
WHERE sc.v_categoryname = 'Installation'
  AND NOT EXISTS (SELECT 1 FROM tbl_service WHERE v_servicecode = 'SVC-FDAS');

INSERT INTO tbl_service (v_serviceid, v_servicecategoryid, v_servicecategory, v_servicecode, v_servicename, v_servicedescription, v_estimatedduration, v_minprice, v_maxprice, v_isactive)
SELECT UUID(), sc.v_servicecategoryid, 'Systems', 'SVC-SPRINKLER', 'Automatic Fire Sprinkler Systems',
       'Automatic fire sprinkler system support for new installations, upgrades, and project requirements.',
       'After site review', 25000.00, 200000.00, true
FROM tbl_servicecategory sc
WHERE sc.v_categoryname = 'Installation'
  AND NOT EXISTS (SELECT 1 FROM tbl_service WHERE v_servicecode = 'SVC-SPRINKLER');

INSERT INTO tbl_service (v_serviceid, v_servicecategoryid, v_servicecategory, v_servicecode, v_servicename, v_servicedescription, v_estimatedduration, v_minprice, v_maxprice, v_isactive)
SELECT UUID(), sc.v_servicecategoryid, 'Systems', 'SVC-PUMP', 'Fire Pump & Jockey Pump',
       'Supply, installation, and testing support for fire pump and jockey pump system requirements.',
       'After site review', 18000.00, 160000.00, true
FROM tbl_servicecategory sc
WHERE sc.v_categoryname = 'Installation'
  AND NOT EXISTS (SELECT 1 FROM tbl_service WHERE v_servicecode = 'SVC-PUMP');

INSERT INTO tbl_service (v_serviceid, v_servicecategoryid, v_servicecategory, v_servicecode, v_servicename, v_servicedescription, v_estimatedduration, v_minprice, v_maxprice, v_isactive)
SELECT UUID(), sc.v_servicecategoryid, 'Systems', 'SVC-KITCHEN-CCTV', 'Kitchen Suppression & CCTV',
       'Kitchen suppression and CCTV solutions for sites that require additional safety and monitoring coverage.',
       'After site review', 10000.00, 90000.00, true
FROM tbl_servicecategory sc
WHERE sc.v_categoryname = 'Installation'
  AND NOT EXISTS (SELECT 1 FROM tbl_service WHERE v_servicecode = 'SVC-KITCHEN-CCTV');
