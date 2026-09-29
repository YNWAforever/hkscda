import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.CHECKOUT_POLICY_TEST_DATABASE_URL;
if (url && !/^postgresql:\/\/postgres:postgres@127\.0\.0\.1:(?:55322|57322)\/postgres$/.test(url))
  throw new Error("Donation delivery DB test requires the dedicated loopback rehearsal database");

test.skipIf(!url)(
  "successful payment queues one durable recovery job and audit in its transaction",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const supporter = crypto.randomUUID(),
      donation = crypto.randomUUID(),
      payment = crypto.randomUUID();
    const rollback = new Error("rollback synthetic payment");
    try {
      try {
        await db.begin(async (tx) => {
          await tx`insert into public.supporter(id,name,email) values(${supporter}::uuid,'Synthetic donor',${supporter + "@example.test"})`;
          await tx`insert into public.donation(id,supporter_id,amount_cents,purpose,method,receipt_requested)
          values(${donation}::uuid,${supporter}::uuid,20000,'general','stripe',true)`;
          await tx`insert into public.payment(id,donation_id,provider,amount_cents)
          values(${payment}::uuid,${donation}::uuid,'stripe',20000)`;
          await tx`set local role service_role`;
          await tx`update public.payment set status='succeeded',received_at=now() where id=${payment}::uuid`;
          await tx`update public.donation set status='succeeded' where id=${donation}::uuid`;
          const [job] =
            await tx`select id,payment_id,status from public.donation_delivery_job where donation_id=${donation}::uuid`;
          expect(job).toMatchObject({ payment_id: payment, status: "pending" });
          await tx`update public.donation set status='succeeded' where id=${donation}::uuid`;
          const [counts] = await tx`select
          (select count(*)::int from public.donation_delivery_job where donation_id=${donation}::uuid) jobs,
          (select count(*)::int from public.audit_log where action='donation.delivery_queued' and entity_id=${job.id}) audits`;
          expect(counts).toEqual({ jobs: 1, audits: 1 });
          const [due] =
            await tx`select id from public.list_due_donation_delivery_jobs(25) where id=${job.id}::uuid`;
          expect(due.id).toBe(job.id);
          throw rollback;
        });
      } catch (error) {
        if (error !== rollback) throw error;
      }
      const [grants] = await db`select
      has_function_privilege('anon','public.list_due_donation_delivery_jobs(integer)','execute') anon_list,
      has_function_privilege('authenticated','public.list_due_donation_delivery_jobs(integer)','execute') staff_list,
      has_function_privilege('service_role','public.list_due_donation_delivery_jobs(integer)','execute') service_list`;
      expect(grants).toEqual({ anon_list: false, staff_list: false, service_list: true });
      const [absent] =
        await db`select count(*)::int n from public.donation_delivery_job where donation_id=${donation}::uuid`;
      expect(absent.n).toBe(0);
    } finally {
      await db.close();
    }
  },
);
