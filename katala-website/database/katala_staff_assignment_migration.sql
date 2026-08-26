ALTER TABLE public.tbl_user
  ADD COLUMN IF NOT EXISTS v_assignedstaffname text,
  ADD COLUMN IF NOT EXISTS v_staffdesignation text,
  ADD COLUMN IF NOT EXISTS v_department text;
