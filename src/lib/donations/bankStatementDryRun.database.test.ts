import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.BANK_DRY_RUN_TEST_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).port !== "57322" ||
    new URL(url).pathname !== "/postgres")
)
  throw new Error("Dedicated local bank dry-run database required");

test.skipIf(!url || process.env.BANK_DRY_RUN_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "bank dry-run reads current manual finance facts with finance role and no mutation",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback bank dry-run fixture");
    const actor = crypto.randomUUID();
    const admin = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const donations = Array.from({ length: 3 }, () => crypto.randomUUID());
    const payments = Array.from({ length: 3 }, () => crypto.randomUUID());
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(id,auth_user_id,email,role,status) values($1::uuid,$2::uuid,$3,'treasurer','active')",
          [admin, actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.supporter(id,name,email) values($1::uuid,'Synthetic bank donor',$2)",
          [supporter, supporter + "@example.invalid"],
        );
        for (let index = 0; index < payments.length; index++) {
          const amount = (index + 1) * 10_000;
          await tx.unsafe(
            "insert into public.donation(id,supporter_id,amount_cents,purpose,method) values($1::uuid,$2::uuid,$3,'general','fps')",
            [donations[index], supporter, amount],
          );
          await tx.unsafe(
            "insert into public.payment(id,donation_id,provider,provider_ref,amount_cents) values($1::uuid,$2::uuid,'fps',$3,$4)",
            [payments[index], donations[index], `HINT-${index}`, amount],
          );
        }
        await tx.unsafe(
          "update public.payment set status='succeeded',bank_reference='  FPS-OLD  ' where id=$1::uuid",
          [payments[2]],
        );
        const call = (refs: string[], amounts: number[]) =>
          tx.unsafe(
            "select public.preview_manual_bank_matches($1::uuid,$2::text[],$3::integer[]) result",
            [actor, "{" + refs.join(",") + "}", "{" + amounts.join(",") + "}"],
          ) as Promise<
            Array<{
              result: {
                kind: string;
                creditedReferences: string[];
                pendingPayments: Array<{ id: string; amountCents: number }>;
              };
            }>
          >;
        const preview = (await call(["fps-old", "fps-new"], [10_000, 20_000]))[0]!.result;
        expect(preview.kind).toBe("ok");
        expect(preview.creditedReferences).toEqual(["fps-old"]);
        expect(preview.pendingPayments.map((item) => item.id).sort()).toEqual(
          payments.slice(0, 2).sort(),
        );
        expect(preview.pendingPayments.map((item) => item.amountCents).sort()).toEqual([
          10_000, 20_000,
        ]);
        const audit = (await tx.unsafe(
          "select count(*)::int n from public.audit_log where actor_user_id=$1::uuid",
          [actor],
        )) as Array<{ n: number }>;
        expect(audit[0]!.n).toBe(0);
        const grants = (await tx.unsafe(
          "select has_function_privilege('authenticated','public.preview_manual_bank_matches(uuid,text[],integer[])','EXECUTE') auth_allowed, has_function_privilege('service_role','public.preview_manual_bank_matches(uuid,text[],integer[])','EXECUTE') service_allowed",
        )) as Array<{ auth_allowed: boolean; service_allowed: boolean }>;
        expect(grants[0]).toEqual({ auth_allowed: false, service_allowed: true });
        const deny = async (expected: string) => {
          await tx.unsafe("savepoint bank_preview_deny");
          let code: string | undefined;
          try {
            await call(["fps-new"], [10_000]);
          } catch (error) {
            code = (error as { errno?: string }).errno;
          }
          await tx.unsafe("rollback to savepoint bank_preview_deny");
          expect(code).toBe(expected);
        };
        await tx.unsafe("update public.admin_user set role='staff' where auth_user_id=$1::uuid", [
          actor,
        ]);
        await deny("42501");
        await tx.unsafe(
          "update public.admin_user set role='treasurer' where auth_user_id=$1::uuid",
          [actor],
        );
        await tx.unsafe(
          "update auth.users set banned_until=now()+interval '1 hour' where id=$1::uuid",
          [actor],
        );
        await deny("42501");
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
  30_000,
);
