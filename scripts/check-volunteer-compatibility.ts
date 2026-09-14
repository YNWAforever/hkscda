import { SQL } from "bun";
import {
  assessVolunteerCompatibility,
  requiredVolunteerCapabilities,
} from "../src/lib/volunteers/compatibility/check";
// Explicit release operator input: never discovers a production URL or uses app secrets.
const url = process.env.VOLUNTEER_COMPATIBILITY_DATABASE_URL;
if (!url || process.env.VOLUNTEER_COMPATIBILITY_READ_APPROVED !== "1")
  throw Error(
    "Supply the specifically approved read-only database URL and VOLUNTEER_COMPATIBILITY_READ_APPROVED=1",
  );
const db = new SQL(url, { max: 1 });
try {
  await db.unsafe("begin read only");
  const capabilities = [];
  for (const signature of requiredVolunteerCapabilities) {
    const row = (
      await db`select to_regprocedure(${"public." + signature}) is not null as exists, coalesce(has_function_privilege('service_role',to_regprocedure(${"public." + signature}),'execute'),false) as service,coalesce(has_function_privilege('anon',to_regprocedure(${"public." + signature}),'execute'),false) as anonymous,coalesce(has_function_privilege('authenticated',to_regprocedure(${"public." + signature}),'execute'),false) as authenticated`
    )[0];
    capabilities.push({ signature, ...row });
  }
  const hasLedger = (
    await db`select to_regclass('supabase_migrations.schema_migrations') is not null present`
  )[0].present;
  const migrations = hasLedger
    ? (await db`select version from supabase_migrations.schema_migrations`).map(
        (r: { version: string }) => r.version,
      )
    : [];
  const legacyAliasSafe = (
    await db`select coalesce(position('legacy_activity.id' in pg_get_functiondef(to_regprocedure('public.volunteer_legacy_identity_command(uuid,jsonb)')))>0,false) ok`
  )[0].ok;
  const result = assessVolunteerCompatibility({ capabilities, migrations, legacyAliasSafe });
  await db.unsafe("commit");
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
} finally {
  await db.close();
}
