ALTER TABLE public.tbl_user
  ADD COLUMN IF NOT EXISTS v_assignedstaffname character varying(160),
  ADD COLUMN IF NOT EXISTS v_staffdesignation character varying(160),
  ADD COLUMN IF NOT EXISTS v_department character varying(160);

COMMENT ON COLUMN public.tbl_user.v_assignedstaffname IS 'Display name used when this staff account is assigned to paid services.';
COMMENT ON COLUMN public.tbl_user.v_staffdesignation IS 'Staff assignment role or designation.';
COMMENT ON COLUMN public.tbl_user.v_department IS 'Staff department or service team.';
