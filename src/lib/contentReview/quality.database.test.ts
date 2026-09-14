import { SQL } from "bun";
import { expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { createAnimalAdminList } from "../animals/adminList.repository.server";
import { PUBLIC_ANIMAL_BASE_COLUMNS } from "../animals/publicColumns";
import { createInternshipRepository } from "../internships/repository.server";
import { createCrmReadModel } from "../crm/readModel.server";
import { supporterSearchSchema } from "../crm/schemas";
import { createSupabaseAdoptionInformationRepository } from "../adoptionInformation/repository.server";
import { createSupabaseAdminAccessRepository } from "../admin/accessManagement.repository.server";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
async function rejectPublication(operation: () => Promise<unknown>) {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}
const enabled =
  process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1" &&
  process.env.QUALITY_TEST_API_URL === "http://127.0.0.1:56321" &&
  Boolean(process.env.QUALITY_TEST_SERVICE_KEY);
test.skipIf(!enabled)(
  "real late pages 26/51/501/1001, summaries, classification and stale publication",
  async () => {
    const address = new URL(url!);
    expect(address.hostname).toBe("127.0.0.1");
    expect(address.port).toBe("56322");
    const db = new SQL(url!, { max: 1, prepare: false });
    const client = createClient(
      process.env.QUALITY_TEST_API_URL!,
      process.env.QUALITY_TEST_SERVICE_KEY!,
      {
        auth: { persistSession: false },
        global: {
          fetch: Object.assign(
            (...args: Parameters<typeof fetch>) =>
              fetch(args[0], { ...args[1], signal: AbortSignal.timeout(15000) }),
            { preconnect: fetch.preconnect },
          ),
        },
      },
    );
    const actor = crypto.randomUUID(),
      animal = crypto.randomUUID(),
      marker = `quality-${crypto.randomUUID().slice(0, 8)}`;
    const measures: Record<string, unknown> = {
      dataset: marker,
      synthetic: true,
      comparison: "old and new queries on identical synthetic data; no production claim",
    };
    try {
      await db`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values(${actor}::uuid,${actor + "@example.invalid"},now(),now(),now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
      await db`insert into public.animals(type,name,gender,age,status,publication_state,description,created_at) select 'cat',${marker}||'-'||lpad(n::text,4,'0'),'female','2','available','draft',repeat('synthetic long description ',200),timestamptz '2098-01-01'+n*interval '1 second' from generate_series(1,1001)n`;
      console.info("quality: animal fixtures ready");
      const before = await client
        .from("animals")
        .select(PUBLIC_ANIMAL_BASE_COLUMNS)
        .ilike("name", marker + "%")
        .order("created_at", { ascending: false })
        .range(0, 999);
      if (before.error) throw before.error;
      console.info("quality: baseline animal response ready");
      const list = createAnimalAdminList(client);
      const first = await list({ section: "cat", q: marker, page: 1 });
      const late = await list({ section: "cat", q: marker, page: 51 });
      expect(first.animals).toHaveLength(20);
      expect(first.total).toBe(1001);
      expect(late.animals).toHaveLength(1);
      expect(late.animals[0].name).toBe(marker + "-0001");
      expect(first.animals[0].description).toBeNull();
      const missing = await list({ section: "cat", q: marker, page: 51 }, true);
      expect(missing.animals).toHaveLength(1);
      measures.animals = {
        before_rows: before.data.length,
        after_rows: first.animals.length,
        total: first.total,
        before_bytes: JSON.stringify(before.data).length,
        after_bytes: JSON.stringify(first).length,
      };
      console.info("quality: animal late pages verified");
      await db`insert into public.supporter(name,email,source) select ${marker}||n,${marker}||n||'@example.invalid','explicit_synthetic_quality_test' from generate_series(1,26)n`;
      const supporters = await createCrmReadModel(client).list(
        supporterSearchSchema.parse({ q: marker, page: 2, pageSize: 25 }),
      );
      expect(supporters.total).toBe(26);
      expect(supporters.supporters).toHaveLength(1);
      console.info("quality: supporters verified");
      const maxOrder = (
        await db`select coalesce(max(sort_order),0)+1 n from public.adoption_rules`
      )[0].n;
      await db`insert into public.adoption_rules(content_zh,content_en,sort_order,is_published) select ${marker}||n,${marker}||n,${maxOrder}::int+n,false from generate_series(1,51)n`;
      const rules = await createSupabaseAdoptionInformationRepository(client).listAdmin({
        resource: "rules",
        q: marker,
        page: 2,
        pageSize: 50,
      });
      expect(rules.total).toBe(51);
      expect(rules.items).toHaveLength(1);
      console.info("quality: rules verified");
      const intake = (await db`select id from public.internship_intake_version limit 1`)[0].id;
      await db`insert into public.internship_application(applicant_id,intake_version_id,contact_snapshot,student_snapshot,shelter) select ${actor}::uuid,${intake}::uuid,jsonb_build_object('name',${marker}||n,'email','synthetic@example.invalid','phone',''),jsonb_build_object('institution','Synthetic test only','course','Synthetic','statement',repeat('synthetic long statement ',100)),'cat' from generate_series(1,501)n`;
      const internships = createInternshipRepository(client);
      const internPage = await internships.command(actor, {
        action: "list",
        page: 21,
        pageSize: 25,
        q: marker,
      });
      expect(internPage.total).toBe(501);
      expect(internPage.applications as unknown[]).toHaveLength(1);
      const summary = (internPage.applications as Array<{ id: string }>)[0];
      expect(summary).not.toHaveProperty("events");
      expect(summary).not.toHaveProperty("student_snapshot");
      const detail = await internships.command(actor, {
        action: "detail",
        application_id: summary.id,
      });
      expect(detail.application).toHaveProperty("events");
      expect(detail.application).toHaveProperty("attachments");
      await expect(
        internships.command(crypto.randomUUID(), { action: "list", page: 1 }),
      ).rejects.toHaveProperty("code", "42501");
      console.info("quality: internship verified");
      await db`insert into public.audit_log(actor_user_id,action,entity,entity_id,detail,timestamp) select ${actor}::uuid,'admin_user.update','admin_user',${marker},'{}'::jsonb,timestamptz '2099-01-01'+n*interval '1 second' from generate_series(1,51)n`;
      console.info("quality: audit fixtures ready");
      const audits = await createSupabaseAdminAccessRepository(client).listAudit(2);
      expect(audits.some((row) => row.entityId === marker)).toBe(true);
      console.info("quality: audit pagination verified");
      const body = {
        type: "cat",
        name: marker,
        gender: "female",
        age: "2",
        status: "available",
        publication_state: "published",
        adoption_eligible: true,
        sponsorship_eligible: false,
        image_url: null,
        gallery: [],
        public_profile: {},
      };
      const command = (input: object) =>
        db`select public.animal_publication_command(${actor}::uuid,${JSON.stringify({ animal_id: animal, ...input })}::jsonb) result`.then(
          (rows) => rows[0].result,
        );
      const review = (revision: string, classification: string) =>
        db`select public.editorial_review_command(${actor}::uuid,${JSON.stringify({ entity_kind: "animal", entity_id: animal, revision_key: revision, classification, evidence: "Explicit synthetic test; no actual rescue content" })}::jsonb) result`.then(
          (rows) => rows[0].result,
        );
      console.info("quality: publication fixture starting");
      await command({ kind: "save", expected_revision: 0, body });
      console.info("quality: publication draft saved");
      for (const blocked of ["unverified", "banned"]) {
        await db`update auth.users set email_confirmed_at=case when ${blocked}='unverified' then null else now() end,banned_until=case when ${blocked}='banned' then now()+interval '1 day' else null end where id=${actor}::uuid`;
        await rejectPublication(() => review("1", "approved"));
        await rejectPublication(
          () => db`select public.editorial_review_queue(${actor}::uuid,1,'animal')`,
        );
        await rejectPublication(() => command({ kind: "preview" }));
      }
      await db`update auth.users set email_confirmed_at=now(),banned_until=null where id=${actor}::uuid`;

      const preview = await command({ kind: "preview" });
      console.info("quality: publication preview ready");
      await rejectPublication(() =>
        command({ kind: "publish", preview_id: preview.preview_id, reason: "synthetic" }),
      );
      console.info("quality: unreviewed rejected");
      await review("1", "demo");
      await rejectPublication(() =>
        command({ kind: "publish", preview_id: preview.preview_id, reason: "synthetic" }),
      );
      console.info("quality: demo rejected");
      await review("1", "approved");
      await review("1", "approved");
      await command({
        kind: "save",
        expected_revision: 1,
        body: { ...body, name: marker + " changed" },
      });
      expect(
        (await command({ kind: "publish", preview_id: preview.preview_id, reason: "synthetic" }))
          .kind,
      ).toBe("conflict");
      expect((await review("1", "approved")).kind).toBe("conflict");
      console.info("quality: stale rejected");
      const current = await command({ kind: "preview" });
      await review("2", "approved");
      expect(
        (await command({ kind: "publish", preview_id: current.preview_id, reason: "synthetic" }))
          .kind,
      ).toBe("published");
      console.info("quality: approved published");
      await command({
        kind: "save",
        expected_revision: 2,
        body: { ...body, publication_state: "unpublished" },
      });
      await review("3", "demo");
      const hidden = await command({ kind: "preview" });
      expect(
        (
          await command({
            kind: "publish",
            preview_id: hidden.preview_id,
            reason: "explicit synthetic quarantine",
          })
        ).kind,
      ).toBe("published");
      const auditCount =
        await db`select count(*)::int n from public.audit_log where actor_user_id=${actor}::uuid and action='editorial.review'`;
      expect(auditCount[0].n).toBe(4);
      writeFileSync(
        ".local-policy-test/quality-performance.json",
        JSON.stringify(measures, null, 2),
      );
    } finally {
      await db.close({ timeout: 1 });
    }
  },
  120000,
);
