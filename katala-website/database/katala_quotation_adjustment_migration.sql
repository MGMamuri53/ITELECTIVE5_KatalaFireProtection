ALTER TABLE public.tbl_quotation
  DROP CONSTRAINT IF EXISTS chk_quotationadditionalcost;

ALTER TABLE public.tbl_quotation
  ADD CONSTRAINT chk_quotationadditionalcost
  CHECK (v_additionalcost >= (-999999999.99)::numeric);

COMMENT ON COLUMN public.tbl_quotation.v_additionalcost IS 'Staff quotation adjustment outside product rows. Positive values are custom fees; negative values are discounts.';
