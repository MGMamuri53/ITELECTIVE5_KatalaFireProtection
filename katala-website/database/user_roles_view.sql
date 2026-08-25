CREATE OR REPLACE VIEW public.vw_user_roles AS
SELECT
  ur.v_userroleid,
  u.v_userid,
  CONCAT_WS(' ', u.v_firstname, u.v_lastname) AS v_fullname,
  u.v_emailaddress,
  r.v_roleid,
  r.v_rolename,
  r.v_roledescription,
  ur.v_assignedat
FROM public.tbl_userrole ur
JOIN public.tbl_user u ON u.v_userid = ur.v_userid
JOIN public.tbl_role r ON r.v_roleid = ur.v_roleid
ORDER BY r.v_rolename, u.v_emailaddress;
