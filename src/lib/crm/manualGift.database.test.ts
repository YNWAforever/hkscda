import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";

// Explicit opt-in; never inherit DATABASE_URL, production connectors or linked project credentials.
function validatedLocalUrl(raw: string): string {
  const parsed = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.search ||
    parsed.hash ||
    !parsed.port ||
    !parsed.username ||
    !parsed.password ||
    parsed.pathname.length < 2
  ) {
    throw new Error(
      "CRM test database requires explicit loopback postgres credentials/port/database without query or fragment",
    );
  }
  if (parsed.hostname === "localhost") parsed.hostname = "127.0.0.1";
  return parsed.toString();
}
const url =
  process.env.CRM_TEST_ALLOW_LOCAL_FIXTURES === "1" && process.env.CRM_TEST_DATABASE_URL
    ? validatedLocalUrl(process.env.CRM_TEST_DATABASE_URL)
    : undefined;
const sql = url ? new SQL(url) : null;
test("local database fixture rejects routing overrides and requires explicit connection fields", () => {
  for (const bad of [
    "postgres://u:p@remote.example.invalid:5432/test",
    "postgres://u:p@127.0.0.1:5432/test?host=remote.example.invalid",
    "postgres://u:p@127.0.0.1:5432/test#fragment",
    "https://u:p@127.0.0.1:5432/test",
    "postgres://u:p@127.0.0.1/test",
    "postgres://127.0.0.1:5432/test",
  ])
    expect(() => validatedLocalUrl(bad)).toThrow();
  expect(validatedLocalUrl("postgres://u:p@localhost:55322/test")).toBe(
    "postgres://u:p@127.0.0.1:55322/test",
  );
});
const actor = randomUUID();
const supporter = randomUUID();
const requests: string[] = [];
const volunteerActivities: string[] = [];
const staffActor = randomUUID();
const input = {
  supporterId: supporter,
  amountCents: 20000,
  currency: "HKD",
  purpose: "general",
  method: "manual",
  paymentStatus: "succeeded",
  bankReference: "LOCAL-CRM-FIXTURE",
  receiptRequested: true,
  consents: { email: false },
};
function database() {
  if (!sql) throw new Error("Local fixture missing");
  return sql;
}
async function gift(requestId: string, payload: unknown = input) {
  const rows =
    await database()`select public.record_manual_gift_with_audit(${requestId}::uuid,${actor}::uuid,${JSON.stringify(payload)}::jsonb) result`;
  return rows[0].result as {
    donationId: string;
    paymentId: string;
    deliveryJobId: string | null;
    replayed: boolean;
  };
}
function requestId() {
  const id = randomUUID();
  requests.push(id);
  return id;
}
if (!url)
  console.info(
    "CRM transaction tests skipped: set CRM_TEST_ALLOW_LOCAL_FIXTURES=1 and CRM_TEST_DATABASE_URL to a migrated disposable loopback Postgres instance.",
  );
