import { SQL } from "bun";
import { expect, test } from "bun:test";
const url = process.env.CMS_LIFECYCLE_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.search ||
    target.hash
  )
    throw new Error(
      "Read acceptance requires explicit loopback Postgres without routing overrides",
    );
}
const enabled = Boolean(url) && process.env.CMS_LIFECYCLE_TEST_ALLOW_LOCAL_FIXTURES === "1";
test.skipIf(!enabled)(
  "1201 profiles remain complete; hundred-update histories are bounded and pageable",
  async () => {
    const db = new SQL(url!);
    const marker = `cms-read-${crypto.randomUUID()}`;
    const rollback = new Error("synthetic rollback");
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.content_item(slug,type,title,summary) select ${marker}||'-'||n,'rescue_story',${marker},'Synthetic bounded read fixture' from generate_series(1,1201) n`;
        await tx`insert into public.rescue_story_profile(content_item_id,animal_type,public_status,rescue_region) select id,'cat','rescued',${marker} from public.content_item where title=${marker}`;
        await tx`insert into public.story_update(content_item_id,kind,title,body,occurred_at) select item.id,'general','Synthetic update '||n,repeat('Large synthetic update body ',100),now()-n*interval '1 minute' from public.content_item item cross join generate_series(1,100) n where item.title=${marker}`;
        await tx`insert into public.content_media(content_item_id,storage_path,alt_text,is_cover) select item.id,item.id::text||'/'||n||'.jpg','Synthetic image',n=1 from public.content_item item cross join generate_series(1,100) n where item.title=${marker}`;
        const filters = { rescueRegion: marker, animalType: "cat", page: 25, pageSize: 50 };
        const [page] =
          await tx`select public.read_content_admin_summaries(${filters}::jsonb) as result`;
        expect(page.result.total).toBe(1201);
        expect(page.result.rows).toHaveLength(1);
        expect(page.result.rows[0].updates).toHaveLength(1);
        expect(page.result.rows[0].media).toHaveLength(1);
        expect(page.result.rows[0].updates[0].body).toBeUndefined();
        const contentId = page.result.rows[0].content.id;
        const [first] =
          await tx`select public.read_content_authoring_detail(${contentId}::uuid,1) as result`;
        const [second] =
          await tx`select public.read_content_authoring_detail(${contentId}::uuid,2) as result`;
        expect(first.result.updates).toHaveLength(21);
        expect(first.result.media).toHaveLength(21);
        expect(first.result.updates[0].body).toBeUndefined();
        expect(second.result.updates[0].id).not.toBe(first.result.updates[0].id);
        const [last] =
          await tx`select public.read_content_authoring_detail(${contentId}::uuid,5) as result`;
        expect(last.result.updates).toHaveLength(20);
        const [plan] =
          await tx`explain (analyze,buffers,format json) select public.read_content_admin_summaries(${filters}::jsonb)`;
        expect(plan).toBeDefined();
        for (const role of ["anon", "authenticated"]) {
          const [access] =
            await tx`select has_function_privilege(${role},'public.read_content_authoring_detail(uuid,integer)','EXECUTE') as allowed`;
          expect(access.allowed).toBe(false);
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
  60000,
);
