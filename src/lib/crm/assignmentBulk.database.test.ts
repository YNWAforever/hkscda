import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.CRM_ASSIGNMENT_BULK_TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "57322" ||
    parsed.pathname !== "/postgres"
  ) {
    throw new Error("CRM assignment bulk test requires the named loopback database");
  }
}
const enabled =
  Boolean(databaseUrl) && process.env.CRM_ASSIGNMENT_BULK_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)("CRM assignment bulk schema and guarded RPCs are installed", async () => {
  const db = new SQL(databaseUrl!, { max: 1, prepare: false });
  try {
    const [row] = await db`select
      to_regprocedure('public.create_crm_assignment_bulk_preview(uuid,uuid[],uuid,text)') as preview,
      to_regprocedure('public.get_crm_assignment_bulk_operation(uuid,uuid)') as read,
      to_regprocedure('public.apply_crm_assignment_bulk_item(uuid,uuid,uuid)') as apply,
      to_regprocedure('public.list_crm_assignment_assignees(uuid)') as assignees,
      to_regclass('public.crm_assignment_bulk_operation') as operation_table,
      to_regclass('public.crm_assignment_bulk_item') as item_table,
      exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='supporter' and column_name='crm_assignee_user_id') as assignee_column`;
    expect(Object.values(row).every(Boolean)).toBe(true);
  } finally {
    await db.close();
  }
});
