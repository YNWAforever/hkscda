import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createHash, randomUUID } from "node:crypto";
import {
  assertCloneUrl,
  assertSafeFixtureTables,
} from "../../../supabase/rls-tests/helpers/productionSchemaClone";
import {
  cleanupExpiredAdoptionUploads,
  type AdoptionUploadCleanupPort,
} from "./uploadIntent.server";

const url = process.env.R01_ADOPTION_TEST_DATABASE_URL;
if (url) assertCloneUrl(url);
let db: SQL;
let status: string;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function state(operation: Promise<unknown>, wanted: string) {
  let code: unknown;
  try {
    await operation;
  } catch (error) {
    code = (error as { errno?: string }).errno;
  }
  expect(code).toBe(wanted);
}

async function application(id: string) {
  await db`insert into public.adoption_applications(id,animal_name,animal_type,applicant_name,phone,email,address,housing_type,reason)
    values(${id}::uuid,'Synthetic cat','cat','Synthetic applicant','00000000','r01@example.invalid','Synthetic address','flat','Synthetic reason')`;
}

async function intent(id = randomUUID(), expiry = "old", submitted = false) {
  await db`insert into public.adoption_upload_intent(application_id,photo_paths,status_token_hash,created_at,expires_at,submitted_at)
    values(${id}::uuid,${db.array([`${id}/synthetic.jpg`], "TEXT")},${digest(id)},clock_timestamp()-interval '3 days',
      clock_timestamp()+case when ${expiry}='old' then interval '-2 days' else interval '1 day' end,
      case when ${submitted} then clock_timestamp() else null end)`;
  return id;
}

const resolveIntent = (id: string | null) =>
  db.begin(async (tx) => {
    await tx`set local role service_role`;
    const [row] = await tx`select public.cleanup_expired_adoption_application(${id}::uuid) outcome`;
    return row.outcome as string;
  });

async function insertCase(tx: SQL, id: string) {
  return tx`insert into public.adoption_case(public_application_id,status_id,applicant_name,applicant_phone)
    values(${id}::uuid,${status}::uuid,'Synthetic applicant','00000000') returning id`;
}

async function remains(id: string) {
  const [row] = await db`select
    exists(select 1 from public.adoption_upload_intent where application_id=${id}::uuid) intent,
    exists(select 1 from public.adoption_applications where id=${id}::uuid) application,
    exists(select 1 from public.adoption_case where public_application_id=${id}::uuid) completed`;
  return row;
}

// A held real lock is the synchronization point; never rely on a fixed sleep.
async function blocked(pid: number) {
  const until = performance.now() + 5000;
  while (performance.now() < until) {
    const [row] = await db`select cardinality(pg_blocking_pids(${pid}))>0 waiting`;
    if (row.waiting) return;
    await Bun.sleep(20);
  }
  throw new Error("Expected real database lock wait");
}

