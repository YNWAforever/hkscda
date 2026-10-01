import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import {
  assertCloneUrl,
  assertSafeFixtureTables,
  hash,
} from "../../../supabase/rls-tests/helpers/productionSchemaClone";
import { createProofUploadIntent, verifyProofUploadIntent } from "./proofIntent.server";
import {
  cleanupExpiredSponsorshipProofUploads,
  type SponsorshipProofCleanupPort,
} from "./proofCleanup.server";

const url = process.env.R01_SPONSORSHIP_TEST_DATABASE_URL;
if (url) assertCloneUrl(url);
let db: SQL;
const rollback = new Error("synthetic rollback");
async function fixture(body: (tx: SQL) => Promise<void>) {
  try {
    await db.begin(async (tx) => {
      await body(tx as SQL);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
async function state(body: () => Promise<unknown>, expected: string) {
  let code: string | undefined;
  try {
    await body();
  } catch (error) {
    code = (error as { errno?: string }).errno;
  }
  expect(code).toBe(expected);
}
async function supporter(tx: SQL) {
  const id = randomUUID();
  await tx`insert into public.supporter(id,name,email) values(${id}::uuid,'Synthetic',${id + "@example.invalid"})`;
  return id;
}
function pledge(supporterId: string, status = "pending_payment") {
  return {
    supporter_id: supporterId,
    monthly_tier: "100",
    amount_cents: 10000,
    currency: "HKD",
    language: "en",
    notes: "Synthetic",
    contact_submission: { name: "Synthetic", email: "r01@example.invalid" },
    status,
    consent_email_requested: true,
    consent_whatsapp_requested: false,
  };
}
function proof(id: string, staff = false) {
  return {
    storage_path: `${id}/${staff ? "staff-synthetic.pdf" : "proof/synthetic.pdf"}`,
    file_name: "synthetic.pdf",
    file_type: "application/pdf",
    file_size: 100,
    payment_method: "fps",
    reference: "synthetic",
    amount_cents: 10000,
    payment_date: "2026-09-25",
  };
}
function token(id: string) {
  return {
    token_hash: hash(id),
    expires_at: "2099-01-01T00:00:00Z",
    submission_fingerprint: hash("payload:" + id),
  };
}
async function submit(
  tx: SQL,
  id: string,
  supporterId: string,
  withProof = false,
  preferences: unknown[] = [],
  overrideToken = token(id),
) {
  await tx`select public.create_public_sponsorship_pledge(p_pledge_id => ${id}::uuid,p_pledge => ${JSON.stringify(pledge(supporterId, withProof ? "provisional" : "pending_payment"))}::jsonb,p_preferences => ${JSON.stringify(preferences)}::jsonb,p_proof => ${withProof ? JSON.stringify(proof(id)) : null}::jsonb,p_token => ${JSON.stringify(overrideToken)}::jsonb)`;
}
async function intent(tx: SQL, id: string, staff = false) {
  const path = proof(id, staff).storage_path;
  if (staff)
    await tx`select public.reserve_staff_sponsorship_proof_upload(p_pledge_id => ${id}::uuid,p_storage_path => ${path})`;
  else
    await tx`insert into public.sponsorship_proof_upload_intent(pledge_id,storage_path,created_at,expires_at) values(${id}::uuid,${path},clock_timestamp()-interval '3 days',clock_timestamp()-interval '2 days')`;
  return path;
}

describe.skipIf(!url)("R01 sponsorship submission and intent compatibility", () => {
  beforeAll(async () => {
    db = new SQL(url!, { max: 6, prepare: false });
    await assertSafeFixtureTables(db, [
      "supporter",
      "consent",
      "sponsorship_pledge",
      "sponsorship_preference",
      "animals",
      "sponsorship_payment_proof",
      "public_status_token",
      "audit_log",
      "admin_user",
      "auth.users",
      "supporter_consent_intent",
      "message",
      "sponsorship_delivery_outbox",
      "sponsorship_proof_submission_command",
    ]);
  });
  afterAll(async () => {
    await db?.close();
  });
  test("current caller can query both intents and exact RPC contracts", async () => {
    await db`select pledge_id,storage_path,expires_at,submitted_at,cleanup_claimed_at from public.sponsorship_proof_upload_intent limit 0`;
    await db`select pledge_id,storage_path,expires_at,attached_at,cleanup_claimed_at from public.sponsorship_staff_proof_upload_intent limit 0`;
    for (const signature of [
      "mark_sponsorship_proof_upload_submitted()",
      "claim_expired_sponsorship_proof_uploads(timestamp with time zone,integer)",
      "reserve_staff_sponsorship_proof_upload(uuid,text)",
      "mark_staff_sponsorship_proof_attached()",
      "claim_expired_staff_sponsorship_proof_uploads(timestamp with time zone,integer)",
      "create_public_sponsorship_pledge(uuid,jsonb,jsonb,jsonb,jsonb)",
    ]) {
      const [r] = await db`select to_regprocedure(${"public." + signature})::text name`;
      expect(r.name).not.toBeNull();
    }
  });
  test("clients cannot access either intent or execute service RPCs, including trigger functions", async () => {
    for (const role of ["anon", "authenticated"])
      for (const query of [
        "select * from public.sponsorship_proof_upload_intent",
        "delete from public.sponsorship_staff_proof_upload_intent",
        "select public.claim_expired_sponsorship_proof_uploads(now(),50)",
        "select public.claim_expired_staff_sponsorship_proof_uploads(now(),50)",
        "select public.reserve_staff_sponsorship_proof_upload(null,null)",
        "select public.create_public_sponsorship_pledge(null,null,null,null,null)",
        "select public.mark_sponsorship_proof_upload_submitted()",
        "select public.mark_staff_sponsorship_proof_attached()",
      ])
        await state(
          () =>
            db.begin(async (tx) => {
              await tx.unsafe(`set local role ${role}`);
              await tx.unsafe(query);
            }),
          "42501",
        );
    const rows =
      await db`select proname,pg_get_userbyid(proowner) owner,prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where pronamespace='public'::regnamespace and proname in ('mark_sponsorship_proof_upload_submitted','mark_staff_sponsorship_proof_attached','create_public_sponsorship_pledge')`;
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.owner).toBe("postgres");
      expect(r.prosecdef).toBe(false);
      expect(r.proconfig).toEqual(['search_path=""']);
      expect(r.result).toBe(r.proname.startsWith("mark_") ? "trigger" : "void");
    }
  });
  test("public atomic pledge commits proof, token fingerprint, consent intent and local outbox together", async () =>
    fixture(async (tx) => {
      const s = await supporter(tx),
        id = randomUUID();
      await tx`set local role service_role`;
      await intent(tx, id);
      await submit(tx, id, s, true);
      const [r] =
        await tx`select (select count(*)::int from public.sponsorship_pledge where id=${id}::uuid) pledge,(select count(*)::int from public.sponsorship_payment_proof where pledge_id=${id}::uuid) proof,(select submission_fingerprint from public.public_status_token where entity_id=${id}::uuid) fingerprint,(select submitted_at is not null from public.sponsorship_proof_upload_intent where pledge_id=${id}::uuid) submitted,(select count(*)::int from public.supporter_consent_intent where submission_id=${id}::uuid) consent,(select count(*)::int from public.sponsorship_delivery_outbox where pledge_id=${id}::uuid) outbox`;
      expect(r).toMatchObject({
        pledge: 1,
        proof: 1,
        fingerprint: token(id).submission_fingerprint,
        submitted: true,
        consent: 1,
        outbox: 1,
      });
      const [money] = await tx`select count(*)::int count from public.payment`;
      expect(money.count).toBe(0);
    }));
  test("a real selected animal commits atomically with the public pledge and fingerprint", async () =>
    fixture(async (tx) => {
      const s = await supporter(tx),
        id = randomUUID(),
        animal = randomUUID();
      await tx`set local role service_role`;
      await tx`insert into public.animals(id,type,name,gender,age,status,publication_state,adoption_eligible,sponsorship_eligible) values(${animal}::uuid,'cat','Synthetic selected cat','female','2 歲','available','published',false,true)`;
      await submit(tx, id, s, false, [
        {
          sponsor_animal_id: animal,
          rank: 1,
          animal_name_snapshot: "Synthetic selected cat",
          animal_type_snapshot: "cat",
        },
      ]);
      const [r] =
        await tx`select (select sponsor_animal_id from public.sponsorship_preference where pledge_id=${id}::uuid) animal,(select submission_fingerprint from public.public_status_token where entity_id=${id}::uuid) fingerprint`;
      expect(r).toEqual({ animal, fingerprint: token(id).submission_fingerprint });
    }));
  test("token constraint or validly typed nonexistent animal rolls back every atomic pledge component", async () => {
    for (const kind of ["token", "preference"])
      await fixture(async (tx) => {
        const s = await supporter(tx),
          id = randomUUID();
        await tx`set local role service_role`;
        await intent(tx, id);
        await tx`savepoint failed_submit`;
        await state(
          () =>
            submit(
              tx,
              id,
              s,
              true,
              kind === "preference"
                ? [
                    {
                      sponsor_animal_id: randomUUID(),
                      rank: 1,
                      animal_name_snapshot: "Synthetic",
                      animal_type_snapshot: "cat",
                    },
                  ]
                : [],
              kind === "token" ? { ...token(id), submission_fingerprint: "wrong" } : token(id),
            ),
          "23514",
        );
        await tx`rollback to savepoint failed_submit`;
        const [r] =
          await tx`select (select count(*)::int from public.sponsorship_pledge where id=${id}::uuid) pledge,(select count(*)::int from public.public_status_token where entity_id=${id}::uuid) token,(select count(*)::int from public.sponsorship_payment_proof where pledge_id=${id}::uuid) proof,(select submitted_at from public.sponsorship_proof_upload_intent where pledge_id=${id}::uuid) submitted,(select count(*)::int from public.sponsorship_delivery_outbox where pledge_id=${id}::uuid) outbox`;
        expect(r).toEqual({ pledge: 0, token: 0, proof: 0, submitted: null, outbox: 0 });
      });
  });
  test("committed retry retains exact token/fingerprint and rejects duplicate or changed token facts", async () =>
    fixture(async (tx) => {
      const s = await supporter(tx),
        id = randomUUID();
      await tx`set local role service_role`;
      await submit(tx, id, s);
      await tx`savepoint duplicate`;
      await state(() => submit(tx, id, s), "23505");
      await tx`rollback to savepoint duplicate`;
      const [r] =
        await tx`select token_hash,submission_fingerprint from public.public_status_token where entity_id=${id}::uuid`;
      expect(r).toEqual({
        token_hash: token(id).token_hash,
        submission_fingerprint: token(id).submission_fingerprint,
      });
      expect(r.submission_fingerprint).not.toBe(hash("changed")); // HTTP retry compares this exact stored value.
    }));
  test("signed ownership and SQL path/expiry constraints reject forged input", async () => {
    const id = randomUUID(),
      subject = { pledgeId: id, path: proof(id).storage_path },
      now = new Date("2026-10-01T00:00:00Z"),
      signed = createProofUploadIntent(subject, { secret: "inert-test-secret", now });
    expect(verifyProofUploadIntent(signed, subject, { secret: "inert-test-secret", now })).toBe(
      true,
    );
    expect(
      verifyProofUploadIntent(
        signed,
        { ...subject, pledgeId: randomUUID() },
        { secret: "inert-test-secret", now },
      ),
    ).toBe(false);
    expect(
      verifyProofUploadIntent(
        signed,
        { ...subject, path: "different" },
        { secret: "inert-test-secret", now },
      ),
    ).toBe(false);
    expect(
      verifyProofUploadIntent(signed, subject, {
        secret: "inert-test-secret",
        now: new Date("2026-10-03T00:00:00Z"),
      }),
    ).toBe(false);
    for (const staff of [false, true])
      await state(
        () =>
          db.begin(async (tx) => {
            await tx`set local role service_role`;
            if (staff)
              await tx`select public.reserve_staff_sponsorship_proof_upload(${id}::uuid,'foreign/staff.pdf')`;
            else
              await tx`insert into public.sponsorship_proof_upload_intent(pledge_id,storage_path,expires_at) values(${id}::uuid,'foreign/proof/file',clock_timestamp()+interval '1 day')`;
          }),
        "23514",
      );
  });
  test("claims fence late proof attachment, stale claims recover, submitted objects stay excluded", async () => {
    for (const staff of [false, true])
      await fixture(async (tx) => {
        const s = await supporter(tx),
          id = randomUUID();
        await tx`set local role service_role`;
        await submit(tx, id, s);
        await intent(tx, id, staff);
        if (staff)
          await tx`update public.sponsorship_staff_proof_upload_intent set created_at=clock_timestamp()-interval '3 days',expires_at=clock_timestamp()-interval '2 days' where pledge_id=${id}::uuid`;
        const claim = async () =>
          staff
            ? await tx`select * from public.claim_expired_staff_sponsorship_proof_uploads(clock_timestamp(),1)`
            : await tx`select * from public.claim_expired_sponsorship_proof_uploads(clock_timestamp(),1)`;
        expect((await claim()).length).toBe(1);
        expect((await claim()).length).toBe(0);
        await tx`savepoint attach`;
        await state(
          () =>
            tx`insert into public.sponsorship_payment_proof(pledge_id,storage_path,payment_method,amount_cents,payment_date) values(${id}::uuid,${proof(id, staff).storage_path},'fps',10000,'2026-09-25')`,
          "55000",
        );
        await tx`rollback to savepoint attach`;
        if (staff)
          await tx`update public.sponsorship_staff_proof_upload_intent set cleanup_claimed_at=clock_timestamp()-interval '2 hours' where pledge_id=${id}::uuid`;
        else
          await tx`update public.sponsorship_proof_upload_intent set cleanup_claimed_at=clock_timestamp()-interval '2 hours' where pledge_id=${id}::uuid`;
        expect((await claim()).length).toBe(1);
        if (staff)
          await tx`update public.sponsorship_staff_proof_upload_intent set cleanup_claimed_at=null where pledge_id=${id}::uuid`;
        else
          await tx`update public.sponsorship_proof_upload_intent set cleanup_claimed_at=null where pledge_id=${id}::uuid`;
        await tx`insert into public.sponsorship_payment_proof(pledge_id,storage_path,payment_method,amount_cents,payment_date) values(${id}::uuid,${proof(id, staff).storage_path},'fps',10000,'2026-09-25')`;
        expect((await claim()).length).toBe(0);
      });
  });
  test("partial Storage deletion response keeps SQL claim and blocks late attachment", async () =>
    fixture(async (tx) => {
      const s = await supporter(tx),
        id = randomUUID();
      await tx`set local role service_role`;
      await submit(tx, id, s);
      await intent(tx, id);
      let release = false;
      const port: SponsorshipProofCleanupPort = {
        claim: async () => {
          const rows =
            await tx`select * from public.claim_expired_sponsorship_proof_uploads(clock_timestamp(),50)`;
          return rows.map((r: { pledge_id: string; storage_path: string; claimed_at: string }) => ({
            pledgeId: r.pledge_id,
            storagePath: r.storage_path,
            claimedAt: r.claimed_at,
          }));
        },
        isReferenced: async () => false,
        remove: async () => {
          throw new Error("synthetic lost deletion response");
        },
        preserve: async () => {
          throw new Error("unexpected");
        },
        finish: async () => {
          throw new Error("unexpected");
        },
        release: async () => {
          release = true;
        },
      };
      expect(await cleanupExpiredSponsorshipProofUploads(port, { error: () => {} })).toEqual({
        removed: 0,
        preserved: 0,
        failed: 1,
      });
      expect(release).toBe(false);
      await tx`savepoint late`;
      await state(
        () =>
          tx`insert into public.sponsorship_payment_proof(pledge_id,storage_path,payment_method,amount_cents,payment_date) values(${id}::uuid,${proof(id).storage_path},'fps',10000,'2026-09-25')`,
        "55000",
      );
      await tx`rollback to savepoint late`;
    }));
  test("audited staff proof retries preserve one proof, audit and attachment; suspension and role changes fence retries", async () =>
    fixture(async (tx) => {
      const s = await supporter(tx),
        id = randomUUID(),
        actor = randomUUID(),
        key = randomUUID();
      await tx`insert into auth.users(id,email) values(${actor}::uuid,${actor + "@example.invalid"})`;
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
      await submit(tx, id, s);
      await intent(tx, id, true);
      const p = proof(id, true),
        payment = {
          storagePath: p.storage_path,
          fileName: p.file_name,
          fileType: p.file_type,
          fileSize: p.file_size,
          paymentMethod: p.payment_method,
          reference: p.reference,
          amountCents: p.amount_cents,
          paymentDate: p.payment_date,
          note: "Synthetic",
        };
      const record = async (value = payment) => {
        const [r] =
          await tx`select public.record_exact_sponsorship_payment_proof(p_actor => ${actor}::uuid,p_pledge => ${id}::uuid,p_key => ${key}::uuid,p_payment => ${JSON.stringify(value)}::jsonb) id`;
        return r.id;
      };
      await tx`set local role service_role`;
      const first = await record();
      expect(await record()).toBe(first);
      // The command table is intentionally inaccessible to service_role.
      await tx`set local role postgres`;
      const [r] =
        await tx`select (select count(*)::int from public.sponsorship_payment_proof where pledge_id=${id}::uuid) proof,(select count(*)::int from public.audit_log where entity_id=${id}) audit,(select attached_at is not null from public.sponsorship_staff_proof_upload_intent where pledge_id=${id}::uuid) attached,(select count(*)::int from public.sponsorship_proof_submission_command where actor_user_id=${actor}::uuid) commands,(select followup_version::int from public.sponsorship_pledge where id=${id}::uuid) version,(select revision::int from public.sponsorship_payment_proof where id=${first}::uuid) revision`;
      expect(r).toEqual({
        proof: 1,
        audit: 1,
        attached: true,
        commands: 1,
        version: 2,
        revision: 1,
      });
      await tx`set local role service_role`;
      await tx`savepoint changed`;
      await state(() => record({ ...payment, amountCents: 20000 }), "P0001");
      await tx`rollback to savepoint changed`;
      await tx`set local role postgres`;
      await tx`update public.admin_user set status='disabled' where auth_user_id=${actor}::uuid`;
      await tx`set local role service_role`;
      await tx`savepoint suspended`;
      await state(() => record(), "42501");
      await tx`rollback to savepoint suspended`;
      await tx`set local role postgres`;
      await tx`update public.admin_user set status='active',role='treasurer' where auth_user_id=${actor}::uuid`;
      await tx`set local role service_role`;
      await tx`savepoint role_change`;
      await state(() => record(), "42501");
      await tx`rollback to savepoint role_change`;
    }));
  test("audit failure rolls back staff proof, attachment, status, command and queued delivery", async () =>
    fixture(async (tx) => {
      const s = await supporter(tx),
        id = randomUUID(),
        actor = randomUUID(),
        key = randomUUID();
      await tx`insert into auth.users(id,email) values(${actor}::uuid,${actor + "@example.invalid"})`;
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
      await submit(tx, id, s);
      await intent(tx, id, true);
      await tx`alter table public.audit_log add constraint r01_synthetic_audit_failure check(false) not valid`;
      const p = proof(id, true),
        payment = {
          storagePath: p.storage_path,
          fileName: p.file_name,
          fileType: p.file_type,
          fileSize: p.file_size,
          paymentMethod: p.payment_method,
          reference: p.reference,
          amountCents: p.amount_cents,
          paymentDate: p.payment_date,
        };
      await tx`savepoint audit_failure`;
      await tx`set local role service_role`;
      await state(
        () =>
          tx`select public.record_exact_sponsorship_payment_proof(${actor}::uuid,${id}::uuid,${key}::uuid,${JSON.stringify(payment)}::jsonb)`,
        "23514",
      );
      await tx`rollback to savepoint audit_failure`;
      const [r] =
        await tx`select (select count(*)::int from public.sponsorship_payment_proof where pledge_id=${id}::uuid) proof,(select attached_at from public.sponsorship_staff_proof_upload_intent where pledge_id=${id}::uuid) attached,(select status from public.sponsorship_pledge where id=${id}::uuid) status,(select count(*)::int from public.sponsorship_proof_submission_command where actor_user_id=${actor}::uuid) commands,(select count(*)::int from public.sponsorship_delivery_outbox where pledge_id=${id}::uuid) outbox`;
      expect(r).toEqual({
        proof: 0,
        attached: null,
        status: "pending_payment",
        commands: 0,
        outbox: 0,
      });
    }));
  test("concurrent claims skip a real held intent lock and staff reservation retries converge", async () => {
    const id = randomUUID();
    await intent(db, id);
    let unlock!: () => void, locked!: () => void;
    const hold = new Promise<void>((resolve) => {
        unlock = resolve;
      }),
      ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
    const holder = db.begin(async (tx) => {
      await tx`select * from public.sponsorship_proof_upload_intent where pledge_id=${id}::uuid for update`;
      locked();
      await hold;
    });
    try {
      await ready;
      const rows = await db.begin(async (tx) => {
        await tx`set local role service_role`;
        return tx`select * from public.claim_expired_sponsorship_proof_uploads(clock_timestamp(),50)`;
      });
      expect(rows.some((r: { pledge_id: string }) => r.pledge_id === id)).toBe(false);
    } finally {
      unlock();
      await holder;
    }
    const claims = await Promise.all(
      [1, 2].map(() =>
        db.begin(async (tx) => {
          await tx`set local role service_role`;
          return tx`select * from public.claim_expired_sponsorship_proof_uploads(clock_timestamp(),50)`;
        }),
      ),
    );
    expect(claims.flat().filter((r: { pledge_id: string }) => r.pledge_id === id).length).toBe(1);
    await db`delete from public.sponsorship_proof_upload_intent where pledge_id=${id}::uuid`;
    await Promise.all(
      [1, 2].map(() =>
        db.begin(async (tx) => {
          await tx`set local role service_role`;
          await tx`select public.reserve_staff_sponsorship_proof_upload(${id}::uuid,${proof(id, true).storage_path})`;
        }),
      ),
    );
    const [r] =
      await db`select count(*)::int count from public.sponsorship_staff_proof_upload_intent where pledge_id=${id}::uuid`;
    expect(r.count).toBe(1);
    await db`delete from public.sponsorship_staff_proof_upload_intent where pledge_id=${id}::uuid`;
  });
});
