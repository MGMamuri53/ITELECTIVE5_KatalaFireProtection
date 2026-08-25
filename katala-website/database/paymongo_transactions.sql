CREATE TABLE IF NOT EXISTS public.tbl_paymenttransaction (
  v_paymenttransactionid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v_quotationid uuid NOT NULL REFERENCES public.tbl_quotation(v_quotationid) ON DELETE RESTRICT,
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

CREATE INDEX IF NOT EXISTS idx_tbl_paymenttransaction_user
  ON public.tbl_paymenttransaction(v_userid);

CREATE INDEX IF NOT EXISTS idx_tbl_paymenttransaction_quotation
  ON public.tbl_paymenttransaction(v_quotationid);

CREATE INDEX IF NOT EXISTS idx_tbl_paymenttransaction_status
  ON public.tbl_paymenttransaction(v_status);
