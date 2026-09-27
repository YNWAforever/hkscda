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
