import { SQL } from "bun";
import { assertCloneUrl, type createProductionClone } from "./productionSchemaClone";

type OwnedClone = Awaited<ReturnType<typeof createProductionClone>>;
const url = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const counts: Record<string, string> = {
  assets: "2",
  slots: "2",
  knowledge: "4",
  annual: "0",
  audit: "0",
};
const tables = [
  "public.document_assets",
  "public.site_document_slots",
  "public.knowledge_posts",
  "public.annual_reports",
  "public.audit_log",
  "auth.users",
] as const;

/** Nominal CI-only test handle. It is never an OwnedClone or a production target.
 * No queries run at import time. The original clone factory/URL guard is intact.
 */
export class DocumentCiTestTarget {
  private constructor(
    readonly sql: SQL,
    readonly url: string,
    readonly name: string,
  ) {}
  static async open() {
    if (
      process.env.R01_DOCUMENT_PUBLICATION_ALLOW_LOCAL_FIXTURES !== "1" ||
      process.env.R01_DOCUMENT_PUBLICATION_TEST_DATABASE_URL !== url
    )
      throw Error("Explicit isolated document CI fixture pair required");
    const target = new DocumentCiTestTarget(new SQL(url, { max: 1 }), url, "postgres");
    try {
      await assertDocumentTestTarget(target);
      return target;
    } catch (e) {
      await target.sql.close();
      throw e;
    }
  }
  async seedSnapshot() {
    await assertDocumentTestTarget(this);
    const result: Record<string, string> = {};
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i],
        expected = i < 5 ? Object.values(counts)[i] : "0";
      const rows = await this.sql.unsafe("select count(*)::text count from " + table);
      if (rows.length !== 1 || rows[0].count !== expected)
        throw Error("Committed CI seed count mismatch: " + table);
      // Auth/audit are queried only after their exact zero count has been checked.
      const values = await this.sql
        .unsafe(`select coalesce(json_agg(raw order by raw collate "C"),'[]'::json)::text raw
        from (select row_to_json(t)::text raw from ${table} t) q`);
      if (values.length !== 1 || typeof values[0].raw !== "string")
        throw Error("Original server row snapshot missing");
      result[table] = values[0].raw;
    }
    return result;
  }
  close() {
    return this.sql.close();
  }
}

export type DocumentTestTarget = OwnedClone | DocumentCiTestTarget;
export function documentTestActor(target: DocumentTestTarget) {
  return target instanceof DocumentCiTestTarget ? "postgres" : "supabase_admin";
}
export async function assertDocumentTestTarget(target: DocumentTestTarget) {
  if (!(target instanceof DocumentCiTestTarget)) {
    assertCloneUrl(target.url);
    return;
  }
  if (
    target.url !== url ||
    target.name !== "postgres" ||
    process.env.R01_DOCUMENT_PUBLICATION_ALLOW_LOCAL_FIXTURES !== "1" ||
    process.env.R01_DOCUMENT_PUBLICATION_TEST_DATABASE_URL !== url
  )
    throw Error("CI fixture target changed");
  const rows =
    await target.sql`select current_user actor,session_user session,current_database() database,
    current_setting('server_version_num') version`;
  if (
    rows.length !== 1 ||
    rows[0].actor !== "postgres" ||
    rows[0].session !== "postgres" ||
    rows[0].database !== "postgres" ||
    rows[0].version !== "170011"
  )
    throw Error("Measured native170011 CI actor/database/server context required");
}
export function documentFixtureCountsEqual(
  target: DocumentTestTarget,
  value: Record<string, unknown>,
) {
  if (!(target instanceof DocumentCiTestTarget))
    return Object.values(value).every((v) => v === "0");
  return Object.entries(value).every(([key, v]) => Object.hasOwn(counts, key) && v === counts[key]);
}
