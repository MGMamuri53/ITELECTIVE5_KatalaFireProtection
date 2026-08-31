ALTER TABLE public.tbl_quotationstatushistory
  DROP CONSTRAINT IF EXISTS chk_quotationhistorystatus;

ALTER TABLE public.tbl_quotationstatushistory
  ADD CONSTRAINT chk_quotationhistorystatus
  CHECK (v_status IN (
    'Submitted',
    'Under Review',
    'Quotation Draft',
    'Site Inspection Required',
    'Quotation Prepared',
    'Sent to Customer',
    'Accepted',
    'Ready for Payment',
    'Customer Confirmed',
    'Paid',
    'Rejected',
    'Expired',
    'Cancelled',
    'Canceled'
  ));
