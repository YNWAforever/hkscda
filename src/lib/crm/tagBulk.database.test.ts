import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.CRM_TAG_BULK_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== "57322" || url.pathname !== "/postgres") {
    throw new Error("CRM tag bulk test requires the dedicated loopback database");
  }
}
const enabled = Boolean(databaseUrl) && process.env.CRM_TAG_BULK_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)(
  "CRM tag preview and per-item apply fence stale versions and double submit",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback CRM tag bulk fixture");
    const actor = crypto.randomUUID();
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    try {
      await db.begin(async (tx) => {
        const email = "crm-bulk-" + actor + "@example.invalid";
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, email],
        );
        await tx.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'treasurer','active')",
          [actor, email],
        );
        for (const id of ids) {
          await tx.unsafe(
            "insert into public.supporter(id,name,email,tags) values($1::uuid,'Synthetic supporter',$2,array['old']::text[])",
            [id, id + "@example.invalid"],
          );
        }
        const alreadyTagged = (await tx.unsafe(
          "select public.create_crm_tag_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
          [actor, "{" + ids[0] + "}", "old", "a".repeat(64)],
        )) as Array<{
          result: { items: Array<{ status: string; beforeTags: string[]; afterTags: string[] }> };
        }>;
        expect(alreadyTagged[0]!.result.items[0]).toMatchObject({
          status: "skipped",
          beforeTags: ["old"],
          afterTags: ["old"],
        });
        const preview = (await tx.unsafe(
          "select public.create_crm_tag_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
          [actor, "{" + ids.join(",") + "}", "reviewed", "a".repeat(64)],
        )) as Array<{ result: { operationId: string; items: Array<{ status: string }> } }>;
        const operationId = preview[0]!.result.operationId;
        expect(preview[0]!.result.items).toHaveLength(3);
        const first = (await tx.unsafe(
          "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, operationId, ids[0]],
        )) as Array<{ result: { status: string } }>;
        expect(first[0]!.result.status).toBe("succeeded");
        const repeat = (await tx.unsafe(
          "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, operationId, ids[0]],
        )) as Array<{ result: { status: string } }>;
        expect(repeat[0]!.result.status).toBe("succeeded");
        await tx.unsafe(
          "update public.supporter set tags=array['changed']::text[] where id=$1::uuid",
          [ids[1]],
        );
        const stale = (await tx.unsafe(
          "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, operationId, ids[1]],
        )) as Array<{ result: { status: string; reasonCode: string } }>;
        expect(stale[0]!.result).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
        const third = (await tx.unsafe(
          "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, operationId, ids[2]],
        )) as Array<{ result: { status: string } }>;
        expect(third[0]!.result.status).toBe("succeeded");
        const result = (await tx.unsafe(
          "select public.get_crm_tag_bulk_operation($1::uuid,$2::uuid) result",
          [actor, operationId],
        )) as Array<{ result: { state: string; items: Array<{ status: string }> } }>;
        expect(result[0]!.result.state).toBe("done");
        expect(result[0]!.result.items.map((item) => item.status)).toEqual([
          "succeeded",
          "conflict",
          "succeeded",
        ]);
        const audits = (await tx.unsafe(
          "select count(*)::int count from public.audit_log where actor_user_id=$1::uuid and action='supporter.bulk_tag_add'",
          [actor],
        )) as Array<{ count: number }>;
        expect(audits[0]!.count).toBe(2);
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

test.skipIf(!enabled)(
  "CRM bulk rejects oversized previews, revoked actor and expired snapshot; audit failure rolls back update",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback CRM bulk safety fixture");
    const actor = crypto.randomUUID();
    const id = crypto.randomUUID();
    const hash = "b".repeat(64);
    try {
      await db.begin(async (tx) => {
        const email = actor + "@example.invalid";
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, email],
        );
        await tx.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'treasurer','active')",
          [actor, email],
        );
        await tx.unsafe(
          "insert into public.supporter(id,name,email,tags) values($1::uuid,'Synthetic supporter',$2,array['old']::text[])",
          [id, id + "@example.invalid"],
        );
        const expectFailure = async (call: () => Promise<unknown>, code: string) => {
          await tx.unsafe("savepoint bulk_expected_failure");
          let received: unknown;
          try {
            await call();
          } catch (error) {
            received = error;
          }
          await tx.unsafe("rollback to savepoint bulk_expected_failure");
          expect((received as { errno?: string } | undefined)?.errno).toBe(code);
        };
        const tooMany = Array.from({ length: 1001 }, () => crypto.randomUUID());
        await expectFailure(
          () =>
            tx.unsafe("select public.create_crm_tag_bulk_preview($1::uuid,$2::uuid[],$3,$4)", [
              actor,
              "{" + tooMany.join(",") + "}",
              "reviewed",
              hash,
            ]),
          "22023",
        );
        const preview = (await tx.unsafe(
          "select public.create_crm_tag_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
          [actor, "{" + id + "}", "reviewed", hash],
        )) as Array<{ result: { operationId: string } }>;
        const operationId = preview[0]!.result.operationId;
        await tx.unsafe(
          "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
          [actor],
        );
        await expectFailure(
          () =>
            tx.unsafe("select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
              actor,
              operationId,
              id,
            ]),
          "42501",
        );
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [actor],
        );
        await tx.unsafe(
          "update public.crm_tag_bulk_operation set expires_at=now()-interval '1 second' where id=$1::uuid",
          [operationId],
        );
        await expectFailure(
          () =>
            tx.unsafe("select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
              actor,
              operationId,
              id,
            ]),
          "P0001",
        );
        await tx.unsafe(
          "update public.crm_tag_bulk_operation set expires_at=now()+interval '15 minutes' where id=$1::uuid",
          [operationId],
        );
        await tx.unsafe(
          "create function pg_temp.fail_crm_bulk_audit() returns trigger language plpgsql as $$ begin if new.action='supporter.bulk_tag_add' then raise exception 'synthetic audit failure' using errcode='P0002'; end if; return new; end $$",
        );
        await tx.unsafe(
          "create trigger fail_crm_bulk_audit before insert on public.audit_log for each row execute function pg_temp.fail_crm_bulk_audit()",
        );
        await expectFailure(
          () =>
            tx.unsafe("select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
              actor,
              operationId,
              id,
            ]),
          "P0002",
        );
        const rows = (await tx.unsafe("select tags from public.supporter where id=$1::uuid", [
          id,
        ])) as Array<{ tags: string[] }>;
        expect(rows[0]!.tags).toEqual(["old"]);
        await tx.unsafe("drop trigger fail_crm_bulk_audit on public.audit_log");
        const applied = (await tx.unsafe(
          "select public.apply_crm_tag_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
          [actor, operationId, id],
        )) as Array<{ result: { status: string } }>;
        expect(applied[0]!.result.status).toBe("succeeded");
        const grants = (await tx.unsafe(
          "select has_function_privilege('authenticated','public.create_crm_tag_bulk_preview(uuid,uuid[],text,text)','EXECUTE') preview, has_function_privilege('anon','public.apply_crm_tag_bulk_item(uuid,uuid,uuid)','EXECUTE') apply, has_table_privilege('authenticated','public.crm_tag_bulk_item','SELECT') item",
        )) as Array<{ preview: boolean; apply: boolean; item: boolean }>;
        expect(grants[0]).toEqual({ preview: false, apply: false, item: false });
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
