import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.SUPPORTER_PORTAL_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  const target =
    ((url.port === "57322" || url.port === "55322") && url.pathname === "/postgres") ||
    (url.port === "52322" && url.pathname === "/audit_pr135_20260929");
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    !target ||
    url.search ||
    url.hash
  )
    throw new Error("Supporter portal DB test requires the dedicated loopback DB");
}
const enabled =
  Boolean(databaseUrl) && process.env.SUPPORTER_PORTAL_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)("verified marketing preference and audit commit atomically", async () => {
  const db = new SQL(databaseUrl!, { max: 1, prepare: false });
  const rollback = new Error("rollback supporter portal fixture");
  const actor = crypto.randomUUID();
  const supporter = crypto.randomUUID();
  const email = "portal-" + actor + "@example.invalid";
  try {
    await db.begin(async (tx) => {
      await tx.unsafe(
        "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
        [actor, email],
      );
      await tx.unsafe(
        "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic supporter',$2)",
        [supporter, email],
      );
      await tx.unsafe("set local role service_role");
      const first = (await tx.unsafe(
        "select public.set_supporter_marketing_email($1::uuid,$2,$3) result",
        [actor, email, "opt_in"],
      )) as Array<{ result: { status: string; changed: boolean } }>;
      expect(first[0]?.result).toEqual({ status: "opt_in", changed: true });
      const repeat = (await tx.unsafe(
        "select public.set_supporter_marketing_email($1::uuid,$2,$3) result",
        [actor, email, "opt_in"],
      )) as Array<{ result: { changed: boolean } }>;
      expect(repeat[0]?.result.changed).toBe(false);
      const second = (await tx.unsafe(
        "select public.set_supporter_marketing_email($1::uuid,$2,$3) result",
        [actor, email, "opt_out"],
      )) as Array<{ result: { status: string; changed: boolean } }>;
      expect(second[0]?.result).toEqual({ status: "opt_out", changed: true });
      const counts = (await tx.unsafe(
        "select (select count(*)::int from public.consent where supporter_id=$1::uuid and source='supporter_portal_verified_email') consents,(select count(*)::int from public.audit_log where actor_user_id=$2::uuid and action='consent.supporter_portal_set_email') audits",
        [supporter, actor],
      )) as Array<{ consents: number; audits: number }>;
      expect(counts[0]).toEqual({ consents: 2, audits: 2 });
      const grants = (await tx.unsafe(
        "select has_function_privilege('anon','public.set_supporter_marketing_email(uuid,text,text)','EXECUTE') anon, has_function_privilege('authenticated','public.set_supporter_marketing_email(uuid,text,text)','EXECUTE') authenticated, has_function_privilege('service_role','public.set_supporter_marketing_email(uuid,text,text)','EXECUTE') service",
      )) as Array<{ anon: boolean; authenticated: boolean; service: boolean }>;
      expect(grants[0]).toEqual({ anon: false, authenticated: false, service: true });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await db.close();
  }
});

test.skipIf(!enabled)(
  "marketing preference rejects wrong, unconfirmed and banned identity",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    try {
      for (const kind of ["wrong", "unconfirmed", "banned"] as const) {
        const actor = crypto.randomUUID();
        const supporter = crypto.randomUUID();
        const email = "portal-denied-" + actor + "@example.invalid";
        await expect(
          db.begin(async (tx) => {
            await tx.unsafe(
              "insert into auth.users(id,email,email_confirmed_at,banned_until,created_at,updated_at) values($1::uuid,$2,case when $3::boolean then null else now() end,case when $4::boolean then now()+interval '1 day' else null end,now(),now())",
              [actor, email, kind === "unconfirmed", kind === "banned"],
            );
            await tx.unsafe(
              "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic supporter',$2)",
              [supporter, email],
            );
            await tx.unsafe("set local role service_role");
            await tx.unsafe("select public.set_supporter_marketing_email($1::uuid,$2,$3)", [
              actor,
              kind === "wrong" ? "other@example.invalid" : email,
              "opt_in",
            ]);
          }),
        ).rejects.toMatchObject({ errno: "42501" });
      }
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!enabled)(
  "anonymous roles cannot call preference RPC and audit failure rolls back consent",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback atomic failure fixture");
    const actor = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const email = "portal-atomic-" + actor + "@example.invalid";
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, email],
        );
        await tx.unsafe(
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic supporter',$2)",
          [supporter, email],
        );
        for (const role of ["anon", "authenticated"]) {
          await tx.unsafe("savepoint denied_role");
          await tx.unsafe("set local role " + role);
          try {
            await tx.unsafe("select public.set_supporter_marketing_email($1::uuid,$2,'opt_in')", [
              actor,
              email,
            ]);
            throw new Error("unexpected grant");
          } catch (error) {
            expect(error).toMatchObject({ errno: "42501" });
          }
          await tx.unsafe("rollback to savepoint denied_role");
        }
        await tx.unsafe(
          "alter table public.audit_log add constraint portal_test_audit_rejection check(action <> 'consent.supporter_portal_set_email') not valid",
        );
        await tx.unsafe("savepoint audit_failure");
        await tx.unsafe("set local role service_role");
        try {
          await tx.unsafe("select public.set_supporter_marketing_email($1::uuid,$2,'opt_in')", [
            actor,
            email,
          ]);
          throw new Error("unexpected audit success");
        } catch (error) {
          expect(error).toMatchObject({ errno: "23514" });
        }
        await tx.unsafe("rollback to savepoint audit_failure");
        const counts = await tx.unsafe(
          "select count(*)::int n from public.consent where supporter_id=$1::uuid",
          [supporter],
        );
        expect(counts[0].n).toBe(0);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!enabled)(
  "concurrent identical preferences create only one consent and audit",
  async () => {
    const db = new SQL(databaseUrl!, { max: 3, prepare: false });
    const actor = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const email = "portal-race-" + actor + "@example.invalid";
    try {
      await db.unsafe(
        "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
        [actor, email],
      );
      await db.unsafe(
        "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic supporter',$2)",
        [supporter, email],
      );
      const call = () =>
        db.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          const rows = await tx.unsafe(
            "select public.set_supporter_marketing_email($1::uuid,$2,'opt_in') result",
            [actor, email],
          );
          return rows[0].result.changed as boolean;
        });
      expect((await Promise.all([call(), call()])).sort()).toEqual([false, true]);
      const rows = await db.unsafe(
        "select (select count(*)::int from public.consent where supporter_id=$1::uuid) consents,(select count(*)::int from public.audit_log where actor_user_id=$2::uuid) audits",
        [supporter, actor],
      );
      expect(rows[0]).toEqual({ consents: 1, audits: 1 });
    } finally {
      await db.unsafe("delete from public.audit_log where actor_user_id=$1::uuid", [actor]);
      await db.unsafe("delete from public.consent where supporter_id=$1::uuid", [supporter]);
      await db.unsafe("delete from public.supporter where id=$1::uuid", [supporter]);
      await db.unsafe("delete from auth.users where id=$1::uuid", [actor]);
      await db.close();
    }
  },
);
