-- Read-only metadata preflight. Run only in the HKSCDA database identified by
-- project ref iihqjzilgawhfdhdevam, after checking the dashboard project identity.
-- No donor rows, payment details, credentials, DDL or mutations are selected.
begin transaction read only;
select current_database() as database_name, current_user as database_role;
with expected(version) as (values
  ('20260611162942'),
  ('20260611162956'),
  ('20260623160506'),
  ('20260623183933'),
  ('20260626140914'),
  ('20260626144836'),
  ('20260626201620'),
  ('20260626202523'),
  ('20260627091500'),
  ('20260627110000'),
  ('20260628120000'),
  ('20260628130000'),
  ('20260628140000'),
  ('20260628143000'),
  ('20260628150000'),
  ('20260628160000'),
  ('20260630120000'),
  ('20260630154259'),
  ('20260701105726'),
  ('20260701185227'),
  ('20260702130000'),
  ('20260704165600'),
  ('20260705120000'),
  ('20260716120000'),
  ('20260718100000'),
  ('20260718110000'),
  ('20260718111000'),
  ('20260718120000'),
  ('20260718121000'),
  ('20260718122000'),
  ('20260719120000'),
  ('20260719223000'),
  ('20260720100000'),
  ('20260731120000'),
  ('20260801180000'),
  ('20260803120000'),
  ('20260805120000'),
  ('20260816120000'),
  ('20260829120000'),
  ('20260829180000'),
  ('20260830120000'),
  ('20260830130000'),
  ('20260830140000'),
  ('20260831120000'),
  ('20260831160000'),
  ('20260905144848'),
  ('20260905150012'),
  ('20260905155357'),
  ('20260905155426'),
  ('20260905162615'),
  ('20260905163559'),
  ('20260905163900')
)
select expected.version, (actual.version is not null) as applied
from expected left join supabase_migrations.schema_migrations actual using (version)
order by expected.version;

with expected(signature) as (values
 ('public.read_content_admin_summaries(jsonb)'),
 ('public.crm_read_supporters(jsonb,integer,integer,boolean)'),
 ('public.read_published_content_snapshots(jsonb)'),
 ('public.mutate_payment_public_config_with_audit(uuid,text,uuid,integer,jsonb)'),
 ('public.publish_payment_public_config(uuid,integer,uuid,text)')
), objects as (select signature, to_regprocedure(signature)::oid as object_oid from expected)
select signature, object_oid is not null as exists,
 case when object_oid is not null then has_function_privilege('service_role', object_oid, 'EXECUTE') end as service_role_execute
from objects;

with expected(name) as (values
 ('public.payment_public_config'),
 ('public.payment_public_config_publish_requests')
), objects as (select name, to_regclass(name)::oid as object_oid from expected)
select name, object_oid is not null as exists,
 case when object_oid is not null then has_table_privilege('service_role', object_oid, 'SELECT') end as service_role_select,
 (select relrowsecurity from pg_class where oid = object_oid) as rls_enabled
from objects;

select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'payment_public_config'
order by ordinal_position;
rollback;