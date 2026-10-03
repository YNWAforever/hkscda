-- These SECURITY DEFINER commands accept a server-authenticated actor.
-- Actor role checks do not authenticate an arbitrary browser-supplied UUID.
-- CREATE OR REPLACE retains inherited PUBLIC EXECUTE unless revoked explicitly.
revoke execute on function public.issue_receipt(uuid,uuid,integer,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.issue_receipt(uuid,uuid,integer,integer,timestamptz) to service_role;
revoke execute on function public.cancel_sponsorship_pledge(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.cancel_sponsorship_pledge(uuid,uuid,text) to service_role;
revoke execute on function public.change_adoption_case_status(uuid,uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.change_adoption_case_status(uuid,uuid,uuid,text,timestamptz) to service_role;
revoke execute on function public.finalize_successful_adoption(uuid,uuid,uuid,text,integer,date,date,uuid) from public, anon, authenticated;
grant execute on function public.finalize_successful_adoption(uuid,uuid,uuid,text,integer,date,date,uuid) to service_role;
