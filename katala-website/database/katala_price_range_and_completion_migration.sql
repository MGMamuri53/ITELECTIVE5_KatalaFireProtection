USE db_katala;

ALTER TABLE tbl_productvariant
  ADD COLUMN IF NOT EXISTS v_minprice decimal(12,2) NULL AFTER v_variantimageurl,
  ADD COLUMN IF NOT EXISTS v_maxprice decimal(12,2) NULL AFTER v_minprice;

ALTER TABLE tbl_service
  ADD COLUMN IF NOT EXISTS v_minprice decimal(12,2) NULL AFTER v_serviceimageurl,
  ADD COLUMN IF NOT EXISTS v_maxprice decimal(12,2) NULL AFTER v_minprice;

ALTER TABLE tbl_quotation
  ADD COLUMN IF NOT EXISTS v_completedat datetime NULL AFTER v_assignedstaff;
