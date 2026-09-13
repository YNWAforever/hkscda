import { SQL } from "bun";
import { expect, test } from "bun:test";
const url = process.env.SPONSORSHIP_TEST_DATABASE_URL;
if (url) {
  const u = new URL(url);
  if (
    u.hostname !== "127.0.0.1" ||
    u.port !== "56322" ||
    u.pathname !== "/postgres" ||
    u.search ||
    u.hash ||
    !["postgres:", "postgresql:"].includes(u.protocol)
  )
    throw new Error("Only isolated 127.0.0.1:56322/postgres is allowed");
}
const enabled = !!url && process.env.SPONSORSHIP_TEST_ALLOW_LOCAL_FIXTURES === "1";
test.skipIf(!enabled)(
  "FIX03-09 exact proof, canonical money, reallocation, delivery leases, roles and contact history",
  async () => {
    const db = new SQL(url!, { max: 1 });
    const other = new SQL(url!, { max: 1 });
    const actor = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const pledge = crypto.randomUUID();
    try {
      await db`insert into public.admin_user(auth_user_id,email,role) values(${actor}::uuid,${actor + "@example.invalid"},'admin')`;
      await db`insert into public.supporter(id,name,email) values(${supporter}::uuid,'Synthetic proof review',${supporter + "@example.invalid"})`;
      await db`insert into public.sponsorship_pledge(id,supporter_id,monthly_tier,amount_cents,language,status) values(${pledge}::uuid,${supporter}::uuid,'300',30000,'en','provisional')`;
      async function proof(amount = 30000) {
        const id = crypto.randomUUID();
        await db`insert into public.sponsorship_payment_proof(id,pledge_id,storage_path,file_name,file_type,file_size,payment_method,amount_cents,payment_date) values(${id}::uuid,${pledge}::uuid,${id},'synthetic.png','image/png',1,'fps',${amount},'2026-07-01')`;
        return id;
      }
      async function review(
        id: string,
        key = crypto.randomUUID(),
        revision = 1,
        client = db,
        decision = "approve",
      ) {
        return (
          await client`select public.review_exact_sponsorship_payment_proof(${pledge}::uuid,${id}::uuid,${revision}::bigint,${key}::uuid,${decision},${actor}::uuid,null,null) result`
        )[0].result;
      }
      const a = await proof(),
        b = await proof(),
        key = crypto.randomUUID();
      const first = await review(a, key);
      expect(first.kind).toBe("reviewed");
      expect(first.proofId).toBe(a);
      expect(first.revision).toBe(2);
      expect(first.allocations).toEqual([{ periodMonth: "2026-07-01", amountCents: 30000 }]);
      const replay = await review(a, key);
      expect(replay.replayed).toBe(true);
      expect(replay.proofId).toBe(a);
      expect((await review(a)).kind).toBe("conflict");
      expect((await review(b, key)).kind).toBe("conflict");
      expect(
        (
          await db`select review_status from public.sponsorship_payment_proof where id=${b}::uuid`
        )[0].review_status,
      ).toBe("pending");
      const c = await proof();
      const concurrent = await Promise.all([review(b), review(c, crypto.randomUUID(), 1, other)]);
      expect(concurrent.every((x) => x.kind === "reviewed")).toBe(true);
      expect(
        concurrent
          .flatMap((x) => x.allocations.map((p: { periodMonth: string }) => p.periodMonth))
          .sort(),
      ).toEqual(["2026-08-01", "2026-09-01"]);
      const d = await proof();
      const double = await Promise.all([review(d), review(d, crypto.randomUUID(), 1, other)]);
      expect(double.map((x) => x.kind).sort()).toEqual(["conflict", "reviewed"]);
      const changed = await proof();
      await db`update public.sponsorship_payment_proof set storage_path=${changed + "-replacement"} where id=${changed}::uuid`;
      expect((await review(changed)).kind).toBe("conflict");
      const rejected = await proof();
      expect((await review(rejected, crypto.randomUUID(), 1, db, "reject")).allocations).toEqual(
        [],
      );
      const huge = await proof(30000 * 40);
      let refused = false;
      try {
        await review(huge);
      } catch {
        refused = true;
      }
      expect(refused).toBe(true);
      expect(
        (
          await db`select review_status from public.sponsorship_payment_proof where id=${huge}::uuid`
        )[0].review_status,
      ).toBe("pending");
      const rollback = await proof(),
        failureKey = crypto.randomUUID();
      await db.unsafe(
        `create function public.test_fix03_audit_failure() returns trigger language plpgsql as $$ begin if new.actor_user_id='${actor}'::uuid and new.action='sponsorship_pledge.proof_reviewed' then raise exception 'synthetic audit failure'; end if; return new; end; $$; create trigger test_fix03_audit_failure before insert on public.audit_log for each row execute function public.test_fix03_audit_failure();`,
      );
      try {
        let failed = false;
        try {
          await review(rollback, failureKey);
        } catch {
          failed = true;
        }
        expect(failed).toBe(true);
        expect(
          (
            await db`select review_status,revision::integer as revision from public.sponsorship_payment_proof where id=${rollback}::uuid`
          )[0],
        ).toMatchObject({ review_status: "pending", revision: 1 });
        expect(
          Number(
            (
              await db`select count(*) n from public.sponsorship_payment_allocation where proof_id=${rollback}::uuid`
            )[0].n,
          ),
        ).toBe(0);
        expect(
          Number(
            (
              await db`select count(*) n from public.sponsorship_proof_review_command where idempotency_key=${failureKey}::uuid`
            )[0].n,
          ),
        ).toBe(0);
      } finally {
        await db.unsafe(
          "drop trigger test_fix03_audit_failure on public.audit_log; drop function public.test_fix03_audit_failure();",
        );
      }
      expect((await review(rollback, failureKey)).kind).toBe("reviewed");
      expect(
        Number(
          (
            await db`select count(*) n from public.audit_log where entity_id=${pledge} and action='sponsorship_pledge.proof_reviewed'`
          )[0].n,
        ),
      ).toBe(6);
      expect(
        (
          await db`select has_function_privilege('service_role','public.review_sponsorship_payment_proof(uuid,text,uuid,text,jsonb,uuid)','EXECUTE') allowed`
        )[0].allowed,
      ).toBe(false);
      const money =
        await db`select count(*) n,sum(p.amount_cents) total from public.sponsorship_payment_source s join public.payment p on p.id=s.payment_id join public.sponsorship_payment_proof proof on proof.id=s.proof_id where proof.pledge_id=${pledge}::uuid`;
      expect(Number(money[0].n)).toBe(5);
      expect(Number(money[0].total)).toBe(150000);
      const original = (
        await db`select id from public.sponsorship_payment_allocation where proof_id=${a}::uuid and amount_cents>0`
      )[0].id;
      await db`select public.reverse_sponsorship_allocation_with_audit(${original}::uuid,${actor}::uuid,'Synthetic factual attribution correction')`;
      const reapplied = (
        await db`select public.allocate_sponsorship_payment_with_audit(${a}::uuid,${actor}::uuid,'[{"periodMonth":"2026-07-01","amountCents":30000}]'::jsonb) result`
      )[0].result;
      expect(reapplied.status).toBe("allocated");
      expect(
        Number(
          (
            await db`select count(*) n from public.sponsorship_payment_allocation where proof_id=${a}::uuid`
          )[0].n,
        ),
      ).toBe(3);
      const refund = (
        await db`select public.record_sponsorship_full_refund(${actor}::uuid,${a}::uuid,2,'SYNTHETIC-REFUND','Synthetic completed refund') result`
      )[0].result;
      expect(refund.kind).toBe("refunded");
      expect(
        (
          await db`select public.record_sponsorship_full_refund(${actor}::uuid,${a}::uuid,2,'SYNTHETIC-REFUND','Synthetic completed refund') result`
        )[0].result.replayed,
      ).toBe(true);
      expect(
        Number(
          (
            await db`select sum(amount_cents) n from public.sponsorship_payment_allocation where proof_id=${a}::uuid`
          )[0].n,
        ),
      ).toBe(0);
      let refundedDenied = false;
      try {
        await db`select public.allocate_sponsorship_payment_with_audit(${a}::uuid,${actor}::uuid,'[{"periodMonth":"2026-07-01","amountCents":30000}]'::jsonb)`;
      } catch {
        refundedDenied = true;
      }
      expect(refundedDenied).toBe(true);
      const cancelled = await proof();
      await db`select public.cancel_sponsorship_pledge(${pledge}::uuid,${actor}::uuid,'Synthetic future commitment cancellation')`;
      expect((await review(cancelled)).kind).toBe("reviewed");
      expect(
        (await db`select status from public.sponsorship_pledge where id=${pledge}::uuid`)[0].status,
      ).toBe("cancelled");
      expect(
        Number(
          (
            await db`select count(*) n from public.sponsorship_delivery_outbox where pledge_id=${pledge}::uuid and event='active'`
          )[0].n,
        ),
      ).toBe(6);
      expect(
        Number(
          (
            await db`select count(*) n from public.sponsorship_delivery_outbox where pledge_id=${pledge}::uuid and event='cancelled'`
          )[0].n,
        ),
      ).toBe(1);
      // Submission retry identity is independent of the current queue state.
      const secondPledge = crypto.randomUUID();
      await db`insert into public.sponsorship_pledge(id,supporter_id,monthly_tier,amount_cents,language,status) values(${secondPledge}::uuid,${supporter}::uuid,'300',30000,'en','active')`;
      const submissionKey = crypto.randomUUID();
      const payload = {
        paymentMethod: "fps",
        reference: crypto.randomUUID(),
        amountCents: 30000,
        paymentDate: "2026-07-01",
        storagePath: null,
        fileName: null,
        fileType: null,
        fileSize: null,
        note: null,
      };
      const submit = async (value = payload) =>
        (
          await db`select public.record_exact_sponsorship_payment_proof(${actor}::uuid,${secondPledge}::uuid,${submissionKey}::uuid,${value}::jsonb) id`
        )[0].id;
      const newProof = await submit();
      expect(await submit()).toBe(newProof);
      let changedKeyDenied = false;
      try {
        await submit({ ...payload, amountCents: 40000 });
      } catch {
        changedKeyDenied = true;
      }
      expect(changedKeyDenied).toBe(true);
      await db`update public.supporter set name='Changed canonical name' where id=${supporter}::uuid`;
      await db`select public.review_exact_sponsorship_payment_proof(${secondPledge}::uuid,${newProof}::uuid,1,${crypto.randomUUID()}::uuid,'approve',${actor}::uuid,null,null)`;
      expect(
        (
          await db`select d.contact_name from public.sponsorship_payment_source s join public.donation d on d.id=s.donation_id where s.proof_id=${newProof}::uuid`
        )[0].contact_name,
      ).toBe("Synthetic proof review");
      const collision = crypto.randomUUID();
      await db`insert into public.sponsorship_payment_proof(id,pledge_id,payment_method,reference,amount_cents,payment_date) values(${collision}::uuid,${secondPledge}::uuid,'fps',${payload.reference},30000,'2026-07-01')`;
      let duplicateMoneyDenied = false;
      try {
        await db`select public.review_exact_sponsorship_payment_proof(${secondPledge}::uuid,${collision}::uuid,1,${crypto.randomUUID()}::uuid,'approve',${actor}::uuid,null,null)`;
      } catch {
        duplicateMoneyDenied = true;
      }
      expect(duplicateMoneyDenied).toBe(true);
      expect(
        (
          await db`select review_status from public.sponsorship_payment_proof where id=${collision}::uuid`
        )[0].review_status,
      ).toBe("pending");
      const staff = crypto.randomUUID();
      await db`insert into public.admin_user(auth_user_id,email,role) values(${staff}::uuid,${staff + "@example.invalid"},'staff')`;
      let staffRefundDenied = false;
      try {
        await db`select public.record_sponsorship_full_refund(${staff}::uuid,${newProof}::uuid,2,'REF-STAFF','Not authorized')`;
      } catch {
        staffRefundDenied = true;
      }
      expect(staffRefundDenied).toBe(true);
      const claimed = (
        await db`select public.claim_sponsorship_deliveries(${actor}::uuid,10,${secondPledge}::uuid) result`
      )[0].result;
      expect(claimed.length).toBe(3);
      const job = claimed[0];
      expect(
        (
          await db`select public.finish_sponsorship_delivery(${actor}::uuid,${job.id}::uuid,${crypto.randomUUID()}::uuid,'wrong-lease-provider',null) result`
        )[0].result,
      ).toBe(false);
      expect(
        (
          await db`select public.finish_sponsorship_delivery(${actor}::uuid,${job.id}::uuid,${job.lease_token}::uuid,null,'synthetic_transport_failure') result`
        )[0].result,
      ).toBe(true);
      expect(
        (await db`select status from public.message where id=${job.message_id}::uuid`)[0].status,
      ).toBe("failed");
      await db`update public.sponsorship_delivery_outbox set next_attempt_at=now() where id=${job.id}::uuid`;
      const retry = (
        await db`select public.claim_sponsorship_deliveries(${actor}::uuid,10,${secondPledge}::uuid) result`
      )[0].result[0];
      expect(retry.lease_token).not.toBe(job.lease_token);
      expect(
        (
          await db`select public.finish_sponsorship_delivery(${actor}::uuid,${retry.id}::uuid,${retry.lease_token}::uuid,'synthetic-accepted-id',null) result`
        )[0].result,
      ).toBe(true);
      expect(
        (await db`select status from public.message where id=${retry.message_id}::uuid`)[0].status,
      ).toBe("sent");
      const treasury = crypto.randomUUID();
      await db`insert into public.admin_user(auth_user_id,email,role) values(${treasury}::uuid,${treasury + "@example.invalid"},'treasurer')`;
      const treasuryProof = crypto.randomUUID();
      await db`insert into public.sponsorship_payment_proof(id,pledge_id,payment_method,amount_cents,payment_date) values(${treasuryProof}::uuid,${secondPledge}::uuid,'fps',30000,'2026-07-01')`;
      let staffReviewDenied = false;
      try {
        await db`select public.review_exact_sponsorship_payment_proof(${secondPledge}::uuid,${treasuryProof}::uuid,1,${crypto.randomUUID()}::uuid,'approve',${staff}::uuid,null,null)`;
      } catch {
        staffReviewDenied = true;
      }
      expect(staffReviewDenied).toBe(true);
      expect(
        (
          await db`select public.review_exact_sponsorship_payment_proof(${secondPledge}::uuid,${treasuryProof}::uuid,1,${crypto.randomUUID()}::uuid,'approve',${treasury}::uuid,null,null) result`
        )[0].result.kind,
      ).toBe("reviewed");
      const donationId = (
        await db`select public.record_sponsorship_receipt_request(${treasury}::uuid,${treasuryProof}::uuid) id`
      )[0].id;
      expect(
        (await db`select receipt_requested from public.donation where id=${donationId}::uuid`)[0]
          .receipt_requested,
      ).toBe(true);
      const contactPledge = crypto.randomUUID();
      const snapshot = {
        supporterName: "Submitted new name",
        phone: "12345678",
        email: supporter + "@example.invalid",
        source: "public_sponsorship_submission",
        status: "unverified",
      };
      await db`insert into public.sponsorship_pledge(id,supporter_id,monthly_tier,amount_cents,language,contact_submission) values(${contactPledge}::uuid,${supporter}::uuid,'300',30000,'en',${snapshot}::jsonb)`;
      expect(
        (await db`select name from public.supporter where id=${supporter}::uuid`)[0].name,
      ).toBe("Changed canonical name");
      let immutable = false;
      try {
        await db`update public.sponsorship_pledge set contact_submission='{}'::jsonb where id=${contactPledge}::uuid`;
      } catch {
        immutable = true;
      }
      expect(immutable).toBe(true);
      let staffContactDenied = false;
      try {
        await db`select public.verify_sponsorship_contact_submission(${staff}::uuid,${contactPledge}::uuid,'Synthetic verified by phone')`;
      } catch {
        staffContactDenied = true;
      }
      expect(staffContactDenied).toBe(true);
      expect(
        (
          await db`select public.verify_sponsorship_contact_submission(${treasury}::uuid,${contactPledge}::uuid,'Synthetic verified by phone') result`
        )[0].result.kind,
      ).toBe("verified");
      expect(
        (await db`select name from public.supporter where id=${supporter}::uuid`)[0].name,
      ).toBe("Submitted new name");
      expect(
        (
          await db`select before_contact->>'name' name from public.sponsorship_contact_verification where pledge_id=${contactPledge}::uuid`
        )[0].name,
      ).toBe("Changed canonical name");
      const originalTreasury = (
        await db`select id from public.sponsorship_payment_allocation where proof_id=${treasuryProof}::uuid and amount_cents>0`
      )[0].id;
      await db`select public.reverse_sponsorship_allocation_with_audit(${originalTreasury}::uuid,${treasury}::uuid,'Synthetic split reallocation')`;
      const allocationKey = crypto.randomUUID();
      const split = (
        await db`select public.allocate_exact_sponsorship_payment(${treasury}::uuid,${treasuryProof}::uuid,0,${allocationKey}::uuid,'2027-01-01',10000,'Synthetic split reallocation') result`
      )[0].result;
      expect(split.allocatedCents).toBe(10000);
      expect(
        (
          await db`select public.allocate_exact_sponsorship_payment(${treasury}::uuid,${treasuryProof}::uuid,0,${allocationKey}::uuid,'2027-01-01',10000,'Synthetic split reallocation') result`
        )[0].result.replayed,
      ).toBe(true);
      let staleBalanceDenied = false;
      try {
        await db`select public.allocate_exact_sponsorship_payment(${treasury}::uuid,${treasuryProof}::uuid,0,${crypto.randomUUID()}::uuid,'2027-02-01',20000,'Synthetic split reallocation')`;
      } catch {
        staleBalanceDenied = true;
      }
      expect(staleBalanceDenied).toBe(true);
      expect(
        (
          await db`select public.allocate_exact_sponsorship_payment(${treasury}::uuid,${treasuryProof}::uuid,10000,${crypto.randomUUID()}::uuid,'2027-02-01',20000,'Synthetic split reallocation') result`
        )[0].result.allocatedCents,
      ).toBe(20000);
      expect(
        Number(
          (
            await db`select sum(amount_cents) n from public.sponsorship_payment_allocation where proof_id=${treasuryProof}::uuid`
          )[0].n,
        ),
      ).toBe(30000);
      const originalReceipt = (
        await db`select * from public.issue_receipt(${donationId}::uuid,${supporter}::uuid,30000,2026,now())`
      )[0];
      const refundKey = crypto.randomUUID();
      const revision = Number(
        (
          await db`select revision from public.sponsorship_payment_proof where id=${treasuryProof}::uuid`
        )[0].revision,
      );
      const partial = (
        await db`select public.record_sponsorship_refund(${treasury}::uuid,${treasuryProof}::uuid,${revision},0,${refundKey}::uuid,10000,'partial-synthetic','Synthetic partial refund') result`
      )[0].result;
      expect(partial.totalRefundedCents).toBe(10000);
      expect(
        (
          await db`select public.record_sponsorship_refund(${treasury}::uuid,${treasuryProof}::uuid,${revision},0,${refundKey}::uuid,10000,'partial-synthetic','Synthetic partial refund') result`
        )[0].result.replayed,
      ).toBe(true);
      const retained = (
        await db`select p.amount_cents,p.refunded_cents,p.status from public.payment p join public.sponsorship_payment_source s on s.payment_id=p.id where s.proof_id=${treasuryProof}::uuid`
      )[0];
      expect(retained.amount_cents).toBe(30000);
      expect(retained.refunded_cents).toBe(10000);
      expect(retained.status).toBe("succeeded");
      expect(
        Number(
          (
            await db`select sum(amount_cents) n from public.sponsorship_payment_allocation where proof_id=${treasuryProof}::uuid`
          )[0].n,
        ),
      ).toBe(20000);
      const exportRow = (
        await db`select public.crm_export_donations(${{ q: "Submitted new name" }}::jsonb) result`
      )[0].result.donations.find((row: { donationId: string }) => row.donationId === donationId);
      expect(exportRow.refundedCents).toBe(10000);
      expect(exportRow.amountCents).toBe(30000);
      const legacyProof = crypto.randomUUID();
      await db`insert into public.sponsorship_payment_proof(id,pledge_id,payment_method,amount_cents,payment_date,review_status) values(${legacyProof}::uuid,${secondPledge}::uuid,'fps',30000,'2026-07-01','approved')`;
      const canonicalPayment = (
        await db`select payment_id from public.sponsorship_payment_source where proof_id=${treasuryProof}::uuid`
      )[0].payment_id;
      let partialLegacyDenied = false;
      try {
        await db`select public.reconcile_legacy_sponsorship_payment(${treasury}::uuid,${legacyProof}::uuid,${canonicalPayment}::uuid,'Synthetic refunded legacy reconciliation')`;
      } catch (error) {
        partialLegacyDenied = String(error).includes("Legacy payment does not match");
      }
      expect(partialLegacyDenied).toBe(true);
      let staleRefund = false;
      try {
        await db`select public.record_sponsorship_refund(${treasury}::uuid,${treasuryProof}::uuid,${revision},0,${crypto.randomUUID()}::uuid,10000,'stale-synthetic','Synthetic stale refund')`;
      } catch {
        staleRefund = true;
      }
      expect(staleRefund).toBe(true);
      let excessiveRefund = false;
      try {
        await db`select public.record_sponsorship_refund(${treasury}::uuid,${treasuryProof}::uuid,${revision},10000,${crypto.randomUUID()}::uuid,25000,'excess-synthetic','Synthetic excessive refund')`;
      } catch {
        excessiveRefund = true;
      }
      expect(excessiveRefund).toBe(true);
      expect(
        (
          await db`select status from public.receipt where id=${originalReceipt.receipt_id}::uuid`
        )[0].status,
      ).toBe("void");
      let wrongReceipt = false;
      try {
        await db`select * from public.issue_receipt(${donationId}::uuid,${supporter}::uuid,30000,2026,now())`;
      } catch {
        wrongReceipt = true;
      }
      expect(wrongReceipt).toBe(true);
      const netReceipt = (
        await db`select * from public.issue_receipt(${donationId}::uuid,${supporter}::uuid,20000,2026,now())`
      )[0];
      expect(netReceipt.receipt_id).not.toBe(originalReceipt.receipt_id);
      expect(
        Number(
          (
            await db`select total_amount_cents from public.receipt where id=${netReceipt.receipt_id}::uuid`
          )[0].total_amount_cents,
        ),
      ).toBe(20000);
      const secondRefund = (
        await db`select public.record_sponsorship_refund(${treasury}::uuid,${treasuryProof}::uuid,${revision},10000,${crypto.randomUUID()}::uuid,20000,'remaining-synthetic','Synthetic remaining refund') result`
      )[0].result;
      expect(secondRefund.totalRefundedCents).toBe(30000);
      expect(
        (
          await db`select count(*)::int n from public.sponsorship_refund where proof_id=${treasuryProof}::uuid`
        )[0].n,
      ).toBe(2);
      expect(
        (await db`select status from public.donation where id=${donationId}::uuid`)[0].status,
      ).toBe("refunded");
      expect(
        Array.isArray(
          (
            await db`select public.search_sponsorship_assignment_candidates(${staff}::uuid,'Synthetic') result`
          )[0].result,
        ),
      ).toBe(true);
    } finally {
      await db.close();
      await other.close();
    }
  },
  30000,
);
