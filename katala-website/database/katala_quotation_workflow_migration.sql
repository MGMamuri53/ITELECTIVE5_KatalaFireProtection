ALTER TABLE public.tbl_quotation
  ADD COLUMN IF NOT EXISTS v_quotationdate date,
  ADD COLUMN IF NOT EXISTS v_scheduleddate date,
  ADD COLUMN IF NOT EXISTS v_scheduledtime time,
  ADD COLUMN IF NOT EXISTS v_assignedstaff text;

COMMENT ON COLUMN public.tbl_quotation.v_quotationdate IS 'Staff-assigned quotation date shown to the customer.';
COMMENT ON COLUMN public.tbl_quotation.v_scheduleddate IS 'Company proposed or confirmed service schedule date for the quotation.';
COMMENT ON COLUMN public.tbl_quotation.v_scheduledtime IS 'Company proposed or confirmed service schedule time for the quotation.';
COMMENT ON COLUMN public.tbl_quotation.v_assignedstaff IS 'Responsible staff member assigned by Katala staff.';
