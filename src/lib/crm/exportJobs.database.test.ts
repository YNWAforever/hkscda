import { expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";

const raw = process.env.CRM_TEST_DATABASE_URL;
const parsed = raw ? new URL(raw) : null;
const allowed =
  process.env.CRM_TEST_ALLOW_LOCAL_FIXTURES === "1" &&
  parsed !== null &&
  ["127.0.0.1", "localhost"].includes(parsed.hostname) &&
  ["postgres:", "postgresql:"].includes(parsed.protocol) &&
  Boolean(parsed.username && parsed.password && parsed.port) &&
  !parsed.search &&
  !parsed.hash;
const db = allowed && raw ? new SQL(raw) : null;

test.skipIf(!db)(
  "large CRM export job freezes filters, restricts roles and actors, and expires",
  async () => {
    const sql = db!;
    const actor = randomUUID();
    const other = randomUUID();
    const marker = randomUUID();
    const rollback = new Error("rollback export fixture");
    let forbidden = false;
    try {
      await sql`select public.enqueue_crm_export_job(${other}::uuid,'supporters','{}'::jsonb)`;
    } catch {
      forbidden = true;
    }
    expect(forbidden).toBe(true);
    try {
      await sql.begin(async (tx) => {
        await tx`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values(${actor}::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${actor + "@example.invalid"},'',now(),now(),now()),(${other}::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${other + "@example.invalid"},'',now(),now(),now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'treasurer','active'),(${other}::uuid,${other + "@example.invalid"},'staff','active')`;
        await tx`insert into public.supporter(name,email,language,tags,source) select 'Export fixture '||n,n::text||'@'||${marker}||'.invalid','en',array[${marker}],${marker} from generate_series(1,3) n`;
        const [job] =
          await tx`select public.enqueue_crm_export_job(${actor}::uuid,'supporters',${{ tag: marker, includeDeleted: false }}::jsonb) result`;
        expect(job.result.total).toBe(3);
        expect(job.result.status).toBe("pending");
        const jobId = job.result.id;
        const [creationAudit] =
          await tx`select detail from public.audit_log where action='export.job.create' and entity_id=${jobId}`;
        expect(JSON.stringify(creationAudit.detail)).not.toContain(marker);
        const [rights] =
          await tx`select has_function_privilege('anon','public.enqueue_crm_export_job(uuid,text,jsonb)','execute') anon,has_function_privilege('authenticated','public.enqueue_crm_export_job(uuid,text,jsonb)','execute') auth`;
        expect(rights).toEqual({ anon: false, auth: false });
        const [privateRights] = await tx`select
          has_function_privilege('anon','public.crm_export_job_download(uuid,uuid)','execute') anon_download,
          has_function_privilege('authenticated','public.append_crm_export_job_page(uuid,uuid,text,integer)','execute') auth_append,
          has_function_privilege('service_role','public.append_crm_export_job_page(uuid,uuid,text,integer)','execute') service_append,
          has_table_privilege('anon','public.crm_export_job','select') anon_job,
          has_table_privilege('authenticated','private.crm_export_artifact','select') auth_artifact`;
        expect(privateRights).toEqual({
          anon_download: false,
          auth_append: false,
          service_append: true,
          anon_job: false,
          auth_artifact: false,
        });
        const [rls] = await tx`select bool_and(relrowsecurity) enabled from pg_class
          where oid in ('public.crm_export_job'::regclass,'private.crm_export_artifact'::regclass)`;
        expect(rls.enabled).toBe(true);
        const [claimed] =
          await tx`select public.claim_crm_export_job(${randomUUID()}::uuid) result`;
        expect(claimed.result.id).toBe(jobId);
        const [page] =
          await tx`select public.crm_export_job_page(${jobId}::uuid,${claimed.result.lease_owner}::uuid,0,2) result`;
        expect(page.result.length).toBe(2);
        const [denied] =
          await tx`select public.crm_export_job_download(${jobId}::uuid,${other}::uuid) result`;
        expect(denied.result).toBeNull();
        const [completed] =
          await tx`select public.append_crm_export_job_page(${jobId}::uuid,${claimed.result.lease_owner}::uuid,'id,name\\n1,safe',3) result`;
        expect(completed.result.status).toBe("ready");
        const [download] =
          await tx`select public.crm_export_job_download(${jobId}::uuid,${actor}::uuid) result`;
        expect(download.result).toBe("id,name\\n1,safe");
        await tx`update public.admin_user set status='disabled' where auth_user_id=${actor}::uuid`;
        const [revoked] =
          await tx`select public.crm_export_job_download(${jobId}::uuid,${actor}::uuid) result`;
        expect(revoked.result).toBeNull();
        await tx`update public.admin_user set status='active' where auth_user_id=${actor}::uuid`;
        const [second] =
          await tx`select public.enqueue_crm_export_job(${actor}::uuid,'supporters',${{ tag: marker, includeDeleted: false }}::jsonb) result`;
        const [cancelled] =
          await tx`select public.cancel_crm_export_job(${second.result.id}::uuid,${actor}::uuid) result`;
        expect(cancelled.result).toBe(true);
        const [noCancelledDownload] =
          await tx`select public.crm_export_job_download(${second.result.id}::uuid,${actor}::uuid) result`;
        expect(noCancelledDownload.result).toBeNull();
        const [noSecondClaim] =
          await tx`select public.claim_crm_export_job(${randomUUID()}::uuid) result`;
        expect(noSecondClaim.result).toBeNull();
        const [third] =
          await tx`select public.enqueue_crm_export_job(${actor}::uuid,'supporters',${{ tag: marker, includeDeleted: false }}::jsonb) result`;
        const [thirdClaim] =
          await tx`select public.claim_crm_export_job(${randomUUID()}::uuid) result`;
        expect(thirdClaim.result.id).toBe(third.result.id);
        const [failed] =
          await tx`select public.fail_crm_export_job(${third.result.id}::uuid,${thirdClaim.result.lease_owner}::uuid,'synthetic_failure') result`;
        expect(failed.result).toBe(true);
        const [failureAudit] =
          await tx`select count(*)::integer n from public.audit_log where action='export.job.failed' and entity_id=${third.result.id}`;
        expect(failureAudit.n).toBe(1);
        const [fourth] =
          await tx`select public.enqueue_crm_export_job(${actor}::uuid,'supporters',${{ tag: marker, includeDeleted: false }}::jsonb) result`;
        await tx`update public.crm_export_job set status='processing',attempts=3,lease_until=clock_timestamp()-interval '1 second' where id=${fourth.result.id}::uuid`;
        const [exhaustedClaim] =
          await tx`select public.claim_crm_export_job(${randomUUID()}::uuid) result`;
        expect(exhaustedClaim.result).toBeNull();
        const [exhausted] =
          await tx`select status,error_code from public.crm_export_job where id=${fourth.result.id}::uuid`;
        expect(exhausted).toEqual({ status: "failed", error_code: "retry_exhausted" });
        const [exhaustedAudit] =
          await tx`select count(*)::integer n from public.audit_log where action='export.job.failed' and entity_id=${fourth.result.id}`;
        expect(exhaustedAudit.n).toBe(1);
        await tx`update public.crm_export_job set expires_at=clock_timestamp()-interval '1 second' where id=${jobId}::uuid`;
        const [expiredDownload] =
          await tx`select public.crm_export_job_download(${jobId}::uuid,${actor}::uuid) result`;
        expect(expiredDownload.result).toBeNull();
        const [cleaned] = await tx`select public.cleanup_expired_crm_export_jobs() result`;
        expect(cleaned.result).toBe(1);
        const [artifactCount] =
          await tx`select count(*)::integer n from private.crm_export_artifact where job_id=${jobId}::uuid`;
        expect(artifactCount.n).toBe(0);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await sql.close();
    }
  },
  30000,
);

test.skipIf(!allowed)(
  "5001 matching supporters and donations page without truncation",
  async () => {
    const sql = new SQL(raw!);
    const actor = randomUUID();
    const marker = randomUUID();
    const rollback = new Error("rollback large export fixture");
    try {
      await sql.begin(async (tx) => {
        await tx`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values(${actor}::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${actor + "@example.invalid"},'',now(),now(),now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'treasurer','active')`;
        await tx`insert into public.supporter(name,email,language,tags,source) select 'Large export '||n,n::text||'@'||${marker}||'.invalid','en',array[${marker}],${marker} from generate_series(1,5001) n`;
        await tx`insert into public.donation(supporter_id,amount_cents,purpose,type,status,method,receipt_requested) select id,10000,'general','one_time','succeeded','manual',false from public.supporter where source=${marker}`;
        for (const kind of ["supporters", "donations"]) {
          const [created] =
            await tx`select public.enqueue_crm_export_job(${actor}::uuid,${kind},${{ tag: marker, includeDeleted: false }}::jsonb) result`;
          expect(created.result.total).toBe(5001);
          const ids = new Set<string>();
          for (let offset = 0; offset < 5001; offset += 500) {
            const [claimed] =
              await tx`select public.claim_crm_export_job(${randomUUID()}::uuid) result`;
            expect(claimed.result.id).toBe(created.result.id);
            expect(claimed.result.processed).toBe(offset);
            const [page] =
              await tx`select public.crm_export_job_page(${created.result.id}::uuid,${claimed.result.lease_owner}::uuid,${offset},500) result`;
            const count = Math.min(500, 5001 - offset);
            expect(page.result.length).toBe(count);
            for (const row of page.result) ids.add(kind === "supporters" ? row.id : row.donationId);
            const [appended] =
              await tx`select public.append_crm_export_job_page(${created.result.id}::uuid,${claimed.result.lease_owner}::uuid,${offset === 0 ? "header" : "\\nchunk"},${count}) result`;
            expect(appended.result.processed).toBe(offset + count);
            expect(appended.result.status).toBe(offset + count === 5001 ? "ready" : "pending");
          }
          expect(ids.size).toBe(5001);
          const [available] =
            await tx`select public.crm_export_job_download(${created.result.id}::uuid,${actor}::uuid) result`;
          expect(available.result).toContain("header");
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await sql.close();
    }
  },
  120000,
);

test.skipIf(!allowed)(
  "two workers cannot claim the same job; cancellation fences late append",
  async () => {
    const first = new SQL(raw!);
    const second = new SQL(raw!);
    const actor = randomUUID();
    let jobId: string | null = null;
    try {
      await first`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values(${actor}::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${actor + "@example.invalid"},'',now(),now(),now())`;
      await first`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'treasurer','active')`;
      const [created] =
        await first`select public.enqueue_crm_export_job(${actor}::uuid,'supporters','{}'::jsonb) result`;
      jobId = created.result.id;
      const owners = [randomUUID(), randomUUID()];
      const [a, b] = await Promise.all([
        (async () =>
          (await first`select public.claim_crm_export_job(${owners[0]}::uuid) result`)[0].result)(),
        (async () =>
          (await second`select public.claim_crm_export_job(${owners[1]}::uuid) result`)[0]
            .result)(),
      ]);
      const winners = [a, b].filter((row) => row?.id === jobId);
      expect(winners).toHaveLength(1);
      const [cancelled] =
        await first`select public.cancel_crm_export_job(${jobId}::uuid,${actor}::uuid) result`;
      expect(cancelled.result).toBe(true);
      const [late] =
        await second`select public.append_crm_export_job_page(${jobId}::uuid,${winners[0].lease_owner}::uuid,'header',0) result`;
      expect(late.result).toBeNull();
      const [artifact] =
        await first`select count(*)::integer n from private.crm_export_artifact where job_id=${jobId}::uuid`;
      expect(artifact.n).toBe(0);
    } finally {
      if (jobId) {
        await first`delete from public.audit_log where entity='crm_export' and entity_id=${jobId}`;
        await first`delete from public.crm_export_job where id=${jobId}::uuid`;
      }
      await first`delete from public.admin_user where auth_user_id=${actor}::uuid`;
      await first`delete from auth.users where id=${actor}::uuid`;
      await first.close();
      await second.close();
    }
  },
  30000,
);
