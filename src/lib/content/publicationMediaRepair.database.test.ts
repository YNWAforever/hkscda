import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.MEDIA_REPAIR_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== "57322" || target.pathname !== "/postgres")
    throw new Error("Content repair fixtures require the dedicated loopback DB");
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
