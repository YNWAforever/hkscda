import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.MEDIA_REPAIR_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  const dedicated = target.port === "57322" && target.pathname === "/postgres";
  const clone = target.port === "52322" && target.pathname === "/audit_pr135_20260929";
  const ci =
    process.env.CI === "true" && target.port === "55322" && target.pathname === "/postgres";
  if (
    target.hostname !== "127.0.0.1" ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.search ||
    target.hash ||
    !(dedicated || clone || ci)
  )
    throw new Error("Media repair fixtures require an explicit dedicated loopback DB");
}
const enabled = Boolean(databaseUrl) && process.env.MEDIA_REPAIR_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)(
  "500 repair intents advance after the first 50 fail",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback synthetic media repair fixture");
    const actor = crypto.randomUUID();
    const animal = crypto.randomUUID();
    const version = crypto.randomUUID();
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'staff','active')",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.animals(id,type,name,gender,age,status,publication_state,adoption_eligible,sponsorship_eligible) values($1::uuid,'cat','Synthetic repair animal','female','2','available','published',true,false)",
          [animal],
        );
        await tx.unsafe(
          "insert into public.animal_publication_version(id,animal_id,body,revision,published_by,reason) values($1::uuid,$2::uuid,jsonb_build_object('publication_state','draft'),1,$3::uuid,'synthetic repair fixture')",
          [version, animal, actor],
        );
        await tx.unsafe(
          "insert into public.animal_publication_media_copy(public_path,publication_version_id,animal_id,source_path,public_url,created_at) select $1::text || '/versions/' || gs::text || '.jpg',$2::uuid,$3::uuid,$1::text || '/' || gs::text || '.jpg','https://example.test/' || gs::text || '.jpg',now() - interval '1 hour' + gs * interval '1 second' from generate_series(1,500) as gs",
          [animal, version, animal],
        );
        const [catalog] = (await tx.unsafe(
          "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='animal_publication_media_copy' and column_name='next_retry_at') as has_retry",
        )) as { has_retry: boolean }[];
        if (catalog.has_retry) {
          await tx.unsafe(
            "update public.animal_publication_media_copy set next_retry_at=created_at+interval '5 minutes' where animal_id=$1::uuid",
            [animal],
          );
        }
        await tx`set local role service_role`;
        const first = (await tx.unsafe(
          "select public_path,lease_token,attempts from public.claim_due_animal_publication_media_copies(now() - interval '5 minutes',50)",
        )) as { public_path: string; lease_token: string; attempts: number }[];
        expect(first).toHaveLength(50);
        await tx.unsafe(
          "update public.animal_publication_media_copy set copy_claimed_at=now()-interval '2 hours' where public_path=any(string_to_array($1,','))",
          [first.map((row) => row.public_path).join(",")],
        );
        const second = (await tx.unsafe(
          "select public_path,lease_token,attempts from public.claim_due_animal_publication_media_copies(now() - interval '5 minutes',50)",
        )) as { public_path: string; lease_token: string; attempts: number }[];
        expect(second).toHaveLength(50);
        const firstPaths = new Set(first.map((row) => row.public_path));
        expect(second.filter((row) => firstPaths.has(row.public_path))).toHaveLength(0);
        const seen = new Set([...first, ...second].map((row) => row.public_path));
        for (let batch = 0; batch < 8; batch++) {
          const next = (await tx.unsafe(
            "select public_path from public.claim_due_animal_publication_media_copies(now() - interval '5 minutes',50)",
          )) as { public_path: string }[];
          expect(next).toHaveLength(50);
          for (const item of next) {
            expect(seen.has(item.public_path)).toBe(false);
            seen.add(item.public_path);
          }
        }
        expect(seen.size).toBe(500);
        const stale = await tx.unsafe(
          "select public.mark_repaired_animal_publication_media($1,$2::uuid) as marked",
          [first[1].public_path, crypto.randomUUID()],
        );
        expect(stale[0].marked).toBe(false);
        const acknowledged = await tx.unsafe(
          "select public.mark_repaired_animal_publication_media($1,$2::uuid) as marked",
          [first[1].public_path, first[1].lease_token],
        );
        expect(acknowledged[0].marked).toBe(true);
        const repeated = await tx.unsafe(
          "select public.mark_repaired_animal_publication_media($1,$2::uuid) as marked",
          [first[1].public_path, first[1].lease_token],
        );
        expect(repeated[0].marked).toBe(false);
        await tx.unsafe(
          "update public.animal_publication_media_copy set repair_status='failed',repair_attempts=8,last_error_code='copy_failed',next_retry_at=null,lease_token=null,copy_claimed_at=null where public_path=$1",
          [first[0].public_path],
        );
        const queue = await tx.unsafe(
          "select public.get_media_repair_backlog($1::uuid,25) as value",
          [actor],
        );
        expect(queue[0].value.failed).toBe(1);
        expect(queue[0].value.items[0].lastErrorCode).toBe("copy_failed");
        expect(JSON.stringify(queue[0].value)).not.toContain(
          first[0].public_path.replace("/versions/", "/"),
        );
        const retried = await tx.unsafe(
          "select public.retry_failed_media_repair($1::uuid,'animal',$2,'Restored source image and verified checksum',true) as ok",
          [actor, first[0].public_path],
        );
        expect(retried[0].ok).toBe(true);
        const audit = await tx.unsafe(
          "select count(*)::integer as count from public.audit_log where action='media_repair.retry_failed' and entity_id=$1",
          [first[0].public_path],
        );
        expect(audit[0].count).toBe(1);
        const [grants] = await tx.unsafe(
          "select has_function_privilege('anon','public.retry_failed_media_repair(uuid,text,text,text,boolean)','EXECUTE') as anon,has_function_privilege('authenticated','public.retry_failed_media_repair(uuid,text,text,text,boolean)','EXECUTE') as authenticated,has_function_privilege('service_role','public.retry_failed_media_repair(uuid,text,text,text,boolean)','EXECUTE') as service",
        );
        expect(grants).toEqual({ anon: false, authenticated: false, service: true });
        let current = first[2];
        for (let attempt = 1; attempt <= 8; attempt++) {
          const failed = await tx.unsafe(
            "select public.fail_animal_publication_media_copy($1,$2::uuid,now()+interval '1 minute','copy_failed') as ok",
            [current.public_path, current.lease_token],
          );
          expect(failed[0].ok).toBe(true);
          if (attempt < 8) {
            await tx.unsafe(
              "update public.animal_publication_media_copy set next_retry_at=now()-interval '1 second' where public_path=$1",
              [current.public_path],
            );
            const claimed = (await tx.unsafe(
              "select public_path,lease_token,attempts from public.claim_due_animal_publication_media_copies(now()-interval '5 minutes',1)",
            )) as { public_path: string; lease_token: string; attempts: number }[];
            expect(claimed[0].public_path).toBe(current.public_path);
            expect(claimed[0].attempts).toBe(attempt + 1);
            current = claimed[0];
          }
        }
        const terminal = await tx.unsafe(
          "select repair_status,repair_attempts,next_retry_at from public.animal_publication_media_copy where public_path=$1",
          [current.public_path],
        );
        expect(terminal[0].repair_status).toBe("failed");
        expect(terminal[0].repair_attempts).toBe(8);
        expect(terminal[0].next_retry_at).toBeNull();
        await tx.unsafe(
          "update public.animal_publication_media_copy set repair_attempts=8,next_retry_at=now()-interval '1 second' where public_path=$1",
          [first[3].public_path],
        );
        await tx.unsafe(
          "select * from public.claim_due_animal_publication_media_copies(now()-interval '5 minutes',1)",
        );
        const crashed = await tx.unsafe(
          "select repair_status,last_error_code from public.animal_publication_media_copy where public_path=$1",
          [first[3].public_path],
        );
        expect(crashed[0].repair_status).toBe("failed");
        expect(crashed[0].last_error_code).toBe("lease_expired");
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
  30000,
);
