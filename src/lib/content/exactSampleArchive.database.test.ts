import { SQL } from "bun";
import { expect, test } from "bun:test";
const url = process.env.CMS_LIFECYCLE_TEST_DATABASE_URL;
if (url && (new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "56322"))
  throw new Error("Disposable database required");
test.skipIf(!url || process.env.CMS_LIFECYCLE_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "exact seven-item archive candidate fails closed on drift, preserves revisions and rolls back rehearsal",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false }),
      actor = crypto.randomUUID(),
      admin = crypto.randomUUID(),
      rollback = new Error("rollback isolated content rehearsal");
    const manifest = await Bun.file(
      "docs/evidence/admin-volunteer-settings/sample-content-release-manifest.json",
    ).json();
    const sql = await Bun.file(
      "docs/evidence/admin-volunteer-settings/archive-exact-sample-content.sql",
    ).text();
    try {
      await db.begin(async (tx) => {
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(id,auth_user_id,email,role,status) values(${admin}::uuid,${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
        for (const item of manifest.items) {
          await tx`insert into public.content_item(id,slug,title,summary,body,type,status,published_at,version,created_by,updated_by) values(${item.id}::uuid,${item.slug},${item.title},'Synthetic rehearsal summary','Synthetic rehearsal body','report','published',now(),0,${admin}::uuid,${admin}::uuid)`;
          await tx`insert into public.content_revision(id,content_item_id,version,operation,authoring_snapshot,public_snapshot,created_by,is_published) values(${item.published_revision_id}::uuid,${item.id}::uuid,0,'synthetic_rehearsal','{"synthetic":true}','{"synthetic":true}',${admin}::uuid,true)`;
          await tx`insert into public.editorial_content_review(entity_kind,entity_id,revision_key,classification,evidence,reviewed_by) values('content',${item.id}::uuid,${item.published_revision_id},'approved','Explicit synthetic archive rehearsal fixture; transaction rolls back',${actor}::uuid)`;
          await tx`update public.content_item set published_revision_id=${item.published_revision_id}::uuid where id=${item.id}::uuid`;
        }
        await tx`select set_config('hkscda.release_actor',${actor},true)`;
        await tx`update public.content_item set title='Synthetic changed title' where id=${manifest.items[6].id}::uuid`;
        let rejected = false;
        try {
          await tx.savepoint(async (sp) => {
            await sp.unsafe(sql);
          });
        } catch {
          rejected = true;
        }
        expect(rejected).toBe(true);
        expect(
          (
            await tx`select count(*)::int n from public.content_item where id=any(${"{" + manifest.items.map((i: { id: string }) => i.id).join(",") + "}"}::uuid[]) and status='archived'`
          )[0].n,
        ).toBe(0);
        await tx`update public.content_item set title=${manifest.items[6].title} where id=${manifest.items[6].id}::uuid`;
        await tx.unsafe(sql);
        expect(
          (
            await tx`select count(*)::int n from public.content_item where id=any(${"{" + manifest.items.map((i: { id: string }) => i.id).join(",") + "}"}::uuid[]) and status='archived'`
          )[0].n,
        ).toBe(7);
        expect(
          (
            await tx`select count(*)::int n from public.content_revision where content_item_id=any(${"{" + manifest.items.map((i: { id: string }) => i.id).join(",") + "}"}::uuid[])`
          )[0].n,
        ).toBe(14);
        expect(
          (await tx`select has_table_privilege('anon','public.content_item','SELECT') allowed`)[0]
            .allowed,
        ).toBe(false);
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
