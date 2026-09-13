import { SQL } from "bun";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const c = JSON.parse(readFileSync(".local-policy-test/local-credentials.json", "utf8")),
  u = new URL(c.DB_URL);
if (
  u.hostname !== "127.0.0.1" ||
  u.port !== "56322" ||
  u.pathname !== "/postgres" ||
  u.search ||
  u.hash
)
  throw Error("Dedicated isolated database required");
const db = new SQL(c.DB_URL, { max: 1 });
try {
  const ledger = (
    await db`select count(*)::int count,min(version) first,max(version) last from supabase_migrations.schema_migrations`
  )[0];
  assert.equal(ledger.count, 101);
  const functions =
    await db`select p.proname name,p.oid::regprocedure::text signature,pg_get_function_result(p.oid) result,p.prosecdef security_definer,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,md5(pg_get_functiondef(p.oid)) definition_md5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.prorettype<>'trigger'::regtype order by p.proname,p.oid::regprocedure::text`;
  assert.equal(functions.filter((f) => f.name === "claim_sponsorship_deliveries").length, 1);
  assert.equal(
    functions.find((f) => f.name === "claim_sponsorship_deliveries")?.signature,
    "claim_sponsorship_deliveries(uuid,integer,uuid)",
  );
  for (const f of functions) {
    assert.equal(f.anon_execute, false, f.signature);
    assert.equal(f.authenticated_execute, false, f.signature);
    if (
      [
        "issue_receipt",
        "cancel_sponsorship_pledge",
        "change_adoption_case_status",
        "finalize_successful_adoption",
      ].includes(f.name)
    )
      assert.equal(f.service_execute, true, f.signature);
  }
  const grants =
    await db`select name,has_table_privilege('service_role','public.'||name,'TRUNCATE') service_truncate,has_table_privilege('service_role','public.'||name,'UPDATE') service_update,has_table_privilege('service_role','public.'||name,'DELETE') service_delete from unnest(array['audit_log','sponsorship_payment_allocation','volunteer_registration','volunteer_attendance_event','volunteer_policy_version','volunteer_profile_event','volunteer_tier_candidate']) name`;
  for (const row of grants) assert.equal(row.service_truncate, false, row.name);
  const audit = grants.find((x) => x.name === "audit_log");
  assert.equal(audit?.service_update, false);
  assert.equal(audit?.service_delete, false);
  const animal = (
    await db`select has_table_privilege('authenticated','public.animals','INSERT') authenticated_insert,has_table_privilege('authenticated','public.animals','UPDATE') authenticated_update,has_table_privilege('authenticated','public.animals','DELETE') authenticated_delete,has_column_privilege('anon','public.animals','notes','SELECT') anonymous_notes,has_column_privilege('authenticated','public.animals','notes','SELECT') authenticated_notes,has_column_privilege('anon','public.animals','gallery','SELECT') anonymous_gallery`
  )[0];
  for (const key of [
    "authenticated_insert",
    "authenticated_update",
    "authenticated_delete",
    "anonymous_notes",
    "authenticated_notes",
  ])
    assert.equal(animal[key], false);
  assert.equal(animal.anonymous_gallery, true);
  const rls =
    await db`select c.relname table_name,c.relrowsecurity enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('volunteer_policy_version','volunteer_profile','volunteer_terms_acceptance','volunteer_operation_outbox','volunteer_policy_source_version','volunteer_task_completion','sponsorship_refund','sponsorship_delivery_outbox','mail_delivery_event') order by c.relname`;
  for (const row of rls) assert.equal(row.enabled, true);
  const deliveryViews =
    await db`select name,has_table_privilege('anon','public.'||name,'SELECT') anon_select,has_table_privilege('authenticated','public.'||name,'SELECT') authenticated_select,has_table_privilege('service_role','public.'||name,'SELECT') service_select from unnest(array['mail_delivery_latest','sponsorship_delivery_status','message_delivery_status']) name`;
  for (const view of deliveryViews) {
    assert.equal(view.anon_select, false, view.name);
    assert.equal(view.authenticated_select, false, view.name);
    assert.equal(view.service_select, true, view.name);
  }
  writeFileSync(
    "docs/evidence/admin-volunteer-settings/six-phase-schema-verification.json",
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        target: "127.0.0.1:56322/postgres",
        read_only: true,
        ledger,
        functions,
        grants,
        deliveryViews,
        animal,
        rls,
        result: "passed",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      ledger,
      functions_checked: functions.length,
      table_grants_checked: grants.length,
      rls_tables_checked: rls.length,
      result: "passed",
    }),
  );
} finally {
  await db.close();
}
