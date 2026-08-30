-- Backfill Supabase Auth users into the app profile/role tables.
-- Safe to rerun: all inserts use conflicts to avoid duplicates.

BEGIN;

WITH required_roles(v_rolename, v_roledescription) AS (
  VALUES
    ('Admin', 'Katala administrator portal account'),
    ('Staff', 'Katala staff portal account'),
    ('Customer', 'Katala customer portal account')
)
INSERT INTO public.tbl_role (v_rolename, v_roledescription, v_isactive)
SELECT rr.v_rolename, rr.v_roledescription, true
FROM required_roles rr
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tbl_role existing
  WHERE lower(existing.v_rolename) = lower(rr.v_rolename)
);

UPDATE public.tbl_role
SET v_roledescription = CASE lower(v_rolename)
    WHEN 'admin' THEN 'Katala administrator portal account'
    WHEN 'staff' THEN 'Katala staff portal account'
    WHEN 'customer' THEN 'Katala customer portal account'
    ELSE v_roledescription
  END,
  v_isactive = true
WHERE lower(v_rolename) IN ('admin', 'staff', 'customer');

WITH auth_profiles AS (
  SELECT
    id,
    lower(email) AS email,
    COALESCE(
      NULLIF(raw_user_meta_data->>'firstName', ''),
      NULLIF(raw_user_meta_data->>'first_name', ''),
      NULLIF(raw_user_meta_data->>'given_name', ''),
      INITCAP(REPLACE(SPLIT_PART(email, '@', 1), '.', ' ')),
      'Katala'
    ) AS first_name,
    COALESCE(
      NULLIF(raw_user_meta_data->>'lastName', ''),
      NULLIF(raw_user_meta_data->>'last_name', ''),
      NULLIF(raw_user_meta_data->>'family_name', ''),
      'Customer'
    ) AS last_name
  FROM auth.users
  WHERE email IS NOT NULL
)
INSERT INTO public.tbl_user (v_userid, v_firstname, v_lastname, v_emailaddress, v_accountstatus)
SELECT
  id,
  CASE WHEN email = 'adminkatala@gmail.com' THEN 'Admin'
       WHEN email = 'drinbayass@gmail.com' THEN 'Drin'
       ELSE LEFT(first_name, 100)
  END,
  CASE WHEN email = 'adminkatala@gmail.com' THEN 'Katala'
       WHEN email = 'drinbayass@gmail.com' THEN 'Bayass'
       ELSE LEFT(last_name, 100)
  END,
  email,
  'Active'
FROM auth_profiles
ON CONFLICT (v_userid) DO UPDATE SET
  v_emailaddress = EXCLUDED.v_emailaddress,
  v_accountstatus = CASE
    WHEN lower(EXCLUDED.v_emailaddress) IN ('adminkatala@gmail.com', 'drinbayass@gmail.com') THEN 'Active'
    ELSE public.tbl_user.v_accountstatus
  END,
  v_updatedat = now();

DELETE FROM public.tbl_userrole
WHERE v_userid IN (
  SELECT v_userid
  FROM public.tbl_user
  WHERE lower(v_emailaddress) IN ('adminkatala@gmail.com', 'drinbayass@gmail.com')
);

INSERT INTO public.tbl_userrole (v_userid, v_roleid)
SELECT u.v_userid, r.v_roleid
FROM public.tbl_user u
JOIN public.tbl_role r
  ON lower(r.v_rolename) = lower(CASE
    WHEN lower(u.v_emailaddress) = 'adminkatala@gmail.com' THEN 'Admin'
    WHEN lower(u.v_emailaddress) = 'drinbayass@gmail.com' THEN 'Staff'
    ELSE 'Customer'
  END)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tbl_userrole existing
  WHERE existing.v_userid = u.v_userid
)
ON CONFLICT (v_userid, v_roleid) DO NOTHING;

COMMIT;
