import { expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";

const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
const allowed =
  process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1" &&
  url !== undefined &&
  url !== "" &&
  new URL(url).hostname === "127.0.0.1" &&
  new URL(url).port === "56322";

type PlanNode = {
  "Node Type": string;
  "Actual Rows": number;
  "Actual Loops": number;
  "Join Type"?: string;
  Output?: string[];
  Plans?: PlanNode[];
};
function nodes(plan: PlanNode): PlanNode[] {
  return [plan, ...(plan.Plans ?? []).flatMap(nodes)];
}

test.skipIf(!allowed)(
  "task support limits both hydration join outputs to 500 eligible rows and retains UTF-8 fields",
  async () => {
    const db = new SQL(url!, { max: 1 });
    const rollback = new Error("owned task hydration rollback");
    try {
      await db.begin(async (tx) => {
        const actor = randomUUID(),
          activity = randomUUID(),
          registration = randomUUID(),
          prefix = `HYDRATION-${randomUUID()}`;
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
        await tx`insert into public.volunteer_activity(id,type,title,starts_at,location,capacity,status)
          values(${activity}::uuid,'volunteer_shift',${prefix},'2000-01-01','Synthetic',10,'draft')`;
        await tx`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at)
          values(${registration}::uuid,${activity}::uuid,'individual','approved',1,'Synthetic UTF-8 義工','synthetic@example.invalid','00000000',${randomUUID()},now()+interval '1 day')`;
        await tx`insert into public.volunteer_operation_outbox(dedup_key,kind,payload,created_at)
          select ${prefix}||':'||n,'volunteer_policy_contact',
            jsonb_build_object('registration_id',${registration}::text,'ordinal',n,'notes',repeat('完整🧪',64)),
            '2099-01-01'::timestamptz+n*interval '1 second'
          from generate_series(1,700) n`;
        const newest = (
          await tx`select id from public.volunteer_operation_outbox where dedup_key=${prefix + ":700"}`
        )[0].id;
        await tx`insert into public.volunteer_task_completion(outbox_id,actor_user_id,reason) values(${newest}::uuid,${actor}::uuid,'Synthetic completed exclusion')`;
        const command = JSON.stringify({ action: "list", include_pending: false });
        const snapshot = (
          await tx`select public.volunteer_task_command(${actor}::uuid,${command}::text::jsonb) snapshot`
        )[0].snapshot;
        expect(snapshot.tasks).toHaveLength(500);
        expect(snapshot.pending).toEqual([]);
        for (const [index, row] of snapshot.tasks.entries()) {
          expect(row.payload.ordinal).toBe(699 - index);
          expect(row.payload.notes).toBe("完整🧪".repeat(64));
          expect(row.registration_id).toBe(registration);
          expect(row.contact_name).toBe("Synthetic UTF-8 義工");
          expect(row.activity_id).toBe(activity);
          expect(row.title).toBe(prefix);
        }
        // Inspect actual work on the deployed function's read expression, not migration text.
        const definition = (
          await tx`select pg_get_functiondef('public.volunteer_task_command(uuid,jsonb)'::regprocedure) definition`
        )[0].definition as string;
        const expression = definition.match(/return (jsonb_build_object[\s\S]+?);\s*\n elsif/)?.[1];
        expect(expression).toBeDefined();
        const plan = await tx.unsafe(
          "explain (analyze,verbose,format json) select " +
            expression!.replaceAll("p_command", "$1::text::jsonb"),
          [command],
        );
        const root = plan[0]["QUERY PLAN"][0].Plan as PlanNode;
        const hydration = nodes(root).filter(
          (node) =>
            node["Join Type"] !== undefined &&
            node.Output?.some((column) => column === "a.title" || column === "r.contact_name"),
        );
        expect(hydration.length).toBeGreaterThanOrEqual(2);
        for (const join of hydration)
          expect(join["Actual Rows"] * join["Actual Loops"]).toBeLessThanOrEqual(500);
        await tx`update public.admin_user set role='admin' where auth_user_id=${actor}::uuid`;
        const admin = (
          await tx`select public.volunteer_task_command(${actor}::uuid,${command}::text::jsonb) snapshot`
        )[0].snapshot;
        expect(admin.tasks).toEqual(snapshot.tasks);
        expect(admin.notifications).toEqual(snapshot.notifications);
        for (const role of ["staff", "admin"]) {
          await tx`update public.admin_user set role=${role},status='disabled' where auth_user_id=${actor}::uuid`;
          let denied = false;
          await tx
            .savepoint(async (sp) => {
              try {
                await sp`select public.volunteer_task_command(${actor}::uuid,${command}::text::jsonb)`;
              } catch (error) {
                denied = error instanceof Error && error.message.includes("volunteer_forbidden");
                throw rollback;
              }
            })
            .catch((error: unknown) => {
              if (error !== rollback) throw error;
            });
          expect(denied).toBe(true);
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);
