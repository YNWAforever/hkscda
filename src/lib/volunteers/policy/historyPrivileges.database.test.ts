import { SQL } from "bun";
import { expect, test } from "bun:test";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "56322" ||
    target.pathname !== "/postgres" ||
    target.search ||
    target.hash
  )
    throw Error("Dedicated isolated database required");
}
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "runtime actors cannot truncate history or mutate audit facts",
  async () => {
    const db = new SQL(url!, { max: 1 });
    try {
      for (const table of [
        "audit_log",
        "sponsorship_payment_allocation",
        "sponsorship_payment_proof",
        "volunteer_activity",
        "volunteer_registration",
        "volunteer_profile",
        "volunteer_policy_schedule",
        "volunteer_command_result",
        "volunteer_operation_outbox",
      ]) {
        const row = (
          await db`select has_table_privilege('service_role',${"public." + table},'TRUNCATE') allowed`
        )[0];
        expect(row.allowed).toBe(false);
      }
      const row = (
        await db`select has_table_privilege('service_role','public.audit_log','UPDATE') update_allowed,has_table_privilege('service_role','public.audit_log','DELETE') delete_allowed,has_table_privilege('service_role','public.audit_log','INSERT') insert_allowed,has_table_privilege('service_role','public.audit_log','SELECT') read_allowed`
      )[0];
      expect(row.update_allowed).toBe(false);
      expect(row.delete_allowed).toBe(false);
      expect(row.insert_allowed).toBe(true);
      expect(row.read_allowed).toBe(true);
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "browser roles cannot invoke server-authenticated financial and adoption commands",
  async () => {
    const db = new SQL(url!, { max: 1 });
    const commands = [
      [
        "issue_receipt(uuid,uuid,integer,integer,timestamp with time zone)",
        "issue_receipt(null::uuid,null::uuid,null::integer,null::integer,null::timestamptz)",
      ],
      [
        "cancel_sponsorship_pledge(uuid,uuid,text)",
        "cancel_sponsorship_pledge(null::uuid,null::uuid,null::text)",
      ],
      [
        "change_adoption_case_status(uuid,uuid,uuid,text,timestamp with time zone)",
        "change_adoption_case_status(null::uuid,null::uuid,null::uuid,null::text,null::timestamptz)",
      ],
      [
        "finalize_successful_adoption(uuid,uuid,uuid,text,integer,date,date,uuid)",
        "finalize_successful_adoption(null::uuid,null::uuid,null::uuid,null::text,null::integer,null::date,null::date,null::uuid)",
      ],
    ];
    try {
      for (const [signature, invocation] of commands) {
        const grant = (
          await db`select has_function_privilege('service_role',${"public." + signature},'EXECUTE') allowed`
        )[0];
        expect(grant.allowed).toBe(true);
        for (const role of ["anon", "authenticated"]) {
          let failure: { code?: string; message?: string } | undefined;
          try {
            await db.begin(async (tx) => {
              await tx.unsafe(`set local role ${role}`);
              await tx.unsafe(`select public.${invocation}`);
            });
          } catch (error) {
            failure = error as typeof failure;
          }
          expect(failure).toBeDefined();
          expect(failure?.message).toContain("permission denied for function");
        }
      }
    } finally {
      await db.close();
    }
  },
);
