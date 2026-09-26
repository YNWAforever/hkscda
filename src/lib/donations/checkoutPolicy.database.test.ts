import { describe, expect, test } from "bun:test";
import { SQL } from "bun";

const url = process.env.CHECKOUT_POLICY_TEST_DATABASE_URL;
if (url && !/^postgresql:\/\/postgres:postgres@127\.0\.0\.1:57322\/postgres$/.test(url)) {
  throw new Error("Checkout policy DB tests require the dedicated loopback rehearsal database");
}

async function expectSqlState(operation: Promise<unknown>, code: string) {
  try {
    await operation;
    throw new Error(`Expected SQLSTATE ${code}`);
  } catch (error) {
    expect((error as { errno?: string }).errno).toBe(code);
  }
}

describe.skipIf(!url)("checkout admission isolated database", () => {
  test("fails closed, serializes approved versions, preserves admitted retries, and denies public roles", async () => {
    const db = new SQL(url!, { max: 2, prepare: false });
    const actorId = crypto.randomUUID();
    const actorAuthId = crypto.randomUUID();
    const key = crypto.randomUUID();
    const secondKey = crypto.randomUUID();
    const fingerprint = "a".repeat(64);
    let configId: string | undefined;
    let configVersion: number | undefined;
    try {
      const [config] =
        await db`select id, version from public.payment_public_config where method = 'stripe' and state = 'published' limit 1`;
      expect(config).toBeDefined();
      configId = config.id as string;
      configVersion = config.version as number;
      await db`insert into public.admin_user (id,auth_user_id,email,role,status)
        values (${actorId},${actorAuthId},${`checkout-${actorId}@example.test`},'treasurer','active')`;
      await db`update public.checkout_policy set enabled = false where singleton = true`;
      const admit = (intentKey: string, fp = fingerprint, version = configVersion!) =>
        db`select public.admit_new_checkout(${intentKey}::uuid,${fp},'stripe','donation',${version}) as admission`;

      await expectSqlState(admit(key), "P5101");
      const [zero] =
        await db`select count(*)::int as total from public.checkout_admission where idempotency_key = ${key}::uuid`;
      expect(zero.total).toBe(0);

      const [policyBefore] =
        await db`select version from public.checkout_policy where singleton = true`;
      await db`select public.set_checkout_policy_with_audit(${actorAuthId}::uuid,${policyBefore.version},true)`;
      await expectSqlState(admit(key), "P5102");
      await expectSqlState(
        db`select public.set_checkout_method_approval_with_audit(
        ${actorAuthId}::uuid,'stripe','donation',${configId}::uuid,${configVersion},false)`,
        "23514",
      );
      await db`update public.payment_public_config set published_by = ${actorId}::uuid where id = ${configId}::uuid`;
      await db`select public.set_checkout_method_approval_with_audit(
        ${actorAuthId}::uuid,'stripe','donation',${configId}::uuid,${configVersion},false)`;
      await expectSqlState(admit(key), "P5102");
      await db`select public.set_checkout_method_approval_with_audit(
        ${actorAuthId}::uuid,'stripe','donation',${configId}::uuid,${configVersion},true)`;
      await expectSqlState(admit(key, fingerprint, configVersion! + 1), "P5103");
      await db`update public.payment_public_config set is_publicly_visible = false where id = ${configId}::uuid`;
      await expectSqlState(admit(key), "P5102");
      await db`update public.payment_public_config set is_publicly_visible = true where id = ${configId}::uuid`;
      for (const state of ["draft", "archived"]) {
        await db`update public.payment_public_config set state = ${state} where id = ${configId}::uuid`;
        await expectSqlState(admit(key), "P5102");
      }
      await db`update public.payment_public_config set state = 'published' where id = ${configId}::uuid`;

      const [readyConfig] =
        await db`select state, is_publicly_visible, published_by, version from public.payment_public_config where id = ${configId}::uuid`;
      expect(readyConfig).toMatchObject({
        state: "published",
        is_publicly_visible: true,
        published_by: actorId,
        version: configVersion,
      });
      const [readyApproval] =
        await db`select enabled, config_version from public.checkout_method_approval where method = 'stripe' and purpose = 'donation'`;
      expect(readyApproval).toMatchObject({ enabled: true, config_version: configVersion });
      // Revocation commits before the waiting admission can read the locked policy row.
      let waitingAdmission: Promise<unknown> | undefined;
      await db.begin(async (tx) => {
        const [locked] =
          await tx`select version from public.checkout_policy where singleton = true for update`;
        waitingAdmission = admit(secondKey);
        void waitingAdmission.catch(() => {});
        await Bun.sleep(50);
        await tx`select public.set_checkout_policy_with_audit(${actorAuthId}::uuid,${locked.version},false)`;
      });
      expect(waitingAdmission).toBeDefined();
      await expectSqlState(waitingAdmission!, "P5101");
      const [rejected] =
        await db`select count(*)::int as total from public.checkout_admission where idempotency_key = ${secondKey}::uuid`;
      expect(rejected.total).toBe(0);
      const [policyRevoked] =
        await db`select version from public.checkout_policy where singleton = true`;
      await db`select public.set_checkout_policy_with_audit(${actorAuthId}::uuid,${policyRevoked.version},true)`;

      const [accepted] = await admit(key);
      expect(accepted.admission).toMatchObject({
        config_id: configId,
        config_version: configVersion,
        existing: false,
      });
      const [policyEnabled] =
        await db`select version from public.checkout_policy where singleton = true`;
      await db`select public.set_checkout_policy_with_audit(${actorAuthId}::uuid,${policyEnabled.version},false)`;
      const [retry] = await admit(key);
      expect(retry.admission).toMatchObject({ config_id: configId, existing: true });
      await expectSqlState(admit(key, "b".repeat(64)), "P5104");
      await expectSqlState(admit(secondKey), "P5101");

      const [grants] = await db`select
        has_function_privilege('anon', 'public.admit_new_checkout(uuid,text,text,text,integer)', 'EXECUTE') as anon_rpc,
        has_function_privilege('authenticated', 'public.admit_new_checkout(uuid,text,text,text,integer)', 'EXECUTE') as authenticated_rpc,
        has_function_privilege('service_role', 'public.admit_new_checkout(uuid,text,text,text,integer)', 'EXECUTE') as service_rpc,
        has_table_privilege('anon', 'public.checkout_admission', 'SELECT') as anon_admissions,
        has_table_privilege('service_role', 'public.checkout_policy', 'UPDATE') as service_policy_update,
        has_table_privilege('service_role', 'public.checkout_method_approval', 'UPDATE') as service_method_update,
        has_function_privilege('anon', 'public.set_checkout_policy_with_audit(uuid,integer,boolean)', 'EXECUTE') as anon_toggle`;
      expect(grants).toEqual({
        anon_rpc: false,
        authenticated_rpc: false,
        service_rpc: true,
        anon_admissions: false,
        service_policy_update: false,
        service_method_update: false,
        anon_toggle: false,
      });
      const [audit] =
        await db`select count(*)::int as total from public.audit_log where actor_user_id = ${actorAuthId}::uuid and action in ('checkout_policy.set','checkout_method_approval.set')`;
      expect(audit.total).toBe(6);
    } finally {
      await db`update public.checkout_policy set enabled = false, approved_by = null, approved_at = null where singleton = true`;
      await db`delete from public.checkout_admission where idempotency_key in (${key}::uuid,${secondKey}::uuid)`;
      await db`delete from public.checkout_method_approval where method = 'stripe' and purpose = 'donation' and approved_by = ${actorId}::uuid`;
      if (configId)
        await db`update public.payment_public_config set state = 'published', is_publicly_visible = true, published_by = null where id = ${configId}::uuid`;
      await db`delete from public.admin_user where id = ${actorId}::uuid`;
      await db.close();
    }
  });
});
