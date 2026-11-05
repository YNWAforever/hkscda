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
      "Content eligibility tests require explicit loopback Postgres without routing overrides",
    );
}
const enabled = Boolean(url) && process.env.CMS_LIFECYCLE_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)(
  "content eligibility SQL gates every public reader and metadata writes are audited",
  async () => {
    const db = new SQL(url!);
    const rollback = new Error("synthetic rollback");
    const actor = crypto.randomUUID();
    const marker = `elig-${crypto.randomUUID()}`;
    try {
      await db.begin(async (tx) => {
        await tx`insert into auth.users(id,email) values(${actor}::uuid,${`${marker}@example.invalid`})`;
        const [admin] =
          await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${`${marker}@example.test`},'staff','active') returning id`;
        const ids: Record<string, string> = {};
        for (const name of ["legacy", "demo", "future", "expired", "event"]) {
          const [item] =
            await tx`insert into public.content_item(slug,type,title,summary,status,content_class,effective_from,effective_until)
          values(${`${marker}-${name}`},${name === "event" ? "event" : "rescue_story"},${`${marker} ${name}`},'Synthetic eligibility fixture','draft',
            ${name === "demo" ? "demo" : "unreviewed"},
            ${name === "future" ? "2999-01-01T00:00:00Z" : null}::timestamptz,
            ${name === "expired" || name === "event" ? "2000-01-01T00:00:00Z" : null}::timestamptz)
          returning id`;
          ids[name] = item.id;
          const [revision] =
            await tx`select private.insert_content_revision(${item.id}::uuid,0,'synthetic',${admin.id}::uuid) as id`;
          await tx`insert into public.editorial_content_review(entity_kind,entity_id,revision_key,classification,evidence,reviewed_by)
          values('content',${item.id}::uuid,${revision.id},'approved','Synthetic eligibility test only',${actor}::uuid)`;
          await tx`update public.content_item set status='published',published_at=now(),published_revision_id=${revision.id}::uuid,published_slug=${`${marker}-${name}`} where id=${item.id}::uuid`;
        }
        await tx`set local role service_role`;
        const [list] =
          await tx`select public.read_published_content_snapshots(${{ q: marker, pageSize: 50 }}::jsonb) as result`;
        expect(list.result.total).toBe(2);
        expect(
          list.result.rows
            .map((row: { snapshot: { content: { slug: string } } }) => row.snapshot.content.slug)
            .sort(),
        ).toEqual([`${marker}-event`, `${marker}-legacy`]);
        const [demo] =
          await tx`select public.read_published_content_snapshots(${{ slug: `${marker}-demo`, detail: true }}::jsonb) as result`;
        expect(demo.result.total).toBe(0);
        const [expired] =
          await tx`select public.read_published_content_snapshots(${{ slug: `${marker}-expired`, detail: true }}::jsonb) as result`;
        expect(expired.result.total).toBe(1);
        const [featured] =
          await tx`select public.read_published_content_snapshots(${{ q: marker, isFeatured: true }}::jsonb) as result`;
        expect(featured.result.total).toBe(0);

        const metadata = {
          contentClass: "verified",
          sourceReference: "Approved synthetic record",
          contentOwner: "Synthetic staff",
          effectiveFrom: null,
          effectiveUntil: null,
        };
        const [updated] =
          await tx`select public.set_content_publication_metadata(${actor}::uuid,${ids.legacy}::uuid,0,${metadata}::jsonb) as result`;
        expect(updated.result.version).toBe(1);
        const [audit] =
          await tx`select count(*)::integer as count from public.audit_log where entity_id=${ids.legacy} and action='content.set_publication_metadata'`;
        expect(audit.count).toBe(1);
        const [publicDetail] =
          await tx`select public.read_published_content_snapshots(${{ slug: `${marker}-legacy`, detail: true }}::jsonb) as result`;
        expect(publicDetail.result.rows[0].snapshot.content.content_class).toBe("verified");
        expect(publicDetail.result.rows[0].snapshot.content).not.toHaveProperty("source_reference");
        expect(publicDetail.result.rows[0].snapshot.content).not.toHaveProperty("content_owner");
        const [approvedProfile] =
          await tx`select private.is_valid_animal_public_profile(${{ sponsorUse: "Synthetic veterinary care", recentProgress: "Synthetic recovery update" }}::jsonb) as valid`;
        const [rejectedProfile] =
          await tx`select private.is_valid_animal_public_profile(${{ sponsorUse: "Contact test@example.com" }}::jsonb) as valid`;
        expect(approvedProfile.valid).toBe(true);
        expect(rejectedProfile.valid).toBe(false);
        const [grants] = await tx`select
        has_function_privilege('anon','public.set_content_publication_metadata(uuid,uuid,integer,jsonb)','EXECUTE') as anon_write,
        has_function_privilege('authenticated','public.set_content_publication_metadata(uuid,uuid,integer,jsonb)','EXECUTE') as authenticated_write,
        has_function_privilege('service_role','public.set_content_publication_metadata(uuid,uuid,integer,jsonb)','EXECUTE') as service_write`;
        expect(grants).toEqual({
          anon_write: false,
          authenticated_write: false,
          service_write: true,
        });
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

// BUG-39: the audit row used to carry admin_user.id, which matches no user.
test.skipIf(!enabled)(
  "BUG-39: set_content_publication_metadata logs the auth user id as the audit actor",
  async () => {
    const db = new SQL(url!);
    const rollback = new Error("synthetic rollback");
    const actor = crypto.randomUUID();
    const marker = `bug39-${crypto.randomUUID()}`;
    try {
      await db.begin(async (tx) => {
        await tx`insert into auth.users(id,email) values(${actor}::uuid,${`${marker}@example.invalid`})`;
        const [admin] =
          await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${`${marker}@example.test`},'staff','active') returning id`;
        const [item] = await tx`insert into public.content_item(slug,type,title,summary,status)
          values(${marker},'rescue_story',${marker},'Synthetic audit actor fixture','draft') returning id`;
        await tx`set local role service_role`;
        const metadata = {
          contentClass: "demo",
          sourceReference: "",
          contentOwner: "",
          effectiveFrom: null,
          effectiveUntil: null,
        };
        await tx`select public.set_content_publication_metadata(${actor}::uuid,${item.id}::uuid,0,${metadata}::jsonb)`;
        await tx`reset role`;
        const rows =
          await tx`select actor_user_id from public.audit_log where entity_id=${item.id} and action='content.set_publication_metadata'`;
        expect(rows.map((row: { actor_user_id: string }) => row.actor_user_id)).toEqual([actor]);
        expect(admin.id).not.toBe(actor);
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

// BUG-71: every publication reset published_at to now(), moving a republished story's date.
test.skipIf(!enabled)(
  "BUG-71: republishing a story keeps its first publication date",
  async () => {
    const db = new SQL(url!);
    const rollback = new Error("synthetic rollback");
    const actor = crypto.randomUUID();
    const marker = `bug71-${crypto.randomUUID()}`;
    type Result = { content_id: string; revision_id: string; version: number };
    try {
      await db.begin(async (tx) => {
        await tx`insert into auth.users(id,email) values(${actor}::uuid,${`${marker}@example.invalid`})`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${`${marker}@example.test`},'staff','active')`;
        const approve = (item: Result) =>
          tx`insert into public.editorial_content_review(entity_kind,entity_id,revision_key,classification,evidence,reviewed_by)
            values('content',${item.content_id}::uuid,${item.revision_id},'approved','Synthetic BUG-71 fixture only',${actor}::uuid)`;
        const call = async (query: () => PromiseLike<{ result: unknown }[]>) => {
          await tx`set local role service_role`;
          const [row] = await query();
          await tx`reset role`;
          return row.result as Result;
        };
        const created = await call(
          () =>
            tx`select public.create_content_revision_with_audit(${actor}::uuid,${{ slug: marker, type: "event", title: "Synthetic BUG-71 story", summary: "Synthetic first publication date fixture" }}::jsonb) as result`,
        );
        const withCover = await call(
          () =>
            tx`select public.mutate_content_revision_with_audit(${actor}::uuid,${created.content_id}::uuid,${created.version},'create_media',${{ storageBucket: "content-media", storagePath: `${created.content_id}/synthetic.jpg`, altText: "Synthetic cover", isCover: true }}::jsonb) as result`,
        );
        await approve(withCover);
        const first = await call(
          () =>
            tx`select public.publish_content_revision(${actor}::uuid,${withCover.content_id}::uuid,${withCover.revision_id}::uuid,${withCover.version},${`${marker}-first-publication`}) as result`,
        );
        const [firstPublished] =
          await tx`select published_at from public.content_item where id=${created.content_id}::uuid`;
        // The normal path: a first publication sets the date.
        expect(firstPublished.published_at).toBeInstanceOf(Date);

        // Age the first publication so a reset to now() is visible inside one transaction.
        const march = new Date("2026-03-02T01:00:00.000Z");
        await tx`update public.content_item set published_at=${march} where id=${created.content_id}::uuid`;
        const edited = await call(
          () =>
            tx`select public.mutate_content_revision_with_audit(${actor}::uuid,${created.content_id}::uuid,${first.version},'save_content','{"title":"Synthetic BUG-71 story (typo fixed)"}'::jsonb) as result`,
        );
        await approve(edited);
        await call(
          () =>
            tx`select public.publish_content_revision(${actor}::uuid,${edited.content_id}::uuid,${edited.revision_id}::uuid,${edited.version},${`${marker}-second-publication`}) as result`,
        );

        const [after] =
          await tx`select published_at,published_revision_id from public.content_item where id=${created.content_id}::uuid`;
        expect(after.published_revision_id).toBe(edited.revision_id);
        expect(after.published_at.toISOString()).toBe(march.toISOString());
        await tx`set local role service_role`;
        const [detail] =
          await tx`select public.read_published_content_snapshots(${{ slug: marker, detail: true }}::jsonb) as result`;
        await tx`reset role`;
        expect(detail.result.total).toBe(1);
        expect(new Date(detail.result.rows[0].published_at).toISOString()).toBe(
          march.toISOString(),
        );
        expect(detail.result.rows[0].snapshot.content.title).toBe(
          "Synthetic BUG-71 story (typo fixed)",
        );
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
