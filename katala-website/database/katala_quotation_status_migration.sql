ALTER TABLE public.tbl_quotation
  DROP CONSTRAINT IF EXISTS chk_quotationstatus;

ALTER TABLE public.tbl_quotation
  ADD CONSTRAINT chk_quotationstatus
  CHECK (v_quotationstatus IN (
    'Submitted',
    'Under Review',
    'Quotation Draft',
    'Accepted',
    'Ready for Payment',
    'Customer Confirmed',
    'Paid',
    'Rejected',
    'Cancelled',
    'Canceled'
  ));
