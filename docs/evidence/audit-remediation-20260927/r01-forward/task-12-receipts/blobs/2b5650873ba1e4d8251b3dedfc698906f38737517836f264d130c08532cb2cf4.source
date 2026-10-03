/** Complete readonly synthetic source metadata and aggregate row observations. */
import { SQL } from "bun";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { catalogQuery, hash } from "../../../../supabase/rls-tests/helpers/productionSchemaClone";

const sources = [
  ["template", "postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929"],
  ["modern", "postgresql://postgres:postgres@127.0.0.1:57322/postgres"],
] as const;
export async function protectedCapture(out: string, label: string) {
  const result: Record<string, unknown> = {};
  for (const [name, url] of sources) {
    const db = new SQL(url, { max: 1 });
    let index = 0;
    const query = async (text: string) => {
      const stem = label + "-" + name + "-" + index++;
      await writeFile(resolve(out, stem + ".sql.source"), text, { flag: "wx" });
      const rows = await db.unsafe(text);
      await writeFile(resolve(out, stem + ".json"), JSON.stringify(rows, null, 2) + "\n", { flag: "wx" });
      return rows;
    };
    try {
      await query("begin read only;set local statement_timeout='30s'");
      const catalog = (await query(catalogQuery))[0].catalog;
      const managed = (await query(catalogQuery.replaceAll("('public','private')", "('auth','storage')")))[0].catalog;
      const tables = await query("select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and c.relkind in ('r','p','m') order by 1,2");
      const rows = [];
      for (const t of tables) {
        const identifier = (v: string) => '"' + v.replaceAll('"', '""') + '"';
        const r = (await query("select count(*)::text count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) hash from " + identifier(t.nspname) + "." + identifier(t.relname) + " t"))[0];
        rows.push({ schema: t.nspname, table: t.relname, ...r });
      }
      const sequences = await query("select schemaname,sequencename,sequenceowner,data_type::text,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value from pg_sequences where schemaname !~ '^pg_' order by 1,2");
      await query("rollback");
      result[name] = { catalog, managed, rows, sequences };
    } finally { await db.close(); }
  }
  await writeFile(resolve(out, label + ".json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  return result;
}
export async function protectedState(out: string, label: string) {
  const value = await protectedCapture(out, label);
  return JSON.stringify({ snapshot: value, hash: hash(value) });
}
