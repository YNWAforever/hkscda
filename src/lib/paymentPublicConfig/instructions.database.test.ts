import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { renderPledgeConfirmationEmail } from "../sponsorship/emailTemplates.server";
import type { PaymentInstructionSnapshot } from "./types";

const url = process.env.CHECKOUT_POLICY_TEST_DATABASE_URL;
if (url && !/^postgresql:\/\/postgres:postgres@127\.0\.0\.1:(?:55322|57322)\/postgres$/.test(url)) {
  throw new Error("Payment instruction DB tests require the dedicated loopback rehearsal database");
}

async function expectSqlState(operation: Promise<unknown>, code: string) {
  try {
    await operation;
    throw new Error(`Expected SQLSTATE ${code}`);
  } catch (error) {
    expect((error as { errno?: string }).errno).toBe(code);
  }
}

describe.skipIf(!url)("payment instruction snapshots on isolated database", () => {
  test("donor API and sponsorship email use approved details, then suppress revoked details while retaining evidence", async () => {
    const db = new SQL(url!, { max: 2, prepare: false });
    const actorId = crypto.randomUUID();
    const actorAuthId = crypto.randomUUID();
    const supporterId = crypto.randomUUID();
    const pledgeId = crypto.randomUUID();
    const intentKey = crypto.randomUUID();
    const fingerprint = "c".repeat(64);
    let configId: string | undefined;
    let original: { details: unknown; published_by: string | null; version: number } | undefined;
    try {
      const [config] =
        await db`select id, details, published_by, version from public.payment_public_config
        where method = 'fps' and state = 'published' limit 1`;
      expect(config).toBeDefined();
      configId = config.id as string;
      original = {
        details: config.details,
        published_by: config.published_by,
        version: config.version,
      };
      await db`insert into public.admin_user (id,auth_user_id,email,role,status)
        values (${actorId},${actorAuthId},${`instruction-${actorId}@example.test`},'treasurer','active')`;
      await db`insert into public.supporter (id,name,email) values
        (${supporterId},'Synthetic supporter',${`instruction-${supporterId}@example.test`})`;
      await db`insert into public.sponsorship_pledge
        (id,supporter_id,monthly_tier,amount_cents,language,status)
        values (${pledgeId}::uuid,${supporterId}::uuid,'300',30000,'zh-HK','pending_payment')`;
      await db`update public.payment_public_config set published_by = ${actorId}::uuid where id = ${configId}::uuid`;
      await expectSqlState(
        db`select public.set_checkout_method_approval_with_audit(
        ${actorAuthId}::uuid,'fps','donation',${configId}::uuid,${original.version},true)`,
        "23514",
      );
      const details = { payableTo: "Synthetic charity", identifier: "FPS SANDBOX-99" };
      await db`update public.payment_public_config set details = ${JSON.stringify(details)}::jsonb,
        published_by = ${actorId}::uuid where id = ${configId}::uuid`;
      for (const purpose of ["donation", "sponsorship"]) {
        await db`select public.set_checkout_method_approval_with_audit(
          ${actorAuthId}::uuid,'fps',${purpose},${configId}::uuid,${original.version},true)`;
      }
      const [policy] = await db`select version from public.checkout_policy where singleton = true`;
      await db`select public.set_checkout_policy_with_audit(${actorAuthId}::uuid,${policy.version},true)`;

      const [admission] = await db.begin(async (tx) => {
        await tx`set local role service_role`;
        return tx`select public.admit_new_checkout(
            ${intentKey}::uuid,${fingerprint},'fps','donation',${original!.version}) as value`;
      });
      expect(admission.value.instructions_active).toBe(true);
      expect(admission.value.instruction_snapshot.details).toEqual(details);
      const [capture] =
        await db`select public.capture_sponsorship_payment_instructions(${pledgeId}::uuid) as value`;
      expect(capture.value).toHaveLength(1);
      const snapshot = capture.value[0] as PaymentInstructionSnapshot;
      expect(snapshot.details).toEqual(details);
      const email = renderPledgeConfirmationEmail({
        language: "zh-HK",
        supporterName: "Synthetic",
        reference: "SP-TEST",
        amountCents: 30000,
        status: "pending_payment",
        statusUrl: "https://example.test/status",
        paymentInstructions: [{ snapshot, instructionsActive: true }],
      });
      expect(email.html).toContain("FPS SANDBOX-99");
      expect(email.html).not.toContain("8727588");

      await db`update public.payment_public_config set details = ${JSON.stringify({ payableTo: "Changed account", identifier: "FPS NEW" })}::jsonb,
        version = version + 1 where id = ${configId}::uuid`;
      const [replay] = await db.begin(async (tx) => {
        await tx`set local role service_role`;
        return tx`select public.admit_new_checkout(
            ${intentKey}::uuid,${fingerprint},'fps','donation',${original!.version}) as value`;
      });
      expect(replay.value.existing).toBe(true);
      expect(replay.value.instructions_active).toBe(false);
      expect(replay.value.instruction_snapshot.details).toEqual(details);
      const [resend] =
        await db`select public.capture_sponsorship_payment_instructions(${pledgeId}::uuid) as value`;
      expect(resend.value).toEqual([]);
      const [stored] = await db`select snapshot from public.sponsorship_payment_instruction_snapshot
        where pledge_id = ${pledgeId}::uuid and method = 'fps'`;
      expect(stored.snapshot.details).toEqual(details);
      const fallback = renderPledgeConfirmationEmail({
        language: "zh-HK",
        supporterName: "Synthetic",
        reference: "SP-TEST",
        amountCents: 30000,
        status: "pending_payment",
        statusUrl: "https://example.test/status",
        paymentInstructions: [],
      });
      expect(fallback.html).toContain("聯絡");
      expect(fallback.html).not.toContain("FPS SANDBOX-99");

      const [grants] = await db`select
        has_table_privilege('anon','public.sponsorship_payment_instruction_snapshot','SELECT') as anon_read,
        has_function_privilege('anon','public.capture_sponsorship_payment_instructions(uuid)','EXECUTE') as anon_capture,
        has_function_privilege('service_role','public.capture_sponsorship_payment_instructions(uuid)','EXECUTE') as service_capture`;
      expect(grants).toEqual({ anon_read: false, anon_capture: false, service_capture: true });
    } finally {
      await db`update public.checkout_policy set enabled = false, approved_by = null, approved_at = null where singleton = true`;
      await db`delete from public.checkout_admission where idempotency_key = ${intentKey}::uuid`;
      await db`delete from public.sponsorship_payment_instruction_snapshot where pledge_id = ${pledgeId}::uuid`;
      await db`delete from public.sponsorship_pledge where id = ${pledgeId}::uuid`;
      await db`delete from public.supporter where id = ${supporterId}::uuid`;
      await db`delete from public.checkout_method_approval where method = 'fps' and purpose in ('donation','sponsorship') and approved_by = ${actorId}::uuid`;
      if (configId && original)
        await db`update public.payment_public_config set
        details = ${JSON.stringify(original.details)}::jsonb, published_by = ${original.published_by}::uuid,
        version = ${original.version} where id = ${configId}::uuid`;
      await db`delete from public.admin_user where id = ${actorId}::uuid`;
      await db.close();
    }
  });
});