describe.skipIf(!url)("manual gift real database transaction and leases", () => {
  beforeAll(async () => {
    await database()`insert into public.admin_user(auth_user_id,email,role,status) values(${staffActor}::uuid,${staffActor + "@example.invalid"},'staff','active')`;
    await database()`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'treasurer','active')`;
    await database()`insert into public.supporter(id,name,email,language) values(${supporter}::uuid,'Local CRM fixture',${supporter + "@example.invalid"},'en')`;
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from public.manual_gift_request where request_id = any(${sql.array(requests)}::uuid[])`;
    await sql`delete from public.audit_log where actor_user_id in (${actor}::uuid,${staffActor}::uuid)`;
    await sql`delete from public.volunteer_activity where id=any(${sql.array(volunteerActivities)}::uuid[])`;
    await sql`delete from public.admin_user where auth_user_id=${staffActor}::uuid`;
    await sql`delete from public.donation where supporter_id=${supporter}::uuid`;
    await sql`delete from public.supporter where id=${supporter}::uuid`;
    await sql`delete from public.admin_user where auth_user_id=${actor}::uuid`;
    await sql.close();
  });
  test("concurrent identical commands produce one finance/audit/job/consent and stable IDs", async () => {
    const key = requestId();
    const results = await Promise.all([gift(key), gift(key)]);
    expect(results[0].donationId).toBe(results[1].donationId);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    const [counts] =
      await database()`select (select count(*)::int from public.donation where id=${results[0].donationId}::uuid) donations,(select count(*)::int from public.payment where donation_id=${results[0].donationId}::uuid) payments,(select count(*)::int from public.audit_log where detail->>'requestId'=${key}) audits,(select count(*)::int from public.donation_delivery_job where donation_id=${results[0].donationId}::uuid) jobs`;
    expect(counts).toEqual({ donations: 1, payments: 1, audits: 1, jobs: 1 });
    const [snapshot] =
      await database()`select contact_email::text,contact_name from public.donation where id=${results[0].donationId}::uuid`;
    expect(snapshot.contact_email).toBe(supporter + "@example.invalid");
    const [payment] =
      await database()`select provider_ref from public.payment where id=${results[0].paymentId}::uuid`;
    expect(payment.provider_ref).toBe(
      "HKSCDA-" + results[0].donationId.replaceAll("-", "").slice(0, 8).toUpperCase(),
    );
    const [before] =
      await database()`select count(*)::int total from public.consent where supporter_id=${supporter}::uuid`;
    await gift(key);
    const [after] =
      await database()`select count(*)::int total from public.consent where supporter_id=${supporter}::uuid`;
    expect(after.total).toBe(before.total);
  });
  test("changed payload conflicts without a second financial write", async () => {
    const key = requestId();
    await gift(key);
    await expect(gift(key, { ...input, amountCents: 30000 })).rejects.toThrow(
      "manual_gift_payload_conflict",
    );
  });
  test("pending gifts persist finance without a delivery job", async () => {
    const result = await gift(requestId(), {
      ...input,
      paymentStatus: "pending",
      receiptRequested: false,
    });
    expect(result.deliveryJobId).toBeNull();
  });
  test("concurrent claims and expired lease recovery fence the stale worker", async () => {
    const result = await gift(requestId());
    const first = randomUUID(),
      second = randomUUID();
    const claim = (owner: string) =>
      database()`select * from public.claim_donation_delivery_job(${result.deliveryJobId}::uuid,${owner}::uuid,now()+interval '5 minutes')`;
    const claims = await Promise.all([claim(first), claim(second)]);
    expect(claims.map((r) => r.length).sort()).toEqual([0, 1]);
    const stale = claims[0].length ? first : second;
    await database()`update public.donation_delivery_job set lease_until=now()-interval '1 second' where id=${result.deliveryJobId}::uuid`;
    const fresh = randomUUID();
    expect((await claim(fresh)).length).toBe(1);
    const updated =
      await database()`update public.donation_delivery_job set status='complete',lease_owner=null,lease_until=null where id=${result.deliveryJobId}::uuid and lease_owner=${stale}::uuid returning id`;
    expect(updated.length).toBe(0);
    expect((await gift(requests[requests.length - 1])).paymentId).toBe(result.paymentId);
  });
  test.each(["payment", "audit_log"] as const)(
    "forced %s insert failure leaves no request, finance, role, consent or job",
    async (table) => {
      const key = requestId();
      const suffix = randomUUID().replaceAll("-", "");
      await database().begin(async (tx) => {
        await tx.unsafe(
          `create function public.fixture_fail_${suffix}() returns trigger language plpgsql as $$ begin raise exception 'forced fixture insert failure'; end $$`,
        );
        await tx.unsafe(
          `create trigger fixture_fail_${suffix} before insert on public.${table} for each row execute function public.fixture_fail_${suffix}()`,
        );
        const [before] =
          await tx`select count(*)::int total from public.consent where supporter_id=${supporter}::uuid`;
        await expect(
          tx.savepoint(async (sp) => {
            await sp`select public.record_manual_gift_with_audit(${key}::uuid,${actor}::uuid,${JSON.stringify(input)}::jsonb)`;
          }),
        ).rejects.toThrow("forced fixture insert failure");
        const [request] =
          await tx`select count(*)::int total from public.manual_gift_request where request_id=${key}::uuid`;
        expect(request.total).toBe(0);
        const [after] =
          await tx`select count(*)::int total from public.consent where supporter_id=${supporter}::uuid`;
        expect(after.total).toBe(before.total);
        await tx.unsafe(`drop trigger fixture_fail_${suffix} on public.${table}`);
        await tx.unsafe(`drop function public.fixture_fail_${suffix}()`);
      });
    },
  );
  test("anon and authenticated cannot execute finance, claim or retry RPCs", async () => {
    const rows =
      await database()`select role,has_function_privilege(role,'public.record_manual_gift_with_audit(uuid,uuid,jsonb)','execute') finance,has_function_privilege(role,'public.claim_donation_delivery_job(uuid,uuid,timestamptz)','execute') claim,has_function_privilege(role,'public.retry_donation_delivery_job_with_audit(uuid,uuid)','execute') retry from unnest(array['anon','authenticated']) role`;
    for (const row of rows) {
      expect(row.finance).toBe(false);
      expect(row.claim).toBe(false);
      expect(row.retry).toBe(false);
    }
  });
  test.each([1001, 5000, 5001])(
    "real SQL list/filter/export sees all %i matches before output bound",
    async (count) => {
      const marker = randomUUID();
      const rollback = new Error("rollback synthetic read fixture");
      try {
        await database().begin(async (tx) => {
          await tx`insert into public.supporter(name,email,language,tags,source,created_at) select 'Read fixture %_ '||n, n::text||'@'||${marker}||'.invalid','en',array[${marker}],${marker},'2026-09-05T00:00:00Z'::timestamptz from generate_series(1,${count}) n`;
          await tx`insert into public.supporter_role(supporter_id,role) select id,'donor' from public.supporter where source=${marker}`;
          await tx`insert into public.donation(supporter_id,amount_cents,purpose,type,status,method,receipt_requested,created_at) select id,10000,'medical','one_time','succeeded','manual',true,'2026-09-05T00:00:00Z'::timestamptz from public.supporter where source=${marker}`;
          await tx`insert into public.consent(supporter_id,channel,status,source,timestamp) select s.id,c.channel,c.status,${marker},'2026-09-05T00:00:00Z'::timestamptz from public.supporter s cross join (values('email','opt_in'),('email','opt_out'),('whatsapp','opt_in')) c(channel,status) where s.source=${marker}`;
          const filters = {
            tag: marker,
            role: "donor",
            consentChannel: "email",
            consentStatus: "opt_out",
            purpose: "medical",
            receiptNeeded: true,
            q: "%_",
            includeDeleted: false,
          };
          const [page] =
            await tx`select public.crm_read_supporters(${JSON.stringify(filters)}::jsonb,1000,100,false) result`;
          expect(page.result.total).toBe(count);
          expect(page.result.supporters.length).toBe(Math.min(100, count - 1000));
          const [optIn] =
            await tx`select public.crm_read_supporters(${JSON.stringify({ ...filters, consentStatus: "opt_in" })}::jsonb,0,25,false) result`;
          expect(optIn.result.total).toBe(0);
          const [whatsapp] =
            await tx`select public.crm_read_supporters(${JSON.stringify({ ...filters, consentChannel: "whatsapp", consentStatus: "opt_in" })}::jsonb,0,25,false) result`;
          expect(whatsapp.result.total).toBe(count);
          const [supporters] =
            await tx`select public.crm_read_supporters(${JSON.stringify(filters)}::jsonb,0,5000,true) result`;
          const [donations] =
            await tx`select public.crm_export_donations(${JSON.stringify(filters)}::jsonb) result`;
          expect(supporters.result.total).toBe(count);
          expect(donations.result.total).toBe(count);
          expect(supporters.result.overflow).toBe(count > 5000);
          expect(donations.result.overflow).toBe(count > 5000);
          expect(supporters.result.supporters.length).toBe(count > 5000 ? 0 : count);
          expect(donations.result.donations.length).toBe(count > 5000 ? 0 : count);
          if (count === 5000)
            console.info(
              JSON.stringify({
                fixture: "crm-read-v1",
                rows: count,
                supporterEnvelopeBytes: Buffer.byteLength(JSON.stringify(supporters.result)),
                donationEnvelopeBytes: Buffer.byteLength(JSON.stringify(donations.result)),
              }),
            );
          if (count === 1001) {
            const ids = new Set<string>();
            for (let offset = 0; offset < count; offset += 100) {
              const [batch] =
                await tx`select public.crm_read_supporters(${JSON.stringify(filters)}::jsonb,${offset},100,false) result`;
              for (const row of batch.result.supporters) ids.add(row.id);
            }
            expect(ids.size).toBe(1001);
          }
          const [deleted] =
            await tx`update public.supporter set deleted_at=now() where id=(select id from public.supporter where source=${marker} order by id limit 1) returning id`;
          const [hidden] =
            await tx`select public.crm_read_supporters(${JSON.stringify(filters)}::jsonb,0,25,false) result`;
          expect(hidden.result.total).toBe(count - 1);
          const [visible] =
            await tx`select public.crm_read_supporters(${JSON.stringify({ ...filters, includeDeleted: true })}::jsonb,0,25,false) result`;
          expect(visible.result.total).toBe(count);
          expect(deleted.id).toBeDefined();
          throw rollback;
        });
      } catch (error) {
        if (error !== rollback) throw error;
      }
    },
  );
  test("real summary totals include 1001 gifts and retain receipt association", async () => {
    const rollback = new Error("rollback synthetic aggregate fixture");
    const id = randomUUID();
    try {
      await database().begin(async (tx) => {
        await tx`insert into public.supporter(id,name,email,language,tags) values(${id}::uuid,'Aggregate fixture',${id + "@example.invalid"},'en',array[${id}])`;
        await tx`insert into public.donation(supporter_id,amount_cents,purpose,status,method,receipt_requested) select ${id}::uuid,n*100,'general','succeeded','manual',true from generate_series(1,1001) n`;
        const [expected] =
          await tx`select sum(amount_cents)::bigint amount,count(*)::int count from public.donation where supporter_id=${id}::uuid`;
        const [summary] = await tx`select public.crm_supporter_summary(${id}::uuid) result`;
        expect(summary.result.donationCount).toBe(expected.count);
        expect(summary.result.lifetimeAmountCents).toBe(Number(expected.amount));
        const [gift] =
          await tx`select id from public.donation where supporter_id=${id}::uuid order by id limit 1`;
        await tx`insert into public.receipt(supporter_id,receipt_no,donation_ids,total_amount_cents,tax_year,status) values(${id}::uuid,${"LOCAL-" + id},array[${gift.id}::uuid],10000,2026,'issued')`;
        const [exported] =
          await tx`select public.crm_export_donations(${JSON.stringify({ tag: id })}::jsonb) result`;
        expect(
          exported.result.donations.find((d: { donationId: string }) => d.donationId === gift.id)
            .receiptNo,
        ).toBe("LOCAL-" + id);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
  async function activityFixture(capacity: number) {
    const id = randomUUID();
    volunteerActivities.push(id);
    const [row] =
      await database()`insert into public.volunteer_activity(id,type,title,starts_at,location,capacity,status,auto_approve,registration_modes) values(${id}::uuid,'cleaning_day','Local capacity fixture',now()+interval '1 day','Local fixture',${capacity},'published',true,array['individual','group']) returning id,updated_at::text version`;
    return row as { id: string; version: string };
  }
  async function registrationFixture(activityId: string, people = 1) {
    const [row] =
      await database()`insert into public.volunteer_registration(activity_id,registration_type,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at) values(${activityId}::uuid,${people === 1 ? "individual" : "group"},${people},'Local fixture','fixture@example.invalid','00000000',${randomUUID()},now()+interval '1 day') returning id,updated_at::text version`;
    return row as { id: string; version: string };
  }
  async function approveFixture(row: { id: string; version: string }, status = "approved") {
    const [result] =
      await database()`select public.set_volunteer_registration_status_with_audit(${row.id}::uuid,${staffActor}::uuid,${row.version}::timestamptz,${status},null) result`;
    return result.result;
  }
  test("real concurrent staff approvals serialize for one remaining place; cancellation frees capacity", async () => {
    const activity = await activityFixture(1),
      a = await registrationFixture(activity.id),
      b = await registrationFixture(activity.id);
    const results = await Promise.all([approveFixture(a), approveFixture(b)]);
    expect(results.map((r) => r.kind).sort()).toEqual(["capacity_full", "updated"]);
    const winner = results[0].kind === "updated" ? a : b,
      loser = winner === a ? b : a,
      winningResult = results.find((r) => r.kind === "updated");
    expect(
      (await approveFixture({ ...winner, version: winningResult.updatedAt }, "cancelled")).kind,
    ).toBe("updated");
    expect((await approveFixture(loser)).kind).toBe("updated");
    expect((await approveFixture(winner)).kind).toBe("conflict");
  });
  test("real public and staff approvals share the same activity lock", async () => {
    const activity = await activityFixture(1),
      staff = await registrationFixture(activity.id);
    await Promise.all([
      approveFixture(staff),
      database()`select public.create_volunteer_registration(${activity.id}::uuid,null::uuid,'individual',1,'Local public fixture','fixture@example.invalid','00000000','en',null,25,null,null,null,null,${randomUUID()},now()+interval '1 day',false,false)`,
    ]);
    const [row] =
      await database()`select coalesce(sum(participant_count),0)::int total from public.volunteer_registration where activity_id=${activity.id}::uuid and status='approved'`;
    expect(row.total).toBe(1);
  });
  test("real group capacity, approved edits and activity reduction respect current occupants", async () => {
    const activity = await activityFixture(3),
      group = await registrationFixture(activity.id, 3),
      overflow = await registrationFixture(activity.id, 2);
    const first = await approveFixture(group);
    expect(first.kind).toBe("updated");
    expect((await approveFixture({ ...group, version: first.updatedAt })).kind).toBe("updated");
    expect((await approveFixture(overflow)).kind).toBe("capacity_full");
    const [reduction] =
      await database()`select public.update_volunteer_activity_with_audit(${activity.id}::uuid,${staffActor}::uuid,${activity.version}::timestamptz,'{"capacity":2}'::jsonb) result`;
    expect(reduction.result.kind).toBe("capacity_full");
  });
  test("real capacity reduction racing approval cannot overbook", async () => {
    const activity = await activityFixture(2),
      group = await registrationFixture(activity.id, 2);
    await Promise.all([
      approveFixture(group),
      database()`select public.update_volunteer_activity_with_audit(${activity.id}::uuid,${staffActor}::uuid,${activity.version}::timestamptz,'{"capacity":1}'::jsonb)`,
    ]);
    const [row] =
      await database()`select a.capacity,(select coalesce(sum(r.participant_count),0)::int from public.volunteer_registration r where r.activity_id=a.id and r.status='approved') occupied from public.volunteer_activity a where a.id=${activity.id}::uuid`;
    expect(row.occupied).toBeLessThanOrEqual(row.capacity);
  });
  test("real approval audit failure rolls back registration status", async () => {
    const activity = await activityFixture(1),
      registration = await registrationFixture(activity.id),
      suffix = randomUUID().replaceAll("-", "");
    await database().begin(async (tx) => {
      await tx.unsafe(
        `create function public.fixture_fail_${suffix}() returns trigger language plpgsql as $$ begin raise exception 'forced approval audit failure'; end $$`,
      );
      await tx.unsafe(
        `create trigger fixture_fail_${suffix} before insert on public.audit_log for each row execute function public.fixture_fail_${suffix}()`,
      );
      await expect(
        tx.savepoint(async (sp) => {
          await sp`select public.set_volunteer_registration_status_with_audit(${registration.id}::uuid,${staffActor}::uuid,${registration.version}::timestamptz,'approved',null)`;
        }),
      ).rejects.toThrow("forced approval audit failure");
      const [row] =
        await tx`select status from public.volunteer_registration where id=${registration.id}::uuid`;
      expect(row.status).toBe("pending");
      await tx.unsafe(`drop trigger fixture_fail_${suffix} on public.audit_log`);
      await tx.unsafe(`drop function public.fixture_fail_${suffix}()`);
    });
  });
});
