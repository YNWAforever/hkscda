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
  "uncommitted content publication cannot enter the public repair claim",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback synthetic content repair fixture");
    const actor = crypto.randomUUID();
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
        const [created] = await tx.unsafe(
          "select public.create_content_revision_with_audit($1::uuid,$2::jsonb) as result",
          [
            actor,
            JSON.stringify({
              slug: "media-repair-" + crypto.randomUUID(),
              type: "event",
              title: "Synthetic unpublished repair",
              summary: "No public copy before commit",
            }),
          ],
        );
        const item = created.result as { content_id: string; revision_id: string };
        await tx.unsafe(
          "insert into public.content_public_asset(content_item_id,revision_id,media_id,source_bucket,source_path,public_path,sha256,created_at,next_retry_at) values($1::uuid,$2::uuid,$3::uuid,'content-media-private','private/synthetic.png',$4,$5,now()-interval '1 hour',now()-interval '1 hour')",
          [
            item.content_id,
            item.revision_id,
            crypto.randomUUID(),
            "published/" + item.revision_id + "/synthetic.png",
            "a".repeat(64),
          ],
        );
        await tx`set local role service_role`;
        expect(
          await tx.unsafe(
            "select id from public.claim_due_content_public_assets(now()-interval '5 minutes',50)",
          ),
        ).toHaveLength(0);
        const [grants] = await tx.unsafe(
          "select has_function_privilege('anon','public.claim_due_content_public_assets(timestamptz,integer)','EXECUTE') as anon,has_function_privilege('authenticated','public.claim_due_content_public_assets(timestamptz,integer)','EXECUTE') as authenticated,has_function_privilege('service_role','public.claim_due_content_public_assets(timestamptz,integer)','EXECUTE') as service",
        );
        expect(grants).toEqual({ anon: false, authenticated: false, service: true });
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

