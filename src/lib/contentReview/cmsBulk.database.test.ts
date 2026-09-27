import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.CMS_REVIEW_BULK_TEST_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).port !== "57322" ||
    new URL(url).pathname !== "/postgres")
)
  throw new Error("Dedicated local CMS review database required");

test.skipIf(!url || process.env.CMS_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "CMS editorial bulk RPC is installed",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    try {
      const rows =
        await db`select to_regprocedure('public.create_cms_review_bulk_preview(uuid,uuid[],text,text)') as signature`;
      expect(rows[0].signature).not.toBeNull();
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!url || process.env.CMS_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "CMS bulk skips published/classified records and fences draft and status changes",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback CMS review fixture");
    const actor = crypto.randomUUID(),
      admin = crypto.randomUUID();
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
    const revisions = ids.map(() => crypto.randomUUID());
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(id,auth_user_id,email,role,status) values($1::uuid,$2::uuid,$3,'admin','active')",
          [admin, actor, actor + "@example.invalid"],
        );
        for (const [index, id] of ids.entries()) {
          await tx.unsafe(
            "insert into public.content_item(id,slug,type,title,summary,status,published_at,created_by,updated_by) values($1::uuid,$2,'report',$3,'Synthetic summary',$4,case when $4='published' then now() else null end,$5::uuid,$5::uuid)",
            [
              id,
              "synthetic-cms-bulk-" + index + "-" + id.slice(0, 8),
              "Synthetic CMS " + index,
              index === 2 ? "published" : "draft",
              admin,
            ],
          );
          await tx.unsafe(
            "insert into public.content_revision(id,content_item_id,version,operation,authoring_snapshot,public_snapshot,created_by) values($1::uuid,$2::uuid,0,'synthetic','{}'::jsonb,'{}'::jsonb,$3::uuid)",
            [revisions[index], id, admin],
          );
          await tx.unsafe(
            "update public.content_item set draft_revision_id=$1::uuid where id=$2::uuid",
            [revisions[index], id],
          );
        }
        await tx.unsafe(
          "insert into public.editorial_content_review(entity_kind,entity_id,revision_key,classification,evidence,reviewed_by) values('content',$1::uuid,$2,'demo','synthetic prior review',$3::uuid)",
          [ids[3], revisions[3], actor],
        );
        const rows = (await tx.unsafe(
          "select public.create_cms_review_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
          [actor, "{" + ids.join(",") + "}", "Synthetic source requires review", "b".repeat(64)],
        )) as Array<{
          result: {
            operationId: string;
            items: Array<{ status: string; reasonCode: string | null }>;
          };
        }>;
        const op = rows[0]!.result.operationId;
        expect(rows[0]!.result.items.map((item) => item.status)).toEqual([
          "pending",
          "pending",
          "skipped",
          "skipped",
          "pending",
        ]);
        expect(rows[0]!.result.items[2]!.reasonCode).toBe("not_draft");
        expect(rows[0]!.result.items[3]!.reasonCode).toBe("already_classified");
        const apply = async (id: string) =>
          (
            (await tx.unsafe(
              "select public.apply_cms_review_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
              [actor, op, id],
            )) as Array<{ result: { status: string; reasonCode: string | null } }>
          )[0]!.result;
        expect((await apply(ids[0]!)).status).toBe("succeeded");
        expect((await apply(ids[0]!)).status).toBe("succeeded");
        const later = crypto.randomUUID();
        await tx.unsafe(
          "insert into public.content_revision(id,content_item_id,version,operation,authoring_snapshot,public_snapshot,created_by) values($1::uuid,$2::uuid,1,'synthetic_new','{}'::jsonb,'{}'::jsonb,$3::uuid)",
          [later, ids[1], admin],
        );
        await tx.unsafe(
          "update public.content_item set draft_revision_id=$1::uuid where id=$2::uuid",
          [later, ids[1]],
        );
        expect(await apply(ids[1]!)).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
        await tx.unsafe("update public.content_item set status='archived' where id=$1::uuid", [
          ids[4],
        ]);
        expect(await apply(ids[4]!)).toMatchObject({ status: "skipped", reasonCode: "not_draft" });
        const review = (await tx.unsafe(
          "select classification,evidence from public.editorial_content_review where entity_kind='content' and entity_id=$1::uuid and revision_key=$2",
          [ids[0], revisions[0]],
        )) as Array<{ classification: string; evidence: string }>;
        expect(review[0]).toEqual({
          classification: "needs_review",
          evidence: "Synthetic source requires review",
        });
        const audit = (await tx.unsafe(
          "select count(*)::int n from public.audit_log where actor_user_id=$1::uuid and action='editorial.review'",
          [actor],
        )) as Array<{ n: number }>;
        expect(audit[0]!.n).toBe(1);
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

test.skipIf(!url || process.env.CMS_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "CMS bulk rejects revoked actor and expiry and rolls back editorial audit failure",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback CMS safety fixture");
    const actor = crypto.randomUUID(),
      admin = crypto.randomUUID(),
      id = crypto.randomUUID(),
      revision = crypto.randomUUID();
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(id,auth_user_id,email,role,status) values($1::uuid,$2::uuid,$3,'admin','active')",
          [admin, actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.content_item(id,slug,type,title,summary,created_by,updated_by) values($1::uuid,$2,'report','Synthetic CMS','Synthetic summary',$3::uuid,$3::uuid)",
          [id, "synthetic-cms-safety-" + id.slice(0, 8), admin],
        );
        await tx.unsafe(
          "insert into public.content_revision(id,content_item_id,version,operation,authoring_snapshot,public_snapshot,created_by) values($1::uuid,$2::uuid,0,'synthetic','{}'::jsonb,'{}'::jsonb,$3::uuid)",
          [revision, id, admin],
        );
        await tx.unsafe(
          "update public.content_item set draft_revision_id=$1::uuid where id=$2::uuid",
          [revision, id],
        );
        const fail = async (call: () => Promise<unknown>, errno: string) => {
          await tx.unsafe("savepoint cms_bulk_failure");
          let received: unknown;
          try {
            await call();
          } catch (error) {
            received = error;
          }
          await tx.unsafe("rollback to savepoint cms_bulk_failure");
          expect((received as { errno?: string } | undefined)?.errno).toBe(errno);
        };
        const many = Array.from({ length: 1001 }, () => crypto.randomUUID());
        await fail(
          () =>
            tx.unsafe("select public.create_cms_review_bulk_preview($1::uuid,$2::uuid[],$3,$4)", [
              actor,
              "{" + many.join(",") + "}",
              "synthetic",
              "b".repeat(64),
            ]),
          "22023",
        );
        const rows = (await tx.unsafe(
          "select public.create_cms_review_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
          [actor, "{" + id + "}", "synthetic", "b".repeat(64)],
        )) as Array<{ result: { operationId: string } }>;
        const op = rows[0]!.result.operationId;
        const apply = () =>
          tx.unsafe("select public.apply_cms_review_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
            actor,
            op,
            id,
          ]);
        await tx.unsafe(
          "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
          [actor],
        );
        await fail(apply, "42501");
        await tx.unsafe(
          "update public.admin_user set status='active',role='staff' where auth_user_id=$1::uuid",
          [actor],
        );
        await fail(apply, "42501");
        await tx.unsafe("update public.admin_user set role='admin' where auth_user_id=$1::uuid", [
          actor,
        ]);
        await tx.unsafe(
          "update public.cms_review_bulk_operation set expires_at=now()-interval '1 second' where id=$1::uuid",
          [op],
        );
        await fail(apply, "P0001");
        await tx.unsafe(
          "update public.cms_review_bulk_operation set expires_at=now()+interval '15 minutes' where id=$1::uuid",
          [op],
        );
        await tx.unsafe(
          "create function pg_temp.fail_cms_review_audit() returns trigger language plpgsql as $$ begin if new.action='editorial.review' then raise exception 'synthetic audit failure' using errcode='P0002';end if;return new;end $$",
        );
        await tx.unsafe(
          "create trigger fail_cms_review_audit before insert on public.audit_log for each row execute function pg_temp.fail_cms_review_audit()",
        );
        await fail(apply, "P0002");
        const reviews = (await tx.unsafe(
          "select count(*)::int n from public.editorial_content_review where entity_kind='content' and entity_id=$1::uuid",
          [id],
        )) as Array<{ n: number }>;
        expect(reviews[0]!.n).toBe(0);
        const item = (await tx.unsafe(
          "select status from public.cms_review_bulk_item where operation_id=$1::uuid and content_id=$2::uuid",
          [op, id],
        )) as Array<{ status: string }>;
        expect(item[0]!.status).toBe("pending");
        await tx.unsafe("drop trigger fail_cms_review_audit on public.audit_log");
        const grants = (await tx.unsafe(
          "select has_function_privilege('authenticated','public.create_cms_review_bulk_preview(uuid,uuid[],text,text)','EXECUTE') preview,has_function_privilege('anon','public.apply_cms_review_bulk_item(uuid,uuid,uuid)','EXECUTE') apply,has_table_privilege('authenticated','public.cms_review_bulk_item','SELECT') item",
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
