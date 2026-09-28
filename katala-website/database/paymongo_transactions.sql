CREATE TABLE IF NOT EXISTS public.tbl_paymenttransaction (
  v_paymenttransactionid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_quotationid uuid REFERENCES public.tbl_quotation(v_quotationid) ON DELETE RESTRICT,
  v_servicerequestid uuid,
  v_userid uuid NOT NULL REFERENCES public.tbl_user(v_userid) ON DELETE RESTRICT,
  v_referencenumber character varying(80) NOT NULL UNIQUE,
  v_paymongo_checkoutsessionid character varying(120) UNIQUE,
  v_paymongo_paymentintentid character varying(120),
  v_paymongo_paymentid character varying(120) UNIQUE,
  v_status character varying(30) NOT NULL DEFAULT 'Pending',
  v_amount numeric(12,2) NOT NULL,
  v_currency character varying(3) NOT NULL DEFAULT 'PHP',
  v_paymentmethod character varying(40),
  v_checkouturl text,
  v_receiptnumber character varying(80) UNIQUE,
  v_billingname character varying(180),
  v_billingemail character varying(180),
  v_billingphone character varying(80),
  v_rawpayload jsonb,
  v_paidat timestamp with time zone,
  v_createdat timestamp with time zone NOT NULL DEFAULT now(),
  v_updatedat timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tbl_paymenttransaction_status_check
    CHECK (v_status IN ('Pending', 'Paid', 'Failed', 'Cancelled', 'Expired'))
);

ALTER TABLE public.tbl_paymenttransaction
  ALTER COLUMN v_quotationid DROP NOT NULL;

ALTER TABLE public.tbl_paymenttransaction
  ADD COLUMN IF NOT EXISTS v_servicerequestid uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fk_paymenttransaction_service_request'
  ) THEN
    ALTER TABLE public.tbl_paymenttransaction
      ADD CONSTRAINT fk_paymenttransaction_service_request
      FOREIGN KEY (v_servicerequestid) REFERENCES public.tbl_servicerequest(v_servicerequestid)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tbl_paymenttransaction_user
  ON public.tbl_paymenttransaction(v_userid);

CREATE INDEX IF NOT EXISTS idx_tbl_paymenttransaction_quotation
  ON public.tbl_paymenttransaction(v_quotationid);

CREATE INDEX IF NOT EXISTS idx_tbl_paymenttransaction_service_request
  ON public.tbl_paymenttransaction(v_servicerequestid);

CREATE INDEX IF NOT EXISTS idx_tbl_paymenttransaction_status
  ON public.tbl_paymenttransaction(v_status);