// BUG-72: copies of a superseded or archived revision stayed in the public bucket forever.
test.skipIf(!enabled)(
  "BUG-72: publish and archive mark unused public copies; the claim never returns current ones",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback synthetic content withdrawal fixture");
    const actor = crypto.randomUUID();
    type Result = { content_id: string; revision_id: string; version: number };
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
        const service = async (sql: string, params: unknown[]) => {
          await tx`set local role service_role`;
          const rows = await tx.unsafe(sql, params);
          await tx`reset role`;
          return rows;
        };
        const command = async (sql: string, params: unknown[]) =>
          (await service(sql, params))[0].result as Result;
        const approve = (item: Result) =>
          tx.unsafe(
            "insert into public.editorial_content_review(entity_kind,entity_id,revision_key,classification,evidence,reviewed_by) values('content',$1::uuid,$2,'approved','Synthetic BUG-72 fixture only',$3::uuid)",
            [item.content_id, item.revision_id, actor],
          );
        const prepared = async (item: Result) => {
          const media = crypto.randomUUID();
          const [row] = await tx.unsafe(
            "insert into public.content_public_asset(content_item_id,revision_id,media_id,source_bucket,source_path,public_path,sha256,ready) values($1::uuid,$2::uuid,$3::uuid,'content-media-private','private/synthetic.jpg',$4,$5,true) returning id",
            [
              item.content_id,
              item.revision_id,
              media,
              "published/" + item.revision_id + "/" + media + ".jpg",
              "b".repeat(64),
            ],
          );
          return row.id as string;
        };
        const publish = async (item: Result, key: string) => {
          await approve(item);
          return command(
            "select public.publish_content_revision($1::uuid,$2::uuid,$3::uuid,$4,$5) as result",
            [actor, item.content_id, item.revision_id, item.version, key],
          );
        };
        const withdrawn = async (id: string) => {
          const [row] = await tx.unsafe(
            "select withdrawn_at is not null as withdrawn,removed_at is not null as removed from public.content_public_asset where id=$1::uuid",
            [id],
          );
          return row as { withdrawn: boolean; removed: boolean };
        };
        type Claimed = { id: string; removal_lease_token: string };
        const claim = async (): Promise<Claimed[]> =>
          (
            await service(
              "select id,removal_lease_token from public.claim_withdrawn_content_public_assets(50)",
              [],
            )
          ).map((row: Claimed) => ({ id: row.id, removal_lease_token: row.removal_lease_token }));

        const created = await command(
          "select public.create_content_revision_with_audit($1::uuid,$2::jsonb) as result",
          [
            actor,
            JSON.stringify({
              slug: "bug72-" + crypto.randomUUID(),
              type: "event",
              title: "Synthetic withdrawal story",
              summary: "Synthetic public copy withdrawal",
            }),
          ],
        );
        const first = await command(
          "select public.mutate_content_revision_with_audit($1::uuid,$2::uuid,$3,'create_media',$4::jsonb) as result",
          [
            actor,
            created.content_id,
            created.version,
            JSON.stringify({
              storageBucket: "content-media",
              storagePath: created.content_id + "/cover.jpg",
              altText: "Synthetic cover",
              isCover: true,
            }),
          ],
        );
        const firstCopy = await prepared(first);
        const live = await publish(first, "bug72-first-" + crypto.randomUUID());
        // Normal path: the published revision's copy is untouched.
        expect(await withdrawn(firstCopy)).toEqual({ withdrawn: false, removed: false });

        const second = await command(
          "select public.mutate_content_revision_with_audit($1::uuid,$2::uuid,$3,'save_content',$4::jsonb) as result",
          [actor, created.content_id, live.version, JSON.stringify({ title: "Photo removed" })],
        );
        const secondCopy = await prepared(second);
        const republished = await publish(second, "bug72-second-" + crypto.randomUUID());
        expect(await withdrawn(firstCopy)).toEqual({ withdrawn: true, removed: false });
        expect(await withdrawn(secondCopy)).toEqual({ withdrawn: false, removed: false });

        const claimed = await claim();
        expect(claimed.map((row) => row.id)).toEqual([firstCopy]);
        // A current copy wrongly marked withdrawn is still never handed out for deletion.
        await tx.unsafe(
          "update public.content_public_asset set withdrawn_at=now() where id=$1::uuid",
          [secondCopy],
        );
        expect(await claim()).toEqual([]);
        await tx.unsafe(
          "update public.content_public_asset set withdrawn_at=null where id=$1::uuid",
          [secondCopy],
        );

        const mark = async (id: string, token: string) =>
          (
            await service(
              "select public.mark_content_public_asset_removed($1::uuid,$2::uuid) as ok",
              [id, token],
            )
          )[0].ok as boolean;
        expect(await mark(firstCopy, crypto.randomUUID())).toBe(false);
        expect(await mark(firstCopy, claimed[0].removal_lease_token)).toBe(true);
        expect(await mark(firstCopy, claimed[0].removal_lease_token)).toBe(false);
        expect(await withdrawn(firstCopy)).toEqual({ withdrawn: true, removed: true });
        expect(await claim()).toEqual([]);

        await command(
          "select public.mutate_content_revision_with_audit($1::uuid,$2::uuid,$3,'archive','{}'::jsonb) as result",
          [actor, created.content_id, republished.version],
        );
        expect(await withdrawn(secondCopy)).toEqual({ withdrawn: true, removed: false });
        expect((await claim()).map((row) => row.id)).toEqual([secondCopy]);

        const [grants] = await tx.unsafe(
          "select has_function_privilege('anon','public.claim_withdrawn_content_public_assets(integer)','EXECUTE') as anon_claim,has_function_privilege('authenticated','public.mark_content_public_asset_removed(uuid,uuid)','EXECUTE') as authenticated_mark,has_function_privilege('service_role','public.claim_withdrawn_content_public_assets(integer)','EXECUTE') as service_claim,has_function_privilege('service_role','public.mark_content_public_asset_removed(uuid,uuid)','EXECUTE') as service_mark",
        );
        expect(grants).toEqual({
          anon_claim: false,
          authenticated_mark: false,
          service_claim: true,
          service_mark: true,
        });
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
