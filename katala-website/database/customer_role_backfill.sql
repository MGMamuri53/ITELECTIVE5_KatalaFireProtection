-- Backfill Customer role for existing users that do not have any explicit role.
-- Safe to run more than once.

INSERT INTO public.tbl_role (v_rolename, v_roledescription, v_isactive)
SELECT 'Customer', 'Katala customer portal account', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.tbl_role WHERE LOWER(v_rolename) = 'customer'
);

INSERT INTO public.tbl_userrole (v_userid, v_roleid)
SELECT u.v_userid, r.v_roleid
FROM public.tbl_user u
CROSS JOIN public.tbl_role r
WHERE LOWER(r.v_rolename) = 'customer'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tbl_userrole ur
    WHERE ur.v_userid = u.v_userid
  );
