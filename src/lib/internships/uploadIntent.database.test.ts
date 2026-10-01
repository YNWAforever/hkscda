import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import {
  assertCloneUrl,
  assertSafeFixtureTables,
} from "../../../supabase/rls-tests/helpers/productionSchemaClone";
import { randomUUID } from "node:crypto";
import {
  seedInternship,
  seedIntent,
  attachCommand,
  command,
  sqlInternshipClient,
  inSavepoint,
} from "./uploadIntent.testSupport";
import { internshipAttachment } from "./attachments.server";
import {
  cleanupExpiredInternshipUploads,
  createSupabaseInternshipUploadCleanupPort,
} from "./uploadCleanup.server";

const url = process.env.R01_INTERNSHIP_TEST_DATABASE_URL;
if (url) assertCloneUrl(url);
let db: SQL;
const rollback = new Error("Task4 synthetic fixture rollback");
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
async function state(tx: SQL, body: (tx: SQL) => Promise<unknown>, wanted: string) {
  let code: string | undefined;
  try {
    if (tx === db) await db.begin(async (s) => body(s as SQL));
    else await inSavepoint(tx, body);
  } catch (error) {
    code = (error as { errno?: string }).errno;
  }
  expect(code).toBe(wanted);
}
function request(application: string, key: string, revision = 1, bytes = "%PDF-synthetic") {
  const form = new FormData();
  form.set("application_id", application);
  form.set("expected_revision", String(revision));
  form.set("idempotency_key", key);
  form.set("file", new File([bytes], "synthetic.pdf", { type: "application/pdf" }));
  return new Request("http://synthetic.invalid/api/internships/attachment", {
    method: "POST",
    body: form,
    headers: { authorization: "Bearer synthetic" },
  });
}
describe.skipIf(!url)("R01 internship upload intent compatibility", () => {
  beforeAll(async () => {
    db = new SQL(url!, { max: 6, prepare: false });
    await assertSafeFixtureTables(db, [
      "auth.users",
      "storage.objects",
      "storage.buckets",
      "internship_intake_version",
      "internship_intake_draft",
      "internship_application",
      "internship_attachment",
      "internship_event",
      "internship_command_result",
      "audit_log",
      "admin_user",
    ]);
  });
  afterAll(async () => {
    await db?.close();
  });
  test("current caller can query intent and exact trigger/claim contracts", async () => {
    await db`select storage_path,application_id,actor,created_at,expires_at,attached_at,cleanup_claimed_at,cleaned_at from public.internship_attachment_upload_intent limit 0`;
    for (const name of [
      "public.mark_internship_attachment_uploaded()",
      "public.claim_expired_internship_attachment_uploads(timestamp with time zone,integer)",
    ]) {
      const [row] = await db`select pg_catalog.to_regprocedure(${name})::text name`;
      expect(row.name).not.toBeNull();
    }
    const [trigger] =
      await db`select count(*)::int count from pg_catalog.pg_trigger where tgrelid='public.internship_attachment'::regclass and tgname='internship_attachment_uploaded' and not tgisinternal and tgenabled='O'`;
    expect(trigger.count).toBe(1);
    const foreignKeys =
      await db`select c.conname,count(*)::int count,bool_and(t.tgisinternal and t.tgenabled='O' and not t.tgdeferrable and not t.tginitdeferred) enforced from pg_constraint c join pg_trigger t on t.tgconstraint=c.oid where c.conrelid='public.internship_attachment_upload_intent'::regclass and c.contype='f' group by c.conname order by c.conname`;
    expect(foreignKeys).toHaveLength(2);
    for (const foreignKey of foreignKeys) {
      expect(foreignKey.count).toBe(4);
      expect(foreignKey.enforced).toBe(true);
    }
  });
  test("direct clients cannot read/write intents or execute either service function", async () => {
    for (const role of ["anon", "authenticated"])
      for (const sql of [
        "select * from public.internship_attachment_upload_intent",
        "insert into public.internship_attachment_upload_intent(storage_path,application_id,actor,expires_at) values('x',null,null,now())",
        "update public.internship_attachment_upload_intent set cleaned_at=now()",
        "delete from public.internship_attachment_upload_intent",
        "select public.claim_expired_internship_attachment_uploads(now(),50)",
        "select public.mark_internship_attachment_uploaded()",
      ])
        await state(
          db,
          async (tx) => {
            await tx.unsafe(`set local role ${role}`);
            await tx.unsafe(sql);
          },
          "42501",
        );
    const rows =
      await db`select pg_get_userbyid(proowner) owner,prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where pronamespace='public'::regnamespace and proname in ('mark_internship_attachment_uploaded','claim_expired_internship_attachment_uploads') order by proname`;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.owner).toBe("postgres");
      expect(row.prosecdef).toBe(false);
      expect(row.proconfig).toEqual(['search_path=""']);
    }
    expect(rows.map((r: { result: string }) => r.result)).toEqual([
      "TABLE(storage_path text, claimed_at timestamp with time zone)",
      "trigger",
    ]);
  });
  test("intent checks preserve actor/application paths, foreign keys, expiry and ignored duplicate", async () =>
    fixture(async (tx) => {
      const f = await seedInternship(tx),
        path = await seedIntent(tx, f.actor, f.application);
      await state(
        tx,
        (s) =>
          s`insert into public.internship_attachment_upload_intent(storage_path,application_id,actor,expires_at) values('wrong',${f.application}::uuid,${f.actor}::uuid,clock_timestamp()+interval '1 day')`,
        "23514",
      );
      const absent = randomUUID();
      await state(
        tx,
        async (s) => {
          await s`set local role service_role`;
          await s`insert into public.internship_attachment_upload_intent(storage_path,application_id,actor,expires_at) values(${f.actor + "/" + absent + "/key"},${absent}::uuid,${f.actor}::uuid,clock_timestamp()+interval '1 day')`;
        },
        "23503",
      );
      await state(
        tx,
        async (s) => {
          await s`set local role service_role`;
          await s`insert into public.internship_attachment_upload_intent(storage_path,application_id,actor,expires_at) values(${absent + "/" + f.application + "/key"},${f.application}::uuid,${absent}::uuid,clock_timestamp()+interval '1 day')`;
        },
        "23503",
      );
      for (const column of ["actor", "application_id"]) {
        await state(
          tx,
          async (s) => {
            await s`set local role service_role`;
            const nextActor = column === "actor" ? absent : f.actor;
            const nextApplication = column === "application_id" ? absent : f.application;
            await s`update public.internship_attachment_upload_intent set actor=${nextActor}::uuid,application_id=${nextApplication}::uuid,storage_path=${nextActor + "/" + nextApplication + "/updated"} where storage_path=${path}`;
          },
          "23503",
        );
      }
      await state(
        tx,
        (s) =>
          s`insert into public.internship_attachment_upload_intent(storage_path,application_id,actor,expires_at) values(${f.actor + "/" + f.application + "/expired"},${f.application}::uuid,${f.actor}::uuid,clock_timestamp()-interval '1 day')`,
        "23514",
      );
      const [before] =
        await tx`select * from public.internship_attachment_upload_intent where storage_path=${path}`;
      const adapter = sqlInternshipClient(tx, f.actor);
      const response = await adapter.client.from("internship_attachment_upload_intent").upsert(
        {
          storage_path: path,
          application_id: f.application,
          actor: f.actor,
          expires_at: "2099-01-01",
        },
        { onConflict: "storage_path", ignoreDuplicates: true },
      );
      expect(response.error).toBeNull();
      expect(
        (
          await tx`select * from public.internship_attachment_upload_intent where storage_path=${path}`
        )[0],
      ).toEqual(before);
    }));
  test("actual actor command attaches atomically, returns trigger row, retries exactly and retains immutable history", async () =>
    fixture(async (tx) => {
      const f = await seedInternship(tx),
        path = await seedIntent(tx, f.actor, f.application),
        body = attachCommand(f.application, path);
      await tx`insert into storage.objects(bucket_id,name) values('internship-private',${path})`;
      const result = await command(tx, f.actor, body);
      expect(result).toMatchObject({ kind: "updated", revision: 2 });
      expect(await command(tx, f.actor, body)).toEqual(result);
      expect(await command(tx, f.actor, { ...body, label: "changed" })).toMatchObject({
        kind: "conflict",
        reason: "idempotency_payload_changed",
      });
      const [facts] =
        await tx`select (select count(*)::int from public.internship_attachment where application_id=${f.application}::uuid) attachments,(select count(*)::int from public.internship_event where application_id=${f.application}::uuid) events,(select count(*)::int from public.audit_log where actor_user_id=${f.actor}::uuid) audits,(select count(*)::int from public.internship_command_result where actor=${f.actor}::uuid) commands,(select attached_at is not null from public.internship_attachment_upload_intent where storage_path=${path}) attached`;
      expect(facts).toEqual({ attachments: 1, events: 1, audits: 1, commands: 1, attached: true });
      await state(
        tx,
        (s) =>
          s`update public.internship_application set contact_snapshot='{}' where id=${f.application}::uuid`,
        "42501",
      );
      const second = await seedIntent(tx, f.actor, f.application);
      const [inserted] =
        await tx`insert into public.internship_attachment(application_id,object_path,content_hash,label,mime_type,byte_size,uploaded_by) values(${f.application}::uuid,${second},'hash','synthetic.pdf','application/pdf',10,${f.actor}::uuid) returning object_path`;
      expect(inserted.object_path).toBe(second);
    }));
  test("audit failure rolls back attachment, intent marker, revision, event and command retry", async () =>
    fixture(async (tx) => {
      const f = await seedInternship(tx),
        path = await seedIntent(tx, f.actor, f.application),
        body = attachCommand(f.application, path);
      await tx`insert into storage.objects(bucket_id,name) values('internship-private',${path})`;
      await tx`alter table public.audit_log add constraint r01_task4_fail_audit check(action not like 'internship.%')`;
      await state(tx, (s) => command(s, f.actor, body), "23514");
      const [facts] =
        await tx`select (select count(*)::int from public.internship_attachment where application_id=${f.application}::uuid) attachments,(select count(*)::int from public.internship_event where application_id=${f.application}::uuid) events,(select count(*)::int from public.internship_command_result where actor=${f.actor}::uuid) commands,(select revision from public.internship_application where id=${f.application}::uuid) revision,(select attached_at from public.internship_attachment_upload_intent where storage_path=${path}) attached`;
      expect(facts).toEqual({
        attachments: 0,
        events: 0,
        commands: 0,
        revision: "1",
        attached: null,
      });
      await tx`alter table public.audit_log drop constraint r01_task4_fail_audit`;
      expect((await command(tx, f.actor, body)).kind).toBe("updated");
    }));
  test("SQL actor rechecks suspension, ownership, revision and private object reference", async () =>
    fixture(async (tx) => {
      const f = await seedInternship(tx),
        path = await seedIntent(tx, f.actor, f.application),
        body = attachCommand(f.application, path);
      await state(tx, (s) => command(s, f.actor, body), "22023");
      await tx`insert into storage.objects(bucket_id,name) values('internship-private',${path})`;
      await state(tx, (s) => command(s, f.other, body), "42501");
      expect(await command(tx, f.actor, { ...body, expected_revision: 2 })).toMatchObject({
        kind: "conflict",
        current_revision: 1,
      });
      await tx`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${f.actor}::uuid`;
      await state(tx, (s) => command(s, f.actor, body), "42501");
      expect(
        (
          await tx`select count(*)::int count from public.internship_attachment where application_id=${f.application}::uuid`
        )[0].count,
      ).toBe(0);
    }));
  test("claim fences late attachment and retry lease; service adapter rejects stale preserve/finish/release updates", async () =>
    fixture(async (tx) => {
      const f = await seedInternship(tx),
        path = await seedIntent(tx, f.actor, f.application),
        adapter = sqlInternshipClient(tx, f.actor),
        port = createSupabaseInternshipUploadCleanupPort(adapter.client);
      const [old] = await port.claim();
      expect(old.storagePath).toBe(path);
      expect(await port.claim()).toEqual([]);
      await tx`insert into storage.objects(bucket_id,name) values('internship-private',${path})`;
      await state(tx, (s) => command(s, f.actor, attachCommand(f.application, path)), "55000");
      await tx`update public.internship_attachment_upload_intent set cleanup_claimed_at=cleanup_claimed_at+interval '1 second' where storage_path=${path}`;
      const [before] =
        await tx`select * from public.internship_attachment_upload_intent where storage_path=${path}`;
      await port.preserve(old);
      await port.finish(old);
      await port.release(old);
      expect(
        (
          await tx`select * from public.internship_attachment_upload_intent where storage_path=${path}`
        )[0],
      ).toEqual(before);
      await tx`update public.internship_attachment_upload_intent set cleanup_claimed_at=clock_timestamp()-interval '2 hours' where storage_path=${path}`;
      const [fresh] = await port.claim();
      expect(fresh.claimedAt).not.toBe(old.claimedAt);
      await port.finish(fresh);
      await port.release(fresh);
      expect(
        (
          await tx`select cleaned_at is not null cleaned from public.internship_attachment_upload_intent where storage_path=${path}`
        )[0].cleaned,
      ).toBe(true);
      expect(
        (
          await tx`select cleanup_claimed_at is not null claimed from public.internship_attachment_upload_intent where storage_path=${path}`
        )[0].claimed,
      ).toBe(true);
      expect(await port.claim()).toEqual([]);
    }));
  test("actual cleanup service preserves references and fences ambiguous deletion/finish failures per item", async () =>
    fixture(async (tx) => {
      const f = await seedInternship(tx),
        referenced = `${f.actor}/${f.application}/${randomUUID()}`;
      await tx`insert into public.internship_attachment(application_id,object_path,content_hash,label,mime_type,byte_size,uploaded_by) values(${f.application}::uuid,${referenced},'hash','legacy.pdf','application/pdf',10,${f.actor}::uuid)`;
      await seedIntent(tx, f.actor, f.application, referenced.split("/")[2]);
      const preserveFail = `${f.actor}/${f.application}/${randomUUID()}`;
      await tx`insert into public.internship_attachment(application_id,object_path,content_hash,label,mime_type,byte_size,uploaded_by) values(${f.application}::uuid,${preserveFail},'hash','legacy.pdf','application/pdf',10,${f.actor}::uuid)`;
      await seedIntent(tx, f.actor, f.application, preserveFail.split("/")[2]);
      const good = await seedIntent(tx, f.actor, f.application),
        refFail = await seedIntent(tx, f.actor, f.application),
        removeFail = await seedIntent(tx, f.actor, f.application),
        finishFail = await seedIntent(tx, f.actor, f.application),
        releaseFail = await seedIntent(tx, f.actor, f.application);
      const adapter = sqlInternshipClient(tx, f.actor, {
        reference: new Set([refFail, releaseFail]),
        preserve: new Set([preserveFail]),
        remove: new Set([removeFail]),
        finish: new Set([finishFail]),
        release: new Set([releaseFail]),
      });
      for (const p of [good, removeFail, finishFail]) adapter.objects.set(p, new Uint8Array([1]));
      const summary = await cleanupExpiredInternshipUploads(
        createSupabaseInternshipUploadCleanupPort(adapter.client),
        { error: () => {} },
      );
      expect(summary).toEqual({ removed: 1, preserved: 1, failed: 5 });
      const rows =
        await tx`select storage_path,attached_at is not null attached,cleanup_claimed_at is not null claimed,cleaned_at is not null cleaned from public.internship_attachment_upload_intent where application_id=${f.application}::uuid`;
      const byPath = Object.fromEntries(
        rows.map((r: { storage_path: string }) => [r.storage_path, r]),
      );
      expect(byPath[referenced]).toMatchObject({ attached: true, claimed: false, cleaned: false });
      expect(byPath[good]).toMatchObject({ attached: false, claimed: true, cleaned: true });
      expect(byPath[refFail]).toMatchObject({ attached: false, claimed: false, cleaned: false });
      expect(byPath[preserveFail]).toMatchObject({
        attached: false,
        claimed: false,
        cleaned: false,
      });
      for (const p of [removeFail, finishFail, releaseFail])
        expect(byPath[p]).toMatchObject({ attached: false, claimed: true, cleaned: false });
      expect(adapter.objects.has(removeFail)).toBe(false);
      for (const p of [removeFail, finishFail]) {
        await tx`insert into storage.objects(bucket_id,name) values('internship-private',${p})`;
        await state(tx, (s) => command(s, f.actor, attachCommand(f.application, p)), "55000");
      }
    }));
  test("actual HTTP attachment caller commits intent before inert Storage, retries exact bytes and signs private GET for 60 seconds", async () =>
    fixture(async (tx) => {
      const f = await seedInternship(tx),
        key = randomUUID(),
        adapter = sqlInternshipClient(tx, f.actor),
        clock = () => new Date("2090-01-01T00:00:00Z");
      const send = () =>
        internshipAttachment(request(f.application, key), () => adapter.client, clock);
      const response = await send();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const result = await response.json();
      expect(adapter.stats().intentBeforeUpload).toBe(true);
      expect(result).toMatchObject({ kind: "updated", revision: 2 });
      expect(await (await send()).json()).toEqual(result);
      expect(adapter.stats().uploadCount).toBe(1);
      const [attachment] =
        await tx`select id from public.internship_attachment where application_id=${f.application}::uuid`;
      const download = await internshipAttachment(
        new Request(`http://synthetic.invalid/api/internships/attachment?id=${attachment.id}`, {
          headers: { authorization: "Bearer synthetic" },
        }),
        () => adapter.client,
        clock,
      );
      expect(download.status).toBe(200);
      expect(download.headers.get("cache-control")).toBe("no-store");
      expect(adapter.stats().signedSeconds).toBe(60);
    }));
  test("HTTP revision race retains orphan intent; Storage409 verifies content and cleanup claim prevents upload", async () =>
    fixture(async (tx) => {
      const f = await seedInternship(tx),
        key = randomUUID(),
        adapter = sqlInternshipClient(tx, f.actor, {
          beforeCommand: async () => {
            await tx`update public.internship_application set revision=2 where id=${f.application}::uuid`;
          },
        }),
        clock = () => new Date("2090-01-01T00:00:00Z"),
        path = `${f.actor}/${f.application}/${key}`;
      const first = await internshipAttachment(
        request(f.application, key),
        () => adapter.client,
        clock,
      );
      expect(first.status).toBe(409);
      expect(
        (
          await tx`select attached_at from public.internship_attachment_upload_intent where storage_path=${path}`
        )[0].attached_at,
      ).toBeNull();
      const changed = await internshipAttachment(
        request(f.application, key, 2, "%PDF-other"),
        () => adapter.client,
        clock,
      );
      expect(changed.status).toBe(409);
      const same = await internshipAttachment(
        request(f.application, key, 2),
        () => adapter.client,
        clock,
      );
      expect(same.status).toBe(200);
      const blockedKey = randomUUID(),
        blockedPath = await seedIntent(tx, f.actor, f.application, blockedKey);
      await tx`update public.internship_attachment_upload_intent set cleanup_claimed_at=clock_timestamp() where storage_path=${blockedPath}`;
      const before = adapter.stats().uploadCount;
      const blocked = await internshipAttachment(
        request(f.application, blockedKey, 3),
        () => adapter.client,
        clock,
      );
      expect(blocked.status).toBe(409);
      expect(adapter.stats().uploadCount).toBe(before);
    }));
  test("claim clamps batch sizes and excludes attached/cleaned/nonexpired intents", async () =>
    fixture(async (tx) => {
      const f = await seedInternship(tx);
      await tx`insert into public.internship_attachment_upload_intent(storage_path,application_id,actor,created_at,expires_at) select ${f.actor + "/" + f.application + "/batch-"}||n::text,${f.application}::uuid,${f.actor}::uuid,'2000-01-01','2001-01-01' from generate_series(1,55) n`;
      const run = async (limit: number | null) =>
        inSavepoint(tx, async (s) => {
          await s`set local role service_role`;
          const rows =
            await s`select * from public.claim_expired_internship_attachment_uploads('2002-01-01',${limit}::integer)`;
          await s`set local role postgres`;
          return rows;
        });
      expect(await run(0)).toHaveLength(1);
      expect(await run(500)).toHaveLength(50);
      expect(await run(null)).toHaveLength(4);
      await tx`update public.internship_attachment_upload_intent set cleanup_claimed_at=null where application_id=${f.application}::uuid`;
      expect(await run(null)).toHaveLength(50);
      expect(await run(500)).toHaveLength(5);
      const attached = await seedIntent(tx, f.actor, f.application),
        cleaned = await seedIntent(tx, f.actor, f.application),
        future = await seedIntent(tx, f.actor, f.application);
      await tx`update public.internship_attachment_upload_intent set attached_at=clock_timestamp() where storage_path=${attached}`;
      await tx`update public.internship_attachment_upload_intent set cleaned_at=clock_timestamp() where storage_path=${cleaned}`;
      await tx`update public.internship_attachment_upload_intent set expires_at=clock_timestamp()+interval '1 day' where storage_path=${future}`;
      const port = createSupabaseInternshipUploadCleanupPort(
        sqlInternshipClient(tx, f.actor).client,
      );
      expect(await port.claim()).toEqual([]);
      const lease = { storagePath: attached, claimedAt: new Date().toISOString() };
      await tx`update public.internship_attachment_upload_intent set cleanup_claimed_at=${lease.claimedAt}::timestamptz where storage_path=${attached}`;
      await port.finish(lease);
      expect(
        (
          await tx`select cleaned_at from public.internship_attachment_upload_intent where storage_path=${attached}`
        )[0].cleaned_at,
      ).toBeNull();
    }));
  test("HTTP applicant ownership and current staff role gate private attachment access", async () =>
    fixture(async (tx) => {
      const f = await seedInternship(tx),
        owner = sqlInternshipClient(tx, f.actor),
        outsider = sqlInternshipClient(tx, f.other),
        key = randomUUID();
      expect(
        (await internshipAttachment(request(f.application, key), () => outsider.client)).status,
      ).toBe(403);
      expect(outsider.stats().uploadCount).toBe(0);
      const uploaded = await internshipAttachment(request(f.application, key), () => owner.client);
      expect(uploaded.status).toBe(200);
      const [file] =
        await tx`select id from public.internship_attachment where application_id=${f.application}::uuid`;
      const get = () =>
        internshipAttachment(
          new Request(`http://synthetic.invalid/api/internships/attachment?id=${file.id}`, {
            headers: { authorization: "Bearer synthetic" },
          }),
          () => outsider.client,
        );
      expect((await get()).status).toBe(403);
      expect(outsider.stats().signedSeconds).toBe(0);
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${f.other}::uuid,${f.other + "@example.invalid"},'treasurer','active')`;
      expect((await get()).status).toBe(403);
      expect(outsider.stats().signedSeconds).toBe(0);
      await tx`update public.admin_user set role='staff' where auth_user_id=${f.other}::uuid`;
      expect((await get()).status).toBe(200);
      expect(outsider.stats().signedSeconds).toBe(60);
      await tx`update public.admin_user set status='disabled' where auth_user_id=${f.other}::uuid`;
      expect((await get()).status).toBe(403);
    }));
  test("competing cleanup claims skip locked committed rows without stealing leases", async () => {
    const [f] =
      await db`select id application,applicant_id actor from public.internship_application where contact_snapshot->>'name'='Synthetic preserved contact' order by created_at limit 1`;
    expect(f).toBeDefined();
    const paths = [
      `${f.actor}/${f.application}/${randomUUID()}`,
      `${f.actor}/${f.application}/${randomUUID()}`,
    ];
    for (const path of paths)
      await db`insert into public.internship_attachment_upload_intent(storage_path,application_id,actor,created_at,expires_at) values(${path},${f.application}::uuid,${f.actor}::uuid,'2000-01-01','2001-01-01')`;
    let signal!: () => void, release!: () => void;
    const locked = new Promise<void>((r) => {
        signal = r;
      }),
      proceed = new Promise<void>((r) => {
        release = r;
      });
    const first = db
      .begin(async (tx) => {
        await tx`set local role service_role`;
        const rows =
          await tx`select * from public.claim_expired_internship_attachment_uploads('2002-01-01',1)`;
        signal();
        await proceed;
        expect(rows).toHaveLength(1);
        throw rollback;
      })
      .catch((e) => {
        if (e !== rollback) throw e;
      });
    try {
      await locked;
      await db
        .begin(async (tx) => {
          await tx`set local role service_role`;
          const rows =
            await tx`select * from public.claim_expired_internship_attachment_uploads('2002-01-01',50)`;
          expect(rows).toHaveLength(1);
          expect(paths).toContain(rows[0].storage_path);
          throw rollback;
        })
        .catch((e) => {
          if (e !== rollback) throw e;
        });
    } finally {
      release();
      await first;
      for (const path of paths)
        await db`delete from public.internship_attachment_upload_intent where storage_path=${path}`;
    }
  });
});
