import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.ANIMAL_REVIEW_BULK_TEST_DATABASE_URL;
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
    throw new Error("Dedicated disposable animal review bulk database required");
}

test.skipIf(!url || process.env.ANIMAL_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "animal editorial bulk RPC is installed",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    try {
      const rows =
        await db`select to_regprocedure('public.create_animal_review_bulk_preview(uuid,uuid[],text,text)') as signature`;
      expect(rows[0].signature).not.toBeNull();
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!url || process.env.ANIMAL_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "animal review bulk keeps published/classified rows safe and fences stale revisions",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback animal review fixture");
    const actor = crypto.randomUUID();
    const ids = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
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
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'admin','active')",
          [actor, actor + "@example.invalid"],
        );
        for (const [index, id] of ids.entries()) {
          await tx.unsafe(
            "insert into public.animals(id,type,name,gender,age,status,publication_state) values($1::uuid,'cat',$2,'female','adult','available',$3)",
            [id, "Synthetic cat " + index, index === 2 ? "published" : "draft"],
          );
          await tx.unsafe(
            "insert into public.animal_draft(id,body,revision,updated_by) values($1::uuid,'{}'::jsonb,1,$2::uuid)",
            [id, actor],
          );
        }
        await tx.unsafe(
          "insert into public.editorial_content_review(entity_kind,entity_id,revision_key,classification,evidence,reviewed_by) values('animal',$1::uuid,'1','approved','synthetic approved',$2::uuid)",
          [ids[3], actor],
        );
        const rows = (await rpc(
          "select public.create_animal_review_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
          [actor, "{" + ids.join(",") + "}", "Synthetic source requires review", "a".repeat(64)],
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
        expect(rows[0]!.result.items[2]!.reasonCode).toBe("published");
        expect(rows[0]!.result.items[3]!.reasonCode).toBe("already_classified");
        const apply = async (id: string) =>
          (
            (await rpc(
              "select public.apply_animal_review_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
              [actor, op, id],
            )) as Array<{ result: { status: string; reasonCode: string | null } }>
          )[0]!.result;
        expect((await apply(ids[0]!)).status).toBe("succeeded");
        expect((await apply(ids[0]!)).status).toBe("succeeded");
        await tx.unsafe("update public.animal_draft set revision=2 where id=$1::uuid", [ids[1]]);
        expect(await apply(ids[1]!)).toMatchObject({
          status: "conflict",
          reasonCode: "version_changed",
        });
        await tx.unsafe(
          "update public.animals set publication_state='published' where id=$1::uuid",
          [ids[4]],
        );
        expect(await apply(ids[4]!)).toMatchObject({ status: "skipped", reasonCode: "published" });
        const review = (await tx.unsafe(
          "select classification,evidence from public.editorial_content_review where entity_kind='animal' and entity_id=$1::uuid and revision_key='1'",
          [ids[0]],
        )) as Array<{ classification: string; evidence: string }>;
        expect(review[0]).toEqual({
          classification: "needs_review",
          evidence: "Synthetic source requires review",
        });
        const audits = (await tx.unsafe(
          "select count(*)::int count from public.audit_log where actor_user_id=$1::uuid and action='editorial.review'",
          [actor],
        )) as Array<{ count: number }>;
        expect(audits[0]!.count).toBe(1);
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

test.skipIf(!url || process.env.ANIMAL_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "animal review bulk rejects revoked actor/expiry and rolls back editorial audit failure",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback animal review safety fixture");
    const actor = crypto.randomUUID(),
      animal = crypto.randomUUID();
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
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'admin','active')",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.animals(id,type,name,gender,age,status,publication_state) values($1::uuid,'dog','Synthetic dog','male','adult','available','draft')",
          [animal],
        );
        await tx.unsafe(
          "insert into public.animal_draft(id,body,revision,updated_by) values($1::uuid,'{}'::jsonb,1,$2::uuid)",
          [animal, actor],
        );
        const fail = async (call: () => Promise<unknown>, errno: string) => {
          await tx.unsafe("savepoint animal_review_failure");
          let received: unknown;
          try {
            await call();
          } catch (error) {
            received = error;
          }
          await tx.unsafe("rollback to savepoint animal_review_failure");
          expect((received as { errno?: string } | undefined)?.errno).toBe(errno);
        };
        const many = Array.from({ length: 1001 }, () => crypto.randomUUID());
        await fail(
          () =>
            rpc("select public.create_animal_review_bulk_preview($1::uuid,$2::uuid[],$3,$4)", [
              actor,
              "{" + many.join(",") + "}",
              "synthetic",
              "a".repeat(64),
            ]),
          "22023",
        );
        const rows = (await rpc(
          "select public.create_animal_review_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
          [actor, "{" + animal + "}", "synthetic", "a".repeat(64)],
        )) as Array<{ result: { operationId: string } }>;
        const op = rows[0]!.result.operationId;
        const apply = () =>
          rpc("select public.apply_animal_review_bulk_item($1::uuid,$2::uuid,$3::uuid)", [
            actor,
            op,
            animal,
          ]);
        await tx.unsafe(
          "update public.admin_user set status='disabled' where auth_user_id=$1::uuid",
          [actor],
        );
        await fail(apply, "42501");
        await tx.unsafe(
          "update public.admin_user set status='active' where auth_user_id=$1::uuid",
          [actor],
        );
        await tx.unsafe("update public.admin_user set role='staff' where auth_user_id=$1::uuid", [
          actor,
        ]);
        await fail(apply, "42501");
        await tx.unsafe("update public.admin_user set role='admin' where auth_user_id=$1::uuid", [
          actor,
        ]);
        await tx.unsafe(
          "update public.animal_review_bulk_operation set expires_at=now()-interval '1 second' where id=$1::uuid",
          [op],
        );
        await fail(apply, "P0001");
        await tx.unsafe(
          "update public.animal_review_bulk_operation set expires_at=now()+interval '15 minutes' where id=$1::uuid",
          [op],
        );
        await tx.unsafe(
          "create function pg_temp.fail_animal_review_audit() returns trigger language plpgsql as $$ begin if new.action='editorial.review' then raise exception 'synthetic audit failure' using errcode='P0002';end if;return new;end $$",
        );
        await tx.unsafe(
          "create trigger fail_animal_review_audit before insert on public.audit_log for each row execute function pg_temp.fail_animal_review_audit()",
        );
        await fail(apply, "P0002");
        const reviews = (await tx.unsafe(
          "select count(*)::int count from public.editorial_content_review where entity_kind='animal' and entity_id=$1::uuid",
          [animal],
        )) as Array<{ count: number }>;
        expect(reviews[0]!.count).toBe(0);
        const item = (await tx.unsafe(
          "select status from public.animal_review_bulk_item where operation_id=$1::uuid and animal_id=$2::uuid",
          [op, animal],
        )) as Array<{ status: string }>;
        expect(item[0]!.status).toBe("pending");
        await tx.unsafe("drop trigger fail_animal_review_audit on public.audit_log");
        const grants = (await tx.unsafe(
          "select has_function_privilege('authenticated','public.create_animal_review_bulk_preview(uuid,uuid[],text,text)','EXECUTE') preview,has_function_privilege('anon','public.apply_animal_review_bulk_item(uuid,uuid,uuid)','EXECUTE') apply,has_table_privilege('authenticated','public.animal_review_bulk_item','SELECT') item",
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
  test.skipIf(!url || process.env.ANIMAL_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
    "animal review bulk holds " + mode + " eligibility until commit",
    async () => {
      const db = new SQL(url!, { max: 1, prepare: false });
      const other = new SQL(url!, { max: 1, prepare: false });
      const actor = crypto.randomUUID(),
        animal = crypto.randomUUID();
      let operation: string | undefined;
      try {
        expect(
          (
            await db.unsafe(
              "select to_regprocedure('public.apply_animal_review_bulk_item(uuid,uuid,uuid)') f",
            )
          )[0].f,
        ).not.toBeNull();
        await db.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await db.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'admin','active')",
          [actor, actor + "@example.invalid"],
        );
        await db.unsafe(
          "insert into public.animals(id,type,name,gender,age,status,publication_state) values($1::uuid,'cat','Synthetic review lock','female','adult','available','draft')",
          [animal],
        );
        await db.unsafe(
          "insert into public.animal_draft(id,body,revision,updated_by) values($1::uuid,'{}'::jsonb,1,$2::uuid)",
          [animal, actor],
        );
        await db.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          operation = (
            await tx.unsafe(
              "select public.create_animal_review_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
              [actor, "{" + animal + "}", "Synthetic lock review", "a".repeat(64)],
            )
          )[0].result.operationId;
        });
        const rewind = new Error("rewind animal review lock");
        try {
          await db.begin(async (tx) => {
            await tx.unsafe("set local role service_role");
            await tx.unsafe(
              "select public.apply_animal_review_bulk_item($1::uuid,$2::uuid,$3::uuid)",
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
                : [
                    [
                      "update public.animal_draft set revision=revision+1 where id=$1::uuid",
                      animal,
                    ],
                  ];
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
                "select public.apply_animal_review_bulk_item($1::uuid,$2::uuid,$3::uuid) result",
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
          (
            await db.unsafe("select publication_state from public.animals where id=$1::uuid", [
              animal,
            ])
          )[0].publication_state,
        ).toBe("draft");
      } finally {
        if (operation) {
          await db.unsafe(
            "delete from public.animal_review_bulk_item where operation_id=$1::uuid",
            [operation],
          );
          await db.unsafe("delete from public.animal_review_bulk_operation where id=$1::uuid", [
            operation,
          ]);
        }
        await db.unsafe(
          "delete from public.editorial_content_review where entity_kind='animal' and entity_id=$1::uuid",
          [animal],
        );
        await db.unsafe("delete from public.animal_draft where id=$1::uuid", [animal]);
        await db.unsafe("delete from public.animals where id=$1::uuid", [animal]);
        await db.unsafe("delete from public.audit_log where actor_user_id=$1::uuid", [actor]);
        await db.unsafe("delete from public.admin_user where auth_user_id=$1::uuid", [actor]);
        await db.unsafe("delete from auth.users where id=$1::uuid", [actor]);
        await other.close();
        await db.close();
      }
    },
    30000,
  );

test.skipIf(!url || process.env.ANIMAL_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "1000 animal drafts retain public fields and per-item review outcomes",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const actor = crypto.randomUUID(),
      rollback = new Error("rollback thousand animal review");
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1::uuid,$2,now(),now(),now())",
          [actor, actor + "@example.invalid"],
        );
        await tx.unsafe(
          "insert into public.admin_user(auth_user_id,email,role,status) values($1::uuid,$2,'admin','active')",
          [actor, actor + "@example.invalid"],
        );
        const ids = Array.from({ length: 1000 }, () => crypto.randomUUID());
        const packed = "{" + ids.join(",") + "}";
        await tx.unsafe(
          "insert into public.animals(id,type,name,gender,age,status,publication_state) select id,'cat','Synthetic animal '||ordinality,'female','adult','available',case when ordinality<=100 then 'published' else 'draft' end from unnest($1::uuid[]) with ordinality as t(id,ordinality)",
          [packed],
        );
        await tx.unsafe(
          "insert into public.animal_draft(id,body,revision,updated_by) select id,'{}'::jsonb,1,$2::uuid from unnest($1::uuid[]) id",
          [packed, actor],
        );
        await tx.unsafe(
          "insert into public.editorial_content_review(entity_kind,entity_id,revision_key,classification,evidence,reviewed_by) select 'animal',id,'1','approved','synthetic',$2::uuid from unnest($1::uuid[]) id",
          ["{" + ids.slice(100, 200).join(",") + "}", actor],
        );
        await tx.unsafe("set local role service_role");
        const preview = (
          await tx.unsafe(
            "select public.create_animal_review_bulk_preview($1::uuid,$2::uuid[],$3,$4) result",
            [actor, packed, "Synthetic 1000 source review", "d".repeat(64)],
          )
        )[0].result as { operationId: string; items: Array<{ status: string }> };
        expect(preview.items).toHaveLength(1000);
        expect(preview.items.filter((i) => i.status === "pending")).toHaveLength(800);
        await tx.unsafe("reset role");
        await tx.unsafe("update public.animal_draft set revision=2 where id=$1::uuid", [ids[200]]);
        await tx.unsafe(
          "update public.animals set publication_state='published' where id=$1::uuid",
          [ids[201]],
        );
        await tx.unsafe(
          "insert into public.editorial_content_review(entity_kind,entity_id,revision_key,classification,evidence,reviewed_by) values('animal',$1::uuid,'1','approved','concurrent synthetic review',$2::uuid)",
          [ids[202], actor],
        );
        await tx.unsafe("delete from public.animal_draft where id=$1::uuid", [ids[203]]);
        const before = (
          await tx.unsafe(
            "select md5(string_agg(to_jsonb(a)::text,'' order by id)) h from public.animals a where id=any($1::uuid[])",
            [packed],
          )
        )[0].h;
        await tx.unsafe("set local role service_role");
        const results = await tx.unsafe(
          "select public.apply_animal_review_bulk_item($1::uuid,$2::uuid,id) result from unnest($3::uuid[]) id",
          [actor, preview.operationId, packed],
        );
        const statuses: string[] = results.map(
          (r: { result: { status: string } }) => r.result.status,
        );
        expect(statuses.filter((s) => s === "succeeded")).toHaveLength(796);
        expect(statuses.filter((s) => s === "skipped")).toHaveLength(202);
        expect(statuses.filter((s) => s === "conflict")).toHaveLength(2);
        await tx.unsafe(
          "select public.apply_animal_review_bulk_item($1::uuid,$2::uuid,id) from unnest($3::uuid[]) id",
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
        expect(
          (
            await tx.unsafe(
              "select md5(string_agg(to_jsonb(a)::text,'' order by id)) h from public.animals a where id=any($1::uuid[])",
              [packed],
            )
          )[0].h,
        ).toBe(before);
        expect(
          (
            await tx.unsafe(
              "select has_table_privilege('authenticated','public.animals','UPDATE') allowed",
            )
          )[0].allowed,
        ).toBe(false);
        for (const role of ["anon", "authenticated"]) {
          await tx.unsafe("savepoint role_denial");
          await tx.unsafe("set local role " + role);
          let error: unknown;
          try {
            await tx.unsafe("select public.get_animal_review_bulk_operation($1::uuid,$2::uuid)", [
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
