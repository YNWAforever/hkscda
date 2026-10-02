/** Task9 complete known catalog profiles and unchanged full write-scope scanner. */
export const tables = [
  "admin_user",
  "audit_log",
  "coordinator_status",
  "supporter",
  "supporter_role",
  "adopter_profile",
  "adoption_case",
  "adoption_followup",
  "animal_match",
  "animals",
];
export const fixtureScope = ["auth.users", ...tables, "animal"];
export const dependencies = [
  [
    "20261001134252_r01_adoption_upload_forward.sql",
    "ca4879d9c93d413941ccc5a13c17d4eba1f70b293169665583e4b23973d1a5f3",
  ],
  [
    "20261001154743_r01_animal_preference_record_fields.sql",
    "28a93d8679a222f89d193af055285c24e86df06f227a7c527df26829957e9867",
  ],
  [
    "20261001150925_r01_sponsorship_submission_forward.sql",
    "ca11bb5f0ce73523c7f5734e4d032307665c2357f0fecaf15f8fc593394f857c",
  ],
  [
    "20261001175310_r01_internship_upload_forward.sql",
    "e64124a1a1d0609b77dae4f41ff82d9166fd857f5d22a6934d761af8f80d4f41",
  ],
  [
    "20261001193722_r01_animal_draft_archive_forward.sql",
    "2e63db57af4071932da88d7fee29d66b0f8c5fb37e7a29428380b872450fe4ca",
  ],
  [
    "20261001213914_r01_crm_atomic_forward.sql",
    "2b1282a33bd5f6aa67c42af56ee45404fd97ff21e75ea9f3228b4c49d7a4cdd0",
  ],
  [
    "20261002011249_r01_cms_atomic_forward.sql",
    "a98d17d3c28ed5b24ef3e681cf7b71d623cc6c35856be767799b428eb0fcd901",
  ],
] as const;
const tableList = tables.map((n) => "'public." + n + "'::regclass").join(",");
export const functionsQuery = `select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_function_arguments(p.oid) allargs,p.pronargdefaults defaults,pg_get_expr(p.proargdefaults,0) default_expression,pg_get_function_result(p.oid) result,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,p.proconfig config,p.prosecdef definer,p.procost cost,p.proisstrict strict,p.proparallel parallel,p.provolatile volatility,md5(p.prosrc) body,md5(pg_get_functiondef(p.oid)) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid in (select t.tgfoid from pg_trigger t where t.tgrelid in (${tableList}) and not t.tgisinternal) or (n.nspname='private' and p.proname='create_manual_adoption_case') or (n.nspname='private' and p.proname='normalize_public_animal_age') or (n.nspname='auth' and p.proname='uid') or (n.nspname='public' and p.proname in('mutate_adoption_coordinator_with_audit','search_manual_case_identity','create_manual_adoption_case')) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`;
export const authQuery = `select jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'serviceSelect',has_table_privilege('service_role',c.oid,'SELECT'),'serviceUpdate',has_table_privilege('service_role',c.oid,'UPDATE'),'serviceColumnSelect',has_any_column_privilege('service_role',c.oid,'SELECT'),'serviceColumnUpdate',has_any_column_privilege('service_role',c.oid,'UPDATE'),'postgresSelect',has_table_privilege('postgres',c.oid,'SELECT'),'postgresUpdate',has_table_privilege('postgres',c.oid,'UPDATE'),'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl::text,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)) value from pg_class c where c.oid='auth.users'::regclass`;
export const indexDetailsQuery = `select coalesce(jsonb_agg(jsonb_build_object('table',i.indrelid::regclass::text,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'persistence',c.relpersistence,'options',c.reloptions,'access',am.amname,'definition',pg_get_indexdef(i.indexrelid),'nkeys',i.indnkeyatts,'natts',i.indnatts,'unique',i.indisunique,'nullsNotDistinct',i.indnullsnotdistinct,'primary',i.indisprimary,'exclusion',i.indisexclusion,'immediate',i.indimmediate,'clustered',i.indisclustered,'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,'replicaIdentity',i.indisreplident,'keys',i.indkey::text,'flags',i.indoption::text,'predicate',pg_get_expr(i.indpred,i.indrelid),'expressions',pg_get_expr(i.indexprs,i.indrelid)) order by i.indrelid::regclass::text,c.relname),'[]'::jsonb) value from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am am on am.oid=c.relam where i.indrelid in (${tableList})`;
export const nativeQuery = `select coalesce(jsonb_agg(jsonb_build_object('constraint',c.conname,'own',c.conrelid::regclass::text,'referenced',c.confrelid::regclass::text,'type',t.tgtype,'function',t.tgfoid::regprocedure::text,'table',t.tgrelid::regclass::text,'other',t.tgconstrrelid::regclass::text,'index',t.tgconstrindid::regclass::text,'enabled',t.tgenabled,'internal',t.tgisinternal,'parent',t.tgparentid,'deferrable',t.tgdeferrable,'deferred',t.tginitdeferred,'nargs',t.tgnargs,'attr',t.tgattr::text,'args',encode(t.tgargs,'hex'),'qual',pg_get_expr(t.tgqual,t.tgrelid),'oldtable',t.tgoldtable,'newtable',t.tgnewtable,'dependencies',(select jsonb_agg(jsonb_build_object('class',d.classid::regclass::text,'subid',d.objsubid,'refclass',d.refclassid::regclass::text,'refconstraint',case when d.refclassid='pg_constraint'::regclass then (select q.conname from pg_constraint q where q.oid=d.refobjid) end,'sameconstraint',d.refobjid=c.oid,'refsubid',d.refobjsubid,'deptype',d.deptype) order by d.classid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) from pg_depend d where d.classid='pg_trigger'::regclass and d.objid=t.oid)) order by c.conrelid::regclass::text,c.conname,t.tgtype,t.tgrelid::regclass::text),'[]'::jsonb) value from pg_constraint c join pg_trigger t on t.tgconstraint=c.oid where (c.conrelid in (${tableList}) or c.confrelid in (${tableList})) and c.contype='f'`;
