import { SQL } from "bun";
import { expect, test } from "bun:test";
import {
  createCmsReviewBulkHandler,
  type CmsReviewBulkOperation,
} from "../../routes/api/admin/content/review-bulk";

const url = process.env.CMS_REVIEW_BULK_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.protocol !== "postgresql:" ||
    target.hostname !== "127.0.0.1" ||
    target.search ||
    target.hash ||
    ![
      "57322/postgres",
      "52322/audit_pr135_20260929",
      ...(process.env.CI ? ["55322/postgres"] : []),
    ].includes(`${target.port}${target.pathname}`)
  )
    throw new Error("Dedicated disposable CMS review bulk database required");
}

for (const heldRow of ["operation", "content_item"] as const)
  test.skipIf(!url || process.env.CMS_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
    "cms bulk rejects expiry while blocked on " + heldRow,
    async () => {
      const db = new SQL(url!, { max: 1, prepare: false });
      const locker = new SQL(url!, { max: 1, prepare: false });
      const applier = new SQL(url!, { max: 1, prepare: false });
      const actor = crypto.randomUUID(),
        admin = crypto.randomUUID();
      const revision = crypto.randomUUID(),
        caseId = crypto.randomUUID();
      let operation: string | undefined;
      let applying: Promise<{ error?: unknown }> | undefined;
      try {
        await db.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await db.unsafe(
          "insert into public.admin_user(id,auth_user_id,email,role,status) values($1::uuid,$2::uuid,$3,'admin','active')",
          [admin, actor, actor + "@example.invalid"],
        );
        await db.unsafe(
          "insert into public.content_item(id,slug,type,title,summary,status,created_by,updated_by) values($1::uuid,$2,'report','Synthetic expiry CMS','Synthetic summary','draft',$3::uuid,$3::uuid)",
          [caseId, "synthetic-expiry-" + caseId, admin],
        );
        await db.unsafe(
          "insert into public.content_revision(id,content_item_id,version,operation,authoring_snapshot,public_snapshot,created_by) values($1::uuid,$2::uuid,0,'synthetic','{}'::jsonb,'{}'::jsonb,$3::uuid)",
          [revision, caseId, admin],
        );
        await db.unsafe(
          "update public.content_item set draft_revision_id=$1::uuid where id=$2::uuid",
          [revision, caseId],
        );
        await db.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          operation = (
            await tx.unsafe(
              "select public.create_cms_review_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
              [actor, "{" + caseId + "}", "Synthetic expiry evidence", "e".repeat(64)],
            )
          )[0].result.operationId;
        });
        await db.unsafe(
          "update public.cms_review_bulk_operation set expires_at=pg_catalog.clock_timestamp()+interval '2 seconds' where id=$1::uuid",
          [operation!],
        );
        const state = async () => ({
          entity: [
            ...(await db.unsafe("select * from public.content_item where id=$1::uuid", [caseId])),
          ],
          draft: [
            ...(await db.unsafe(
              "select * from public.content_revision where content_item_id=$1::uuid",
              [caseId],
            )),
          ],
          review: [
            ...(await db.unsafe(
              "select * from public.editorial_content_review where entity_kind='content' and entity_id=$1::uuid",
              [caseId],
            )),
          ],
          item: [
            ...(await db.unsafe(
              "select * from public.cms_review_bulk_item where operation_id=$1::uuid",
              [operation!],
            )),
          ],
          audits: [
            ...(await db.unsafe(
              "select * from public.audit_log where actor_user_id=$1::uuid order by id",
              [actor],
            )),
          ],
        });
        const before = await state();
        const pid = (await applier.unsafe("select pg_backend_pid() pid"))[0].pid as number;
        await locker.begin(async (tx) => {
          const lockPid = (await tx.unsafe("select pg_backend_pid() pid"))[0].pid as number;
          await tx.unsafe(
            heldRow === "operation"
              ? "select id from public.cms_review_bulk_operation where id=$1::uuid for update"
              : "select id from public.content_item where id=$1::uuid for update",
            [heldRow === "operation" ? operation! : caseId],
          );
          expect(
            (
              await db.unsafe(
                "select expires_at>pg_catalog.clock_timestamp() live from public.cms_review_bulk_operation where id=$1::uuid",
                [operation!],
              )
            )[0].live,
          ).toBe(true);
          applying = applier
            .begin(async (apply) => {
              await apply.unsafe("set local role service_role");
              await apply.unsafe("set local statement_timeout='10s'");
              await apply.unsafe(
                "select public.apply_cms_review_bulk_item($1::uuid,$2::uuid,$3::uuid)",
                [actor, operation!, caseId],
              );
            })
            .then(
              () => ({}),
              (error: unknown) => ({ error }),
            );
          const deadline = Date.now() + 8000;
          while (
            !(
              await db.unsafe("select $2::int=any(pg_catalog.pg_blocking_pids($1::int)) blocked", [
                pid,
                lockPid,
              ])
            )[0].blocked
          ) {
            if (Date.now() > deadline) throw new Error("Apply backend did not block on held row");
            await Bun.sleep(20);
          }
          expect(
            (
              await db.unsafe(
                "select expires_at>pg_catalog.clock_timestamp() live from public.cms_review_bulk_operation where id=$1::uuid",
                [operation!],
              )
            )[0].live,
          ).toBe(true);
          while (
            !(
              await db.unsafe(
                "select expires_at<=pg_catalog.clock_timestamp() expired from public.cms_review_bulk_operation where id=$1::uuid",
                [operation!],
              )
            )[0].expired
          ) {
            if (Date.now() > deadline) throw new Error("Database clock did not reach expiry");
            await Bun.sleep(20);
          }
          expect(
            (
              await db.unsafe("select $2::int=any(pg_catalog.pg_blocking_pids($1::int)) blocked", [
                pid,
                lockPid,
              ])
            )[0].blocked,
          ).toBe(true);
        });
        const result = await applying!;
        expect((result.error as { errno?: string } | undefined)?.errno).toBe("P0001");
        const handler = createCmsReviewBulkHandler({
          authorize: async () => actor,
          preview: async () => {
            throw new Error("Unexpected preview");
          },
          read: async () =>
            await db.begin(async (tx) => {
              await tx.unsafe("set local role service_role");
              return (
                await tx.unsafe(
                  "select public.get_cms_review_bulk_operation($1::uuid,$2::uuid) result",
                  [actor, operation!],
                )
              )[0].result as CmsReviewBulkOperation;
            }),
          applyItem: async () => {
            throw { code: (result.error as { errno: string }).errno };
          },
        });
        const response = await handler(
          new Request("https://example.invalid/api/admin/content/review-bulk", {
            method: "POST",
            body: JSON.stringify({ action: "apply", operationId: operation }),
          }),
        );
        expect(response.status).toBe(409);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({ error: "Preview expired" });
        expect(await state()).toEqual(before);
      } finally {
        if (applying) await applying;
        await db.unsafe("delete from public.audit_log where actor_user_id=$1::uuid", [actor]);
        if (operation) {
          await db.unsafe("delete from public.cms_review_bulk_item where operation_id=$1::uuid", [
            operation,
          ]);
          await db.unsafe("delete from public.cms_review_bulk_operation where id=$1::uuid", [
            operation,
          ]);
        }
        await db.unsafe(
          "delete from public.editorial_content_review where entity_kind='content' and entity_id=$1::uuid",
          [caseId],
        );
        await db.unsafe("update public.content_item set draft_revision_id=null where id=$1::uuid", [
          caseId,
        ]);
        await db.unsafe("delete from public.content_revision where content_item_id=$1::uuid", [
          caseId,
        ]);
        await db.unsafe("delete from public.content_item where id=$1::uuid", [caseId]);
        await db.unsafe("delete from public.admin_user where auth_user_id=$1::uuid", [actor]);
        await db.unsafe("delete from auth.users where id=$1::uuid", [actor]);
        await applier.close();
        await locker.close();
        await db.close();
      }
    },
    30000,
  );

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
        const rpc = async (query: string, params: string[]) => {
          await tx.unsafe("set local role service_role");
          const result = await tx.unsafe(query, params);
          await tx.unsafe("reset role");
          return result;
        };
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
        const rows = (await rpc(
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
            (await rpc(
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
        const rpc = async (query: string, params: string[]) => {
          await tx.unsafe("set local role service_role");
          const result = await tx.unsafe(query, params);
          await tx.unsafe("reset role");
          return result;
        };
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
            rpc("select public.create_cms_review_bulk_preview($1::uuid,$2::uuid[],$3,$4)", [
              actor,
              "{" + many.join(",") + "}",
              "synthetic",
              "b".repeat(64),
            ]),
          "22023",
        );
        const rows = (await rpc(
          "select public.create_cms_review_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
          [actor, "{" + id + "}", "synthetic", "b".repeat(64)],
        )) as Array<{ result: { operationId: string } }>;
        const op = rows[0]!.result.operationId;
        const apply = () =>
          rpc("select public.apply_cms_review_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
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

for (const mode of ["actor", "draft"] as const)
  test.skipIf(!url || process.env.CMS_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
    "CMS review bulk holds " + mode + " eligibility until commit",
    async () => {
      const db = new SQL(url!, { max: 1, prepare: false });
      const other = new SQL(url!, { max: 1, prepare: false });
      const actor = crypto.randomUUID(),
        animal = crypto.randomUUID(),
        admin = crypto.randomUUID(),
        revision = crypto.randomUUID();
      let operation: string | undefined;
      try {
        expect(
          (
            await db.unsafe(
              "select to_regprocedure('public.apply_cms_review_bulk_item(uuid,uuid,uuid)') f",
            )
          )[0].f,
        ).not.toBeNull();
        await db.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await db.unsafe(
          "insert into public.admin_user(id,auth_user_id,email,role,status) values($1::uuid,$2::uuid,$3,'admin','active')",
          [admin, actor, actor + "@example.invalid"],
        );
        await db.unsafe(
          "insert into public.content_item(id,slug,type,title,summary,status,created_by,updated_by) values($1::uuid,$2,'report','Synthetic review lock','synthetic','draft',$3::uuid,$3::uuid)",
          [animal, "synthetic-lock-" + animal, admin],
        );
        await db.unsafe(
          "insert into public.content_revision(id,content_item_id,version,operation,authoring_snapshot,public_snapshot,created_by) values($1::uuid,$2::uuid,0,'synthetic','{}'::jsonb,'{}'::jsonb,$3::uuid)",
          [revision, animal, admin],
        );
        await db.unsafe(
          "update public.content_item set draft_revision_id=$1::uuid where id=$2::uuid",
          [revision, animal],
        );
        await db.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          operation = (
            await tx.unsafe(
              "select public.create_cms_review_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
              [actor, "{" + animal + "}", "Synthetic lock review", "a".repeat(64)],
            )
          )[0].result.operationId;
        });
        const rewind = new Error("rewind CMS review lock");
        try {
          await db.begin(async (tx) => {
            await tx.unsafe("set local role service_role");
            await tx.unsafe(
              "select public.apply_cms_review_bulk_item($1::uuid,$2::uuid,$3::uuid)",
              [actor, operation!, animal],
            );
            const changes =
              mode === "actor"
                ? [
                    [
                      "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
                      actor,
                    ],
                    [
                      "update auth.users set banned_until=now()+interval '1 day' where id=$1::uuid",
                      actor,
                    ],
                  ]
                : [["update public.content_item set status='archived' where id=$1::uuid", animal]];
            for (const [query, id] of changes)
              await expect(
                other.begin(async (tx2) => {
                  await tx2.unsafe("set local lock_timeout='150ms'");
                  await tx2.unsafe(query, [id]);
                }),
              ).rejects.toMatchObject({ errno: "55P03" });
            throw rewind;
          });
        } catch (error) {
          if (error !== rewind) throw error;
        }
        const apply = (connection: SQL) =>
          connection.begin(async (tx) => {
            await tx.unsafe("set local role service_role");
            return (
              await tx.unsafe(
                "select public.apply_cms_review_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
                [actor, operation!, animal],
              )
            )[0].result.status as string;
          });
        expect(await Promise.all([apply(db), apply(other)])).toEqual(["succeeded", "succeeded"]);
        expect(
          (
            await db.unsafe(
              "select count(*)::int n from public.audit_log where actor_user_id=$1::uuid and action='editorial.review'",
              [actor],
            )
          )[0].n,
        ).toBe(1);
        expect(
          (await db.unsafe("select status from public.content_item where id=$1::uuid", [animal]))[0]
            .status,
        ).toBe("draft");
      } finally {
        if (operation) {
          await db.unsafe("delete from public.cms_review_bulk_item where operation_id=$1::uuid", [
            operation,
          ]);
          await db.unsafe("delete from public.cms_review_bulk_operation where id=$1::uuid", [
            operation,
          ]);
        }
        await db.unsafe(
          "delete from public.editorial_content_review where entity_kind='content' and entity_id=$1::uuid",
          [animal],
        );
        await db.unsafe("update public.content_item set draft_revision_id=null where id=$1::uuid", [
          animal,
        ]);
        await db.unsafe("delete from public.content_revision where content_item_id=$1::uuid", [
          animal,
        ]);
        await db.unsafe("delete from public.content_item where id=$1::uuid", [animal]);
        await db.unsafe("delete from public.audit_log where actor_user_id=$1::uuid", [actor]);
        await db.unsafe("delete from public.admin_user where auth_user_id=$1::uuid", [actor]);
        await db.unsafe("delete from auth.users where id=$1::uuid", [actor]);
        await other.close();
        await db.close();
      }
    },
    30000,
  );

test.skipIf(!url || process.env.CMS_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "1000 CMS drafts preserve content and immutable revisions across partial review results",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const actor = crypto.randomUUID(),
      admin = crypto.randomUUID(),
      rollback = new Error("rollback1000CMS");
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
        const ids = Array.from({ length: 1000 }, () => crypto.randomUUID()),
          revisions = ids.map(() => crypto.randomUUID());
        const packed = "{" + ids.join(",") + "}",
          packedRevisions = "{" + revisions.join(",") + "}";
        await tx.unsafe(
          "insert into public.content_item(id,slug,type,title,summary,status,published_at,created_by,updated_by) select id,'synthetic-thousand-'||id,'report','Synthetic CMS '||n,'Synthetic summary',case when n<=100 then 'published' else 'draft' end,case when n<=100 then now() else null end,$2::uuid,$2::uuid from unnest($1::uuid[]) with ordinality as t(id,n)",
          [packed, admin],
        );
        await tx.unsafe(
          "insert into public.content_revision(id,content_item_id,version,operation,authoring_snapshot,public_snapshot,created_by) select revision,id,0,'synthetic','{}'::jsonb,'{}'::jsonb,$3::uuid from unnest($1::uuid[],$2::uuid[]) as t(id,revision)",
          [packed, packedRevisions, admin],
        );
        await tx.unsafe(
          "update public.content_item c set draft_revision_id=t.revision from unnest($1::uuid[],$2::uuid[]) as t(id,revision) where c.id=t.id",
          [packed, packedRevisions],
        );
        await tx.unsafe(
          "insert into public.editorial_content_review(entity_kind,entity_id,revision_key,classification,evidence,reviewed_by) select 'content',id,revision::text,'approved','synthetic',$3::uuid from unnest($1::uuid[],$2::uuid[]) as t(id,revision)",
          [
            "{" + ids.slice(100, 200).join(",") + "}",
            "{" + revisions.slice(100, 200).join(",") + "}",
            actor,
          ],
        );
        await tx.unsafe("set local role service_role");
        const preview = (
          await tx.unsafe(
            "select public.create_cms_review_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
            [actor, packed, "Synthetic 1000 source", "e".repeat(64)],
          )
        )[0].result as { operationId: string; items: Array<{ status: string }> };
        expect(preview.items).toHaveLength(1000);
        expect(preview.items.filter((i) => i.status === "pending")).toHaveLength(800);
        await tx.unsafe("reset role");
        const later = crypto.randomUUID();
        await tx.unsafe(
          "insert into public.content_revision(id,content_item_id,version,operation,authoring_snapshot,public_snapshot,created_by) values($1::uuid,$2::uuid,1,'synthetic_new','{}'::jsonb,'{}'::jsonb,$3::uuid)",
          [later, ids[200], admin],
        );
        await tx.unsafe(
          "update public.content_item set draft_revision_id=$1::uuid where id=$2::uuid",
          [later, ids[200]],
        );
        await tx.unsafe("update public.content_item set status='archived' where id=$1::uuid", [
          ids[201],
        ]);
        await tx.unsafe(
          "insert into public.editorial_content_review(entity_kind,entity_id,revision_key,classification,evidence,reviewed_by) values('content',$1::uuid,$2,'approved','concurrent synthetic review',$3::uuid)",
          [ids[202], revisions[202], actor],
        );
        await tx.unsafe("update public.content_item set draft_revision_id=null where id=$1::uuid", [
          ids[203],
        ]);
        const contentHash =
          "select md5(string_agg(to_jsonb(c)::text,'' order by id)) h from public.content_item c where id=any($1::uuid[])";
        const revisionHash =
          "select md5(string_agg(to_jsonb(r)::text,'' order by id)) h from public.content_revision r where content_item_id=any($1::uuid[])";
        const before = (await tx.unsafe(contentHash, [packed]))[0].h,
          revisionsBefore = (await tx.unsafe(revisionHash, [packed]))[0].h;
        await tx.unsafe("set local role service_role");
        const results = await tx.unsafe(
          "select public.apply_cms_review_bulk_item($1::uuid,$2::uuid,id) result from unnest($3::uuid[]) id",
          [actor, preview.operationId, packed],
        );
        const statuses = results.map((r: { result: { status: string } }) => r.result.status);
        expect(statuses.filter((s: string) => s === "succeeded")).toHaveLength(796);
        expect(statuses.filter((s: string) => s === "skipped")).toHaveLength(202);
        expect(statuses.filter((s: string) => s === "conflict")).toHaveLength(2);
        await tx.unsafe(
          "select public.apply_cms_review_bulk_item($1::uuid,$2::uuid,id) from unnest($3::uuid[]) id",
          [actor, preview.operationId, packed],
        );
        await tx.unsafe("reset role");
        expect(
          (
            await tx.unsafe(
              "select count(*)::int n from public.audit_log where actor_user_id=$1::uuid and action='editorial.review'",
              [actor],
            )
          )[0].n,
        ).toBe(796);
        expect((await tx.unsafe(contentHash, [packed]))[0].h).toBe(before);
        expect((await tx.unsafe(revisionHash, [packed]))[0].h).toBe(revisionsBefore);
        for (const role of ["anon", "authenticated"]) {
          await tx.unsafe("savepoint role_denial");
          await tx.unsafe("set local role " + role);
          let error: unknown;
          try {
            await tx.unsafe("select public.get_cms_review_bulk_operation($1::uuid,$2::uuid)", [
              actor,
              preview.operationId,
            ]);
          } catch (cause) {
            error = cause;
          }
          await tx.unsafe("rollback to savepoint role_denial");
          expect((error as { errno?: string } | undefined)?.errno).toBe("42501");
        }
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
