import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.CRM_ASSIGNMENT_BULK_TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  const localTarget =
    (parsed.port === "57322" && parsed.pathname === "/postgres") ||
    (parsed.port === "52322" && parsed.pathname === "/audit_pr135_20260929");
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== "127.0.0.1" ||
    !localTarget ||
    parsed.search ||
    parsed.hash
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

test.skipIf(!enabled)(
  "direct browser assignment cannot bypass the guarded RPC or eligible assignee",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback direct assignment regression");
    try {
      await db.begin(async (tx) => {
        const staff = crypto.randomUUID(),
          suspended = crypto.randomUUID(),
          supporter = crypto.randomUUID();
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${staff},${staff + "@example.invalid"},now()),(${suspended},${suspended + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${staff},${staff + "@example.invalid"},'staff','active'),(${suspended},${suspended + "@example.invalid"},'admin','disabled')`;
        await tx`insert into public.supporter(id,name,email) values(${supporter},'Synthetic',${supporter + "@example.invalid"})`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: staff, role: "authenticated" })},true)`;
        for (const role of ["staff", "treasurer", "admin"]) {
          await tx`update public.admin_user set role=${role} where auth_user_id=${staff}`;
          for (const action of ["update", "insert"]) {
            await tx.unsafe("savepoint denied_write");
            await tx.unsafe("set local role authenticated");
            let code = "";
            try {
              if (action === "update")
                await tx`update public.supporter set crm_assignee_user_id=${suspended}::uuid where id=${supporter}::uuid`;
              else
                await tx`insert into public.supporter(id,name,email,crm_assignee_user_id) values(${crypto.randomUUID()},'Unauthorized','unauthorized@example.invalid',${suspended})`;
            } catch (error) {
              code = (error as { errno?: string }).errno ?? "";
            }
            await tx.unsafe("rollback to savepoint denied_write");
            expect(code).toBe("42501");
          }
        }
        await tx.unsafe("set local role authenticated");
        await tx`update public.supporter set name='Permitted existing field' where id=${supporter}::uuid`;
        await tx.unsafe("reset role");
        const [row] =
          await tx`select name,crm_assignee_user_id from public.supporter where id=${supporter}::uuid`;
        expect(row.name).toBe("Permitted existing field");
        expect(row.crm_assignee_user_id).toBeNull();
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);
