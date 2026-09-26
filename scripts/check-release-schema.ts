import { SQL } from "bun";
import { checkReleaseSchema, type CatalogSnapshot } from "../src/lib/operations/releaseSchema";
import { releaseManifest } from "../src/lib/operations/releaseManifest";

type TableRow = {
  schema: string;
  name: string;
  rls: boolean;
  columns: Record<string, string>;
  service_select: boolean;
  service_insert: boolean;
  service_update: boolean;
  service_delete: boolean;
};
type FunctionRow = {
  schema: string;
  name: string;
  arguments: string;
  returns: string;
  service_execute: boolean;
};

async function main(): Promise<void> {
  const url = process.env.CHECK_RELEASE_SCHEMA_DATABASE_URL;
  if (!url) throw new Error("CHECK_RELEASE_SCHEMA_DATABASE_URL is required");
  if (!/^postgres(?:ql)?:\/\//.test(url)) throw new Error("A PostgreSQL URL is required");
  const sql = new SQL(url);
  try {
    const tables = (await sql`
      select n.nspname as schema, c.relname as name, c.relrowsecurity as rls,
        coalesce((select jsonb_object_agg(a.attname, format_type(a.atttypid, a.atttypmod))
          from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '{}'::jsonb) as columns,
        has_table_privilege('service_role', c.oid, 'SELECT') as service_select,
        has_table_privilege('service_role', c.oid, 'INSERT') as service_insert,
        has_table_privilege('service_role', c.oid, 'UPDATE') as service_update,
        has_table_privilege('service_role', c.oid, 'DELETE') as service_delete
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
    `) as TableRow[];
    const functions = (await sql`
      select n.nspname as schema, p.proname as name,
        pg_get_function_identity_arguments(p.oid) as arguments,
        pg_get_function_result(p.oid) as returns,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    `) as FunctionRow[];
    const versions = (await sql`select version from supabase_migrations.schema_migrations`) as {
      version: string;
    }[];
    const snapshot: CatalogSnapshot = {
      tables: tables.map((table) => ({
        schema: table.schema,
        name: table.name,
        rls: table.rls,
        columns: table.columns,
        grants: {
          service_role: [
            table.service_select && "SELECT",
            table.service_insert && "INSERT",
            table.service_update && "UPDATE",
            table.service_delete && "DELETE",
          ].filter((grant): grant is string => Boolean(grant)),
        },
      })),
      functions: functions.map((fn) => ({
        schema: fn.schema,
        name: fn.name,
        arguments: fn.arguments,
        returns: fn.returns,
        executeRoles: fn.service_execute ? ["service_role"] : [],
      })),
      migrationVersions: versions.map((row) => row.version),
    };
    const report = await checkReleaseSchema({ load: async () => snapshot }, releaseManifest);
    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          latestMigration: versions.at(-1)?.version ?? null,
          requirements: releaseManifest.length,
          ...report,
        },
        null,
        2,
      ),
    );
    if (report.state === "incompatible") process.exitCode = 1;
  } finally {
    await sql.close();
  }
}

await main();