describe.skipIf(!url)("R01 adoption forward schema on a guarded empty clone", () => {
  beforeAll(async () => {
    db = new SQL(url!, { max: 6, prepare: false });
    await assertSafeFixtureTables(db, [
      "adoption_upload_intent",
      "public_status_token",
      "adoption_applications",
      "adoption_case",
      "coordinator_status",
      "audit_log",
      "adoption_application_detail",
      "adoption_application_photo",
      "adoption_application_animal_preference",
      "adoption_application_visit_preference",
      "adoption_intake_item",
    ]);
    status = randomUUID();
    await db`insert into public.coordinator_status(id,category,key,label_zh,label_en)
      values(${status}::uuid,'adoption_case',${`r${status.replaceAll("-", "")}`},'Synthetic','Synthetic')`;
  });
  afterAll(async () => {
    await db?.close();
  });

  test("current caller can query intent, fingerprint and exact cleanup signature", async () => {
    // Hosted RED is the actual relation-not-found query, before migration DDL.
    await db`select application_id,photo_paths,status_token_hash,expires_at,submitted_at from public.adoption_upload_intent limit 0`;
    await db`select submission_fingerprint from public.public_status_token limit 0`;
    expect(await resolveIntent(randomUUID())).toBe("defer");
  });

  test("anon and authenticated SQL actors cannot read or mutate private intent/token or call cleanup", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const query of [
        "select * from public.adoption_upload_intent",
        "delete from public.adoption_upload_intent",
        "select submission_fingerprint from public.public_status_token",
        "select public.cleanup_expired_adoption_application(null::uuid)",
      ]) {
        await state(
          db.begin(async (tx) => {
            await tx.unsafe(`set local role ${role}`);
            await tx.unsafe(query);
          }),
          "42501",
        );
      }
    }
    const [p] =
      await db`select pg_get_userbyid(proowner) owner,prosecdef,proargnames,pg_get_function_result(oid) result,
      has_function_privilege('service_role',oid,'EXECUTE') service,
      has_function_privilege('anon',oid,'EXECUTE') anon,
      has_function_privilege('authenticated',oid,'EXECUTE') authenticated
      from pg_proc where oid='public.cleanup_expired_adoption_application(uuid)'::regprocedure`;
    expect(p).toMatchObject({
      owner: "postgres",
      prosecdef: true,
      proargnames: ["p_application_id"],
      result: "text",
      service: true,
      anon: false,
      authenticated: false,
    });
  });

  test("malformed hashes, photo counts, expired creation and duplicate bearer/application are rejected", async () => {
    for (const [photos, token, created, expiry] of [
      [[], digest("empty"), "2026-01-01", "2026-01-02"],
      [Array(7).fill("synthetic.jpg"), digest("seven"), "2026-01-01", "2026-01-02"],
      [["synthetic.jpg"], "A".repeat(64), "2026-01-01", "2026-01-02"],
      [["synthetic.jpg"], "bad", "2026-01-01", "2026-01-02"],
      [["synthetic.jpg"], digest("expiry"), "2026-01-02", "2026-01-01"],
    ] as const) {
      await state(
        db`insert into public.adoption_upload_intent(application_id,photo_paths,status_token_hash,created_at,expires_at)
        values(${randomUUID()}::uuid,${db.array([...photos], "TEXT")},${token},${created}::timestamptz,${expiry}::timestamptz)`,
        "23514",
      );
    }
    const id = await intent();
    await state(intent(id), "23505");
    await state(
      db`insert into public.adoption_upload_intent(application_id,photo_paths,status_token_hash,expires_at)
      values(${randomUUID()}::uuid,${db.array(["synthetic.jpg"], "TEXT")},${digest(id)},clock_timestamp()+interval '1 day')`,
      "23505",
    );
    for (const fingerprint of ["bad", "A".repeat(64)]) {
      await state(
        db`insert into public.public_status_token(token_hash,entity_type,entity_id,expires_at,submission_fingerprint)
        values(${digest(randomUUID())},'adoption_application',${randomUUID()}::uuid,clock_timestamp()+interval '1 day',${fingerprint})`,
        "23514",
      );
    }
    for (const fingerprint of [null, "a".repeat(64)]) {
      await db`insert into public.public_status_token(token_hash,entity_type,entity_id,expires_at,submission_fingerprint)
        values(${digest(randomUUID())},'adoption_application',${randomUUID()}::uuid,clock_timestamp()+interval '1 day',${fingerprint})`;
    }
    await state(
      db.unsafe("select public.cleanup_expired_adoption_application('invalid'::uuid)"),
      "22P02",
    );
  });

  test("submitted, unexpired, NULL and unknown intents defer without parent deletion", async () => {
    for (const id of [await intent(undefined, "old", true), await intent(undefined, "future")]) {
      await application(id);
      expect(await resolveIntent(id)).toBe("defer");
      expect(await remains(id)).toMatchObject({
        intent: true,
        application: true,
        completed: false,
      });
    }
    expect(await resolveIntent(null)).toBe("defer");
    expect(await resolveIntent(randomUUID())).toBe("defer");
  });

  test("completed case retains application, photos and original modern row version", async () => {
    const id = await intent();
    await application(id);
    await insertCase(db, id);
    const [before] =
      await db`select to_jsonb(c) facts from public.adoption_case c where public_application_id=${id}::uuid`;
    expect(await resolveIntent(id)).toBe("completed");
    expect(await remains(id)).toMatchObject({ intent: true, application: true, completed: true });
    const [after] =
      await db`select to_jsonb(c) facts from public.adoption_case c where public_application_id=${id}::uuid`;
    expect(after.facts).toEqual(before.facts);
  });

  test("concurrent purge retries keep intent and cascade partial children until simulated Storage succeeds", async () => {
    const id = await intent();
    await application(id);
    await db`insert into public.adoption_application_photo(public_application_id,storage_path,file_name,mime_type,size_bytes,photo_category)
      values(${id}::uuid,${`${id}/synthetic.jpg`},'synthetic.jpg','image/jpeg',100,'home')`;
    expect(await Promise.all([resolveIntent(id), resolveIntent(id)])).toEqual(["purged", "purged"]);
    expect(await remains(id)).toMatchObject({ intent: true, application: false, completed: false });
    const [children] =
      await db`select count(*)::int n from public.adoption_application_photo where public_application_id=${id}::uuid`;
    expect(children.n).toBe(0);
    let storageFails = true;
    const port: AdoptionUploadCleanupPort = {
      async listExpired() {
        const rows =
          await db`select * from public.adoption_upload_intent where application_id=${id}::uuid`;
        return rows.map(
          (r: {
            application_id: string;
            photo_paths: string[];
            status_token_hash: string;
            expires_at: Date;
          }) => ({
            applicationId: r.application_id,
            photoPaths: r.photo_paths,
            statusTokenHash: r.status_token_hash,
            expiresAt: r.expires_at.toISOString(),
            submittedAt: null,
          }),
        );
      },
      resolveExpiredApplication: async (applicationId) => {
        const outcome = await resolveIntent(applicationId);
        if (outcome !== "completed" && outcome !== "purged" && outcome !== "defer")
          throw new Error("Invalid outcome");
        return outcome;
      },
      async removePhotos() {
        if (storageFails) throw new Error("Synthetic storage failure; no provider call");
      },
      async deleteIntent(applicationId) {
        await db`delete from public.adoption_upload_intent where application_id=${applicationId}::uuid and submitted_at is null`;
      },
      async markSubmitted(applicationId) {
        await db`update public.adoption_upload_intent set submitted_at=clock_timestamp() where application_id=${applicationId}::uuid`;
      },
    };
    expect(await cleanupExpiredAdoptionUploads(port, { error() {} })).toEqual({
      removed: 0,
      preserved: 0,
      failed: 1,
    });
    expect((await remains(id)).intent).toBe(true);
    storageFails = false;
    expect(await cleanupExpiredAdoptionUploads(port, { error() {} })).toEqual({
      removed: 1,
      preserved: 0,
      failed: 0,
    });
    expect((await remains(id)).intent).toBe(false);
  });

  test("cleanup rechecks expiry after waiting for an intent lock", async () => {
    const id = await intent();
    await application(id);
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((r) => {
      locked = r;
    });
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const holder = db.begin(async (tx) => {
      await tx`select 1 from public.adoption_upload_intent where application_id=${id}::uuid for update`;
      locked();
      await gate;
      await tx`update public.adoption_upload_intent set expires_at=clock_timestamp()+interval '1 day' where application_id=${id}::uuid`;
    });
    await ready;
    let pidReady!: (pid: number) => void;
    const pid = new Promise<number>((r) => {
      pidReady = r;
    });
    const cleanup = db.begin(async (tx) => {
      const [backend] = await tx`select pg_backend_pid() pid`;
      pidReady(backend.pid);
      await tx`set local role service_role`;
      const [r] = await tx`select public.cleanup_expired_adoption_application(${id}::uuid) outcome`;
      return r.outcome;
    });
    try {
      await blocked(await pid);
    } finally {
      release();
    }
    await holder;
    expect(await cleanup).toBe("defer");
    expect((await remains(id)).application).toBe(true);
  });

  test("cleanup uses wall-clock expiry after its lock rather than transaction start time", async () => {
    const id = await intent();
    await application(id);
    await db`update public.adoption_upload_intent set expires_at=clock_timestamp()-interval '1 hour'+interval '1 second' where application_id=${id}::uuid`;
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const held = new Promise<void>((r) => {
      ready = r;
    });
    const holder = db.begin(async (tx) => {
      await tx`select 1 from public.adoption_upload_intent where application_id=${id}::uuid for update`;
      ready();
      await gate;
    });
    await held;
    let send!: (pid: number) => void;
    const pid = new Promise<number>((r) => {
      send = r;
    });
    const cleanup = db.begin(async (tx) => {
      const [backend] = await tx`select pg_backend_pid() pid`;
      send(backend.pid);
      await tx`set local role service_role`;
      const [row] =
        await tx`select public.cleanup_expired_adoption_application(${id}::uuid) outcome`;
      return row.outcome;
    });
    try {
      await blocked(await pid);
      const until = performance.now() + 5000;
      while (true) {
        const [clock] =
          await db`select clock_timestamp()>expires_at+interval '1 hour' expired from public.adoption_upload_intent where application_id=${id}::uuid`;
        if (clock.expired) break;
        if (performance.now() > until)
          throw new Error("Expected expiry boundary to cross while locked");
        await Bun.sleep(20);
      }
    } finally {
      release();
    }
    await holder;
    expect(await cleanup).toBe("purged");
    expect(await remains(id)).toMatchObject({ intent: true, application: false, completed: false });
  });

  test("committing case insertion holds parent key-share and cleanup then preserves completed case", async () => {
    const id = await intent();
    await application(id);
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const inserted = new Promise<void>((r) => {
      ready = r;
    });
    const insertion = db.begin(async (tx) => {
      await insertCase(tx as SQL, id);
      ready();
      await gate;
    });
    await inserted;
    let send!: (pid: number) => void;
    const pid = new Promise<number>((r) => {
      send = r;
    });
    const cleanup = db.begin(async (tx) => {
      const [p] = await tx`select pg_backend_pid() pid`;
      send(p.pid);
      await tx`set local role service_role`;
      const [r] = await tx`select public.cleanup_expired_adoption_application(${id}::uuid) outcome`;
      return r.outcome;
    });
    try {
      await blocked(await pid);
    } finally {
      release();
    }
    await insertion;
    expect(await cleanup).toBe("completed");
    expect(await remains(id)).toMatchObject({ intent: true, application: true, completed: true });
  });

  test("cleanup parent lock prevents a late case insertion from orphaning committed work", async () => {
    const id = await intent();
    await application(id);
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const purged = new Promise<void>((r) => {
      ready = r;
    });
    const cleanup = db.begin(async (tx) => {
      await tx`set local role service_role`;
      const [r] = await tx`select public.cleanup_expired_adoption_application(${id}::uuid) outcome`;
      expect(r.outcome).toBe("purged");
      ready();
      await gate;
    });
    await purged;
    let send!: (pid: number) => void;
    const pid = new Promise<number>((r) => {
      send = r;
    });
    const insertion = db.begin(async (tx) => {
      const [p] = await tx`select pg_backend_pid() pid`;
      send(p.pid);
      await insertCase(tx as SQL, id);
    });
    // Attach rejection handler before releasing the lock.
    const rejected = state(insertion, "23503");
    try {
      await blocked(await pid);
    } finally {
      release();
    }
    await cleanup;
    await rejected;
    expect(await remains(id)).toMatchObject({ intent: true, application: false, completed: false });
  });

  test("downstream failure rolls back parent and cascaded child deletion atomically", async () => {
    const id = await intent();
    await application(id);
    await db`insert into public.adoption_application_photo(public_application_id,storage_path,file_name,mime_type,size_bytes,photo_category)
      values(${id}::uuid,${`${id}/synthetic.jpg`},'synthetic.jpg','image/jpeg',100,'home')`;
    // Clone-only inert failure injection; no provider primitive and no application RPC replacement.
    await db.unsafe(
      "create function public.r01_test_reject_delete() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Synthetic downstream failure' using errcode='23514'; end $$;create trigger r01_test_reject_delete after delete on public.adoption_application_photo for each row execute function public.r01_test_reject_delete()",
    );
    await assertSafeFixtureTables(db, ["adoption_application_photo"]);
    try {
      await state(resolveIntent(id), "23514");
      expect(await remains(id)).toMatchObject({
        intent: true,
        application: true,
        completed: false,
      });
      const [row] =
        await db`select count(*)::int n from public.adoption_application_photo where public_application_id=${id}::uuid`;
      expect(row.n).toBe(1);
    } finally {
      await db.unsafe(
        "drop trigger r01_test_reject_delete on public.adoption_application_photo;drop function public.r01_test_reject_delete()",
      );
    }
    expect(await resolveIntent(id)).toBe("purged");
  });
});
