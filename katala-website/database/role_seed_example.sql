-- Run this after the matching accounts exist in public.tbl_user.
-- Replace the sample emails with the real accounts you want to grant access.

INSERT INTO public.tbl_role (v_rolename, v_roledescription, v_isactive)
SELECT role_name, role_description, TRUE
FROM (
  VALUES
    ('Customer', 'Standard customer account'),
    ('Staff', 'Katala staff portal account'),
    ('Admin', 'Katala administrator account')
) AS seed(role_name, role_description)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tbl_role r
  WHERE LOWER(r.v_rolename) = LOWER(seed.role_name)
);

INSERT INTO public.tbl_userrole (v_userid, v_roleid)
SELECT u.v_userid, r.v_roleid
FROM public.tbl_user u
CROSS JOIN public.tbl_role r
WHERE LOWER(u.v_emailaddress) = LOWER('admin@example.com')
  AND LOWER(r.v_rolename) = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tbl_userrole ur
    WHERE ur.v_userid = u.v_userid
      AND ur.v_roleid = r.v_roleid
  );

INSERT INTO public.tbl_userrole (v_userid, v_roleid)
SELECT u.v_userid, r.v_roleid
FROM public.tbl_user u
CROSS JOIN public.tbl_role r
WHERE LOWER(u.v_emailaddress) = LOWER('staff@example.com')
  AND LOWER(r.v_rolename) = 'staff'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tbl_userrole ur
    WHERE ur.v_userid = u.v_userid
      AND ur.v_roleid = r.v_roleid
  );
