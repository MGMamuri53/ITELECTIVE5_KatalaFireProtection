-- Adds the catalog items used by src/data/catalog.js to the XAMPP/MySQL app schema.

USE db_katala;

INSERT IGNORE INTO tbl_productcategory (v_productcategoryid, v_categoryname, v_categorydescription) VALUES
  (UUID(), 'Fire Extinguishers', 'Fire extinguisher products'),
  (UUID(), 'Cabinets & Fittings', 'Cabinets and fittings'),
  (UUID(), 'Fire Alarm & Detection', 'Fire alarm and detection products'),
  (UUID(), 'Fire Pumps', 'Fire pump assemblies');

DROP TEMPORARY TABLE IF EXISTS tmp_katala_catalog_seed;
CREATE TEMPORARY TABLE tmp_katala_catalog_seed (
  product_name varchar(255) NOT NULL,
  category_name varchar(150) NOT NULL,
  model_name varchar(100) NOT NULL,
  size_name varchar(100) NOT NULL,
  description_text text
);

INSERT INTO tmp_katala_catalog_seed VALUES
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '1 lb', 'Empty tank with complete set acc.'),
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '3 lb', 'Empty tank with complete set acc.'),
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '5 lb', 'Empty tank with complete set acc.'),
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '10 lb', 'Empty tank with complete set acc.'),
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '20 lb', 'Empty tank with complete set acc.'),
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-01', '50 lb', 'Empty tank with complete set acc.'),
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-02', '10 lb', 'Empty tank with complete set acc.'),
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-02', '20 lb', 'Empty tank with complete set acc.'),
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-03', '10 lb', 'Empty tank with complete set acc.'),
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-03', '20 lb', 'Empty tank with complete set acc.'),
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-04', '10 lb', 'Empty tank with complete set acc.'),
  ('Fire Extinguisher Set', 'Fire Extinguishers', 'HK-A-04', '15 lb', 'Empty tank with complete set acc.'),
  ('Firehose Cabinet', 'Cabinets & Fittings', 'HK-C-01', '50 ft', 'Firehose cabinet'),
  ('Firehose Cabinet', 'Cabinets & Fittings', 'HK-C-01', '100 ft', 'Firehose cabinet'),
  ('Fire Extinguisher Cabinet', 'Cabinets & Fittings', 'HK-C-02', '10 lb', 'Fire extinguisher cabinet'),
  ('Fire Extinguisher Cabinet', 'Cabinets & Fittings', 'HK-C-02', '20 lb', 'Fire extinguisher cabinet'),
  ('Firehose Cabinet', 'Cabinets & Fittings', 'HK-C-03', '50 ft', 'Firehose cabinet'),
  ('Firehose Cabinet', 'Cabinets & Fittings', 'HK-C-03', '100 ft', 'Firehose cabinet'),
  ('Siamese Twin', 'Cabinets & Fittings', 'HK-C-04', '', 'Siamese twin'),
  ('Fire Alarm Control Panel', 'Fire Alarm & Detection', '', '4 zones', 'Fire alarm control panel'),
  ('Smoke Detector - Battery', 'Fire Alarm & Detection', '', '', 'Smoke detector battery'),
  ('Smoke Electric Detector', 'Fire Alarm & Detection', 'HK-D-09', '', 'Smoke electric'),
  ('Smoke & Heat Detector', 'Fire Alarm & Detection', 'HK-D-10', '', 'Smoke and heat'),
  ('Fire Pump / Jockey Pump Assembly', 'Fire Pumps', '', '', 'Fire protection product shown in company profile');

INSERT IGNORE INTO tbl_product (v_productid, v_productcategoryid, v_productcategory, v_productname, v_productdescription, v_isactive)
SELECT UUID(), pc.v_productcategoryid, seed.category_name, seed.product_name, seed.description_text, true
FROM (
  SELECT product_name, category_name, MIN(description_text) AS description_text
  FROM tmp_katala_catalog_seed
  GROUP BY product_name, category_name
) seed
JOIN tbl_productcategory pc ON pc.v_categoryname = seed.category_name;

INSERT IGNORE INTO tbl_productvariant
  (v_productvariantid, v_productid, v_productcode, v_productmodel, v_productsize, v_productunit, v_variantdescription, v_isactive, v_stockquantity, v_reorderlevel)
SELECT
  UUID(),
  p.v_productid,
  CONCAT(
    UPPER(REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(seed.model_name, ''), LEFT(seed.product_name, 12)), ' ', '-'), '/', '-'), '&', 'AND')),
    '-',
    UPPER(REPLACE(REPLACE(COALESCE(NULLIF(seed.size_name, ''), 'STD'), ' ', ''), '/', '-'))
  ),
  NULLIF(seed.model_name, ''),
  NULLIF(seed.size_name, ''),
  'unit',
  seed.description_text,
  true,
  50,
  5
FROM tmp_katala_catalog_seed seed
JOIN tbl_product p ON p.v_productname = seed.product_name AND p.v_productcategory = seed.category_name;

DROP TEMPORARY TABLE IF EXISTS tmp_katala_catalog_seed;
