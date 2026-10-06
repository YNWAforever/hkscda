import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import {
  assertCloneUrl,
  assertSafeFixtureTables,
} from "../../../supabase/rls-tests/helpers/productionSchemaClone";
import {
  archive,
  expiredIntent,
  reserve,
  savepoint,
  seedAnimal,
  seedLinkedAnimalFacts,
  linkedAnimalFacts,
  sqlAnimalClient,
} from "./draftIntent.testSupport";
import { createAnimalDraftPhotoUploadHandler } from "./draftUpload.server";
import {
  cleanupExpiredAnimalDraftUploads,
  createSupabaseAnimalDraftUploadCleanupPort,
} from "./draftUploadCleanup.server";

const url = process.env.R01_ANIMAL_DRAFT_TEST_DATABASE_URL;
if (url) assertCloneUrl(url);
let db: SQL;
const rollback = new Error("Task5 synthetic fixture rollback");
async function fixture(run: (tx: SQL) => Promise<void>) {
  try {
    await db.begin(async (tx) => {
      await run(tx as SQL);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
async function state(tx: SQL, run: (s: SQL) => Promise<unknown>, wanted: string) {
  let code: string | undefined;
  try {
    if (tx === db) await db.begin(async (s) => run(s as SQL));
    else await savepoint(tx, run);
  } catch (error) {
    code = (error as { errno?: string }).errno;
  }
  expect(code).toBe(wanted);
}
async function draft(tx: SQL, animal: string, actor: string, body: object) {
  return savepoint(tx, async (s) => {
    await s`set local role service_role`;
    await s`insert into public.animal_draft(id,body,updated_by) values(${animal}::uuid,${JSON.stringify(body)}::jsonb,${actor}::uuid) on conflict(id) do update set body=excluded.body,revision=public.animal_draft.revision+1`;
    await s`set local role postgres`;
  });
}
const quiet = { error() {} };
const future = () => new Date("2099-01-01T00:00:00Z");

describe.skipIf(!url)("R01 animal draft intent and audited archive", () => {
  beforeAll(async () => {
    db = new SQL(url!, { max: 6, prepare: false });
    await assertSafeFixtureTables(db, [
      "auth.users",
      "admin_user",
      "animals",
      "animal_draft",
      "audit_log",
      "supporter",
      "sponsorship_pledge",
      "supporter_consent_intent",
      "sponsorship_preference",
      "coordinator_status",
      "adoption_applications",
      "adoption_case",
      "animal_match",
      "animal_profile_internal",
      "adoption_followup",
      "adoption_application_animal_preference",
    ]);
  });
  afterAll(async () => {
    await db?.close();
  });
  test("current caller requires the exact missing-target contracts", async () => {
    await db`select storage_path,animal_id,created_at,expires_at,attached_at,cleanup_claimed_at from public.animal_draft_image_upload_intent limit 0`;
    for (const name of [
      "public.reserve_animal_draft_image_upload(uuid,text)",
      "public.mark_animal_draft_image_attached()",
      "public.claim_expired_animal_draft_image_uploads(timestamptz,integer)",
      "public.set_animal_archived_with_audit(uuid,uuid,boolean)",
    ]) {
      const [row] = await db`select to_regprocedure(${name})::text name`;
      expect(row.name).not.toBeNull();
    }
    const [row] =
      await db`select count(*)::int count from pg_trigger where tgrelid='public.animal_draft'::regclass and tgname='animal_draft_image_attached' and tgenabled='O' and not tgisinternal`;
    expect(row.count).toBe(1);
  });
  test("direct clients cannot access intents or execute the four functions", async () => {
    for (const role of ["anon", "authenticated"])
      for (const sql of [
        "select * from public.animal_draft_image_upload_intent",
        "insert into public.animal_draft_image_upload_intent(storage_path,animal_id,expires_at) values('bad',null,now())",
        "update public.animal_draft_image_upload_intent set attached_at=now()",
        "delete from public.animal_draft_image_upload_intent",
        "select public.reserve_animal_draft_image_upload(null,null)",
        "select public.mark_animal_draft_image_attached()",
        "select public.claim_expired_animal_draft_image_uploads(now(),50)",
        "select public.set_animal_archived_with_audit(null,null,true)",
      ])
        await state(
          db,
          async (s) => {
            await s.unsafe(`set local role ${role}`);
            await s.unsafe(sql);
          },
          "42501",
        );
    const rows =
      await db`select pg_get_userbyid(proowner) owner,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('reserve_animal_draft_image_upload','mark_animal_draft_image_attached','claim_expired_animal_draft_image_uploads','set_animal_archived_with_audit')`;
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.owner).toBe("postgres");
      expect(r.prosecdef).toBe(false);
      expect(r.proconfig).toEqual(['search_path=""']);
    }
    for (const role of ["anon", "authenticated"])
      await state(
        db,
        async (s) => {
          await s.unsafe(`set local role ${role}`);
          await s`select private.require_animal_archive_actor(null)`;
        },
        "42501",
      );
    for (const sql of [
      "select id from auth.users limit 0",
      "select email from auth.users limit 0",
      "select id from auth.users for update",
      "update auth.users set banned_until=now() where false",
    ])
      await state(
        db,
        async (s) => {
          await s`set local role service_role`;
          await s.unsafe(sql);
        },
        "42501",
      );
    const authColumns =
      await db`select attname,attgenerated,has_column_privilege('service_role',attrelid,attnum,'SELECT') readable,has_column_privilege('service_role',attrelid,attnum,'UPDATE') writable from pg_attribute where attrelid='auth.users'::regclass and attnum>0 and not attisdropped order by attnum`;
    expect(authColumns.length).toBeGreaterThan(0);
    for (const column of authColumns) {
      expect(column.readable).toBe(false);
      expect(column.writable).toBe(false);
      const quoted = '"' + String(column.attname).replaceAll('"', '""') + '"';
      for (const sql of [
        `select ${quoted} from auth.users limit 0`,
        ...(column.attgenerated === ""
          ? [`update auth.users set ${quoted}=${quoted} where false`]
          : []),
      ])
        await state(
          db,
          async (s) => {
            await s`set local role service_role`;
            await s.unsafe(sql);
          },
          "42501",
        );
    }
    const [helper] =
      await db`select pg_get_userbyid(proowner) owner,prosecdef,proconfig from pg_proc where oid='private.require_animal_archive_actor(uuid)'::regprocedure`;
    expect(helper).toEqual({ owner: "postgres", prosecdef: true, proconfig: ['search_path=""'] });
  });
  test.each(["missing Auth", "missing admin", "treasurer", "pending", "disabled", "suspended"])(
    "archive rejects %s actor before audit or mutation",
    async (kind) =>
      fixture(async (tx) => {
        const f = await seedAnimal(tx);
        let actor = f.actor;
        if (kind === "missing Auth") actor = randomUUID();
        if (kind === "missing admin") actor = f.other;
        if (kind === "treasurer")
          await tx`update public.admin_user set role='treasurer' where auth_user_id=${f.actor}::uuid`;
        if (kind === "pending" || kind === "disabled")
          await tx`update public.admin_user set status=${kind} where auth_user_id=${f.actor}::uuid`;
        if (kind === "suspended")
          await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${f.actor}::uuid`;
        await state(tx, (s) => archive(s, actor, f.animal), "42501");
        const [row] =
          await tx`select retired_at,(select count(*)::int from public.audit_log where entity_id=${f.animal}) audits from public.animals where id=${f.animal}::uuid`;
        expect(row).toEqual({ retired_at: null, audits: 0 });
      }),
  );
  test("archive and unarchive retry without duplicate audit and preserve linked facts", async () =>
    fixture(async (tx) => {
      const f = await seedAnimal(tx);
      await tx`insert into public.animal_profile_internal(animal_id,internal_remarks) values(${f.animal}::uuid,'Synthetic retained medical history')`;
      await draft(tx, f.animal, f.actor, { title: "Synthetic preserved draft" });
      await seedLinkedAnimalFacts(tx, f.animal);
      const before = await linkedAnimalFacts(tx, f.animal);
      const first = await archive(tx, f.actor, f.animal);
      expect(first.kind).toBe("archived");
      const retry = await archive(tx, f.actor, f.animal);
      expect(retry).toEqual({ ...first, kind: "unchanged" });
      expect((await archive(tx, f.actor, f.animal, false)).kind).toBe("restored");
      expect((await archive(tx, f.actor, f.animal, false)).kind).toBe("unchanged");
      const after = await linkedAnimalFacts(tx, f.animal);
      expect(after).toEqual(before);
      const rows =
        await tx`select actor_user_id,detail from public.audit_log where entity_id=${f.animal} order by timestamp`;
      expect(rows).toHaveLength(2);
      expect(rows[0].actor_user_id).toBe(f.actor);
      expect(rows[0].detail.changed.retired_at.to).toBe(first.retired_at);
      expect((await archive(tx, f.actor, randomUUID())).kind).toBe("not_found");
      await tx`update public.admin_user set role='admin' where auth_user_id=${f.actor}::uuid`;
      expect((await archive(tx, f.actor, f.animal)).kind).toBe("archived");
    }));
  test("audit failure rolls back archive and retry state", async () =>
    fixture(async (tx) => {
      const f = await seedAnimal(tx);
      const [before] =
        await tx`select to_jsonb(a) value from public.animals a where id=${f.animal}::uuid`;
      await tx`alter table public.audit_log add constraint r01_task5_fail_audit check(action<>'animals.update')`;
      await state(tx, (s) => archive(s, f.actor, f.animal), "23514");
      const [after] =
        await tx`select to_jsonb(a) value from public.animals a where id=${f.animal}::uuid`;
      expect(after).toEqual(before);
      await tx`alter table public.audit_log drop constraint r01_task5_fail_audit`;
      expect((await archive(tx, f.actor, f.animal)).kind).toBe("archived");
    }));
  test("reserve validates path/expiry, renews one intent and refuses a cleanup claim", async () =>
    fixture(async (tx) => {
      const f = await seedAnimal(tx),
        path = f.animal + "/v/photo.jpg";
      await reserve(tx, f.animal, path);
      await reserve(tx, f.animal, path);
      const [row] =
        await tx`select count(*)::int count,bool_and(expires_at>created_at) valid from public.animal_draft_image_upload_intent where storage_path=${path}`;
      expect(row).toEqual({ count: 1, valid: true });
      await state(tx, (s) => reserve(s, f.animal, "different/photo.jpg"), "23514");
      await state(
        tx,
        (s) => s`select public.reserve_animal_draft_image_upload(null,null)`,
        "22023",
      );
      await tx`update public.animal_draft_image_upload_intent set cleanup_claimed_at=now() where storage_path=${path}`;
      await state(tx, (s) => reserve(s, f.animal, path), "55000");
    }));
  test("trigger attaches primary and gallery paths atomically and fences late saves", async () =>
    fixture(async (tx) => {
      const f = await seedAnimal(tx),
        p = await expiredIntent(tx, f.animal),
        g = await expiredIntent(tx, f.animal);
      await draft(tx, f.animal, f.actor, {
        draft_image_path: p,
        gallery: [{ draft_path: g }, { draft_path: g }],
      });
      const rows =
        await tx`select attached_at is not null attached from public.animal_draft_image_upload_intent where animal_id=${f.animal}::uuid`;
      expect(rows.map((r: { attached: boolean }) => r.attached)).toEqual([true, true]);
      const late = await expiredIntent(tx, f.animal);
      await tx`update public.animal_draft_image_upload_intent set cleanup_claimed_at=now() where storage_path=${late}`;
      await state(tx, (s) => draft(s, f.animal, f.actor, { draft_image_path: late }), "55000");
      const [row] = await tx`select body from public.animal_draft where id=${f.animal}::uuid`;
      expect(row.body.draft_image_path).toBe(p);
      expect(
        await tx`select * from public.claim_expired_animal_draft_image_uploads(now(),50)`,
      ).toHaveLength(0);
    }));
  test("actual upload handler reserves before inert Storage and keeps intent on ambiguous signed failure", async () =>
    fixture(async (tx) => {
      const f = await seedAnimal(tx),
        adapter = sqlAnimalClient(tx);
      const request = () =>
        new Request("http://synthetic.invalid/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            animalId: f.animal,
            photo: { fileName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 20 },
          }),
        });
      const handler = createAnimalDraftPhotoUploadHandler({
        client: adapter.client,
        requireAnimalAdmin: async () => ({}),
        newVersion: () => "fixed",
      });
      const response = await handler.createUploadUrl({ request: request() });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(adapter.signed).toEqual([f.animal + "/fixed/photo.jpg"]);
      const failed = sqlAnimalClient(tx, { signed: true });
      const failing = createAnimalDraftPhotoUploadHandler({
        client: failed.client,
        requireAnimalAdmin: async () => ({}),
        newVersion: () => "failed",
      });
      let signedFailure: unknown;
      try {
        await failing.createUploadUrl({ request: request() });
      } catch (error) {
        signedFailure = error;
      }
      expect(signedFailure).toBeInstanceOf(Error);
      expect((signedFailure as Error).message).toBe("inert signed failure");
      const [row] =
        await tx`select count(*)::int count from public.animal_draft_image_upload_intent where storage_path=${f.animal + "/failed/photo.jpg"}`;
      expect(row.count).toBe(1);
      expect(failed.signed).toHaveLength(0);
    }));
  test("actual cleanup retains ambiguous removal claim, finishes other items and retries after lease", async () =>
    fixture(async (tx) => {
      const f = await seedAnimal(tx),
        bad = await expiredIntent(tx, f.animal),
        good = await expiredIntent(tx, f.animal);
      const adapter = sqlAnimalClient(tx, { remove: new Set([bad]) }),
        port = createSupabaseAnimalDraftUploadCleanupPort(adapter.client, future);
      expect(await cleanupExpiredAnimalDraftUploads(port, quiet)).toEqual({
        removed: 1,
        failed: 1,
      });
      expect(adapter.removed.sort()).toEqual([bad, good].sort());
      const [row] =
        await tx`select storage_path,cleanup_claimed_at is not null claimed from public.animal_draft_image_upload_intent where animal_id=${f.animal}::uuid`;
      expect(row).toEqual({ storage_path: bad, claimed: true });
      await state(tx, (s) => draft(s, f.animal, f.actor, { draft_image_path: bad }), "55000");
      expect(await cleanupExpiredAnimalDraftUploads(port, quiet)).toEqual({
        removed: 0,
        failed: 0,
      });
      await tx`update public.animal_draft_image_upload_intent set cleanup_claimed_at=clock_timestamp()-interval '2 hours' where storage_path=${bad}`;
      expect(
        await cleanupExpiredAnimalDraftUploads(
          createSupabaseAnimalDraftUploadCleanupPort(sqlAnimalClient(tx).client, future),
          quiet,
        ),
      ).toEqual({ removed: 1, failed: 0 });
    }));
  test("stale finish cannot erase a renewed claim; failed finish leaves fenced intent", async () =>
    fixture(async (tx) => {
      const f = await seedAnimal(tx),
        path = await expiredIntent(tx, f.animal),
        adapter = sqlAnimalClient(tx),
        port = createSupabaseAnimalDraftUploadCleanupPort(adapter.client, future);
      const [old] = await port.claim();
      await tx`update public.animal_draft_image_upload_intent set cleanup_claimed_at=clock_timestamp()-interval '2 hours' where storage_path=${path}`;
      const [fresh] = await port.claim();
      expect(fresh.claimedAt).not.toBe(old.claimedAt);
      await port.finish(old);
      expect(
        await tx`select storage_path from public.animal_draft_image_upload_intent where storage_path=${path}`,
      ).toHaveLength(1);
      await port.finish(fresh);
      expect(
        await tx`select storage_path from public.animal_draft_image_upload_intent where storage_path=${path}`,
      ).toHaveLength(0);
      const next = await expiredIntent(tx, f.animal);
      expect(
        await cleanupExpiredAnimalDraftUploads(
          createSupabaseAnimalDraftUploadCleanupPort(
            sqlAnimalClient(tx, { finish: true }).client,
            future,
          ),
          quiet,
        ),
      ).toEqual({ removed: 0, failed: 1 });
      await state(tx, (s) => draft(s, f.animal, f.actor, { draft_image_path: next }), "55000");
    }));
  test("concurrent archive retries serialize and fence Auth/admin state until audit commit", async () => {
    const f = await db.begin(async (tx) => seedAnimal(tx as SQL));
    try {
      await db.begin(async (tx) => {
        expect((await archive(tx as SQL, f.actor, f.animal)).kind).toBe("archived");
        for (const sql of [
          `update auth.users set banned_until=now()+interval '1 day' where id='${f.actor}'::uuid`,
          `update public.admin_user set role='treasurer' where auth_user_id='${f.actor}'::uuid`,
          `update public.admin_user set status='disabled' where auth_user_id='${f.actor}'::uuid`,
        ])
          await state(
            db,
            async (s) => {
              await s`set local lock_timeout='100ms'`;
              await s.unsafe(sql);
            },
            "55P03",
          );
      });
      await db.begin(async (tx) => archive(tx as SQL, f.actor, f.animal, false));
      const results = await Promise.all(
        [1, 2].map(() => db.begin(async (tx) => archive(tx as SQL, f.actor, f.animal))),
      );
      expect(results.map((r) => r.kind).sort()).toEqual(["archived", "unchanged"]);
      const [facts] =
        await db`select count(*)::int audits from public.audit_log where entity_id=${f.animal}`;
      expect(facts.audits).toBe(3);
      await db`update public.admin_user set status='disabled' where auth_user_id=${f.actor}::uuid`;
      await state(db, (s) => archive(s, f.actor, f.animal), "42501");
    } finally {
      await db.begin(async (tx) => {
        await tx`delete from public.audit_log where entity_id=${f.animal}`;
        await tx`delete from public.animals where id=${f.animal}::uuid`;
        await tx`delete from public.admin_user where auth_user_id=${f.actor}::uuid`;
        await tx`delete from auth.users where id=${f.actor}::uuid or id=${f.other}::uuid`;
      });
    }
  });
  test("cleanup claims skip locked rows and concurrent claims never duplicate work", async () => {
    const f = await db.begin(async (tx) => seedAnimal(tx as SQL));
    const paths = await db.begin(async (tx) => [
      await expiredIntent(tx as SQL, f.animal),
      await expiredIntent(tx as SQL, f.animal),
    ]);
    try {
      await db.begin(async (tx) => {
        await tx`select storage_path from public.animal_draft_image_upload_intent where storage_path=${paths[0]} for update`;
        const rows = await db.begin(
          async (s) =>
            s`select storage_path from public.claim_expired_animal_draft_image_uploads(now(),50)`,
        );
        expect(rows.map((r: { storage_path: string }) => r.storage_path)).toEqual([paths[1]]);
      });
      const results = await Promise.all(
        [1, 2].map(() =>
          db.begin(
            async (tx) =>
              tx`select storage_path from public.claim_expired_animal_draft_image_uploads(now(),50)`,
          ),
        ),
      );
      expect(results.flat().map((r: { storage_path: string }) => r.storage_path)).toEqual([
        paths[0],
      ]);
    } finally {
      await db.begin(async (tx) => {
        await tx`delete from public.animal_draft_image_upload_intent where animal_id=${f.animal}::uuid`;
        await tx`delete from public.animals where id=${f.animal}::uuid`;
        await tx`delete from public.admin_user where auth_user_id=${f.actor}::uuid`;
        await tx`delete from auth.users where id=${f.actor}::uuid or id=${f.other}::uuid`;
      });
    }
  });
});
