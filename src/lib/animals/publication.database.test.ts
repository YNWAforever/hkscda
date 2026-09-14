import { SQL } from "bun";
import { expect, test } from "bun:test";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
async function rejects(fn: () => Promise<unknown>) {
  let failed = false;
  try {
    await fn();
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}
test.skipIf(!enabled)(
  "animal draft stale preview publish immutable version and copy",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false }),
      admin = crypto.randomUUID(),
      animal = crypto.randomUUID(),
      body = {
        type: "cat",
        name: "Lifecycle cat",
        name_en: null,
        gender: "female",
        age: "2",
        age_en: null,
        description: "draft",
        description_en: null,
        notes: null,
        notes_en: null,
        status: "available",
        image_url: null,
        draft_image_path: null,
        adoption_eligible: true,
        sponsorship_eligible: false,
        publication_state: "published",
        public_profile: {
          code: null,
          birthday: null,
          neutered: null,
          suitability: null,
          personality: null,
          health: null,
          story: null,
          recordDate: null,
        },
      };
    const command = (c: unknown) =>
      db`select public.animal_publication_command(${admin}::uuid,${JSON.stringify(c)}::jsonb) result`.then(
        (r) => r[0].result,
      );
    try {
      await db`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)values(${admin}::uuid,${admin + "@example.invalid"},now(),now(),now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status)values(${admin}::uuid,${admin + "@example.invalid"},'admin','active')`;
      expect(
        (await command({ kind: "save", animal_id: animal, expected_revision: 0, body })).revision,
      ).toBe(1);
      expect(
        (
          await command({
            kind: "save",
            animal_id: animal,
            expected_revision: 0,
            body: { ...body, name: "stale" },
          })
        ).kind,
      ).toBe("conflict");
      const preview = await command({ kind: "preview", animal_id: animal });
      await db`select public.editorial_review_command(${admin}::uuid,${JSON.stringify({ entity_kind: "animal", entity_id: animal, revision_key: "1", classification: "approved", evidence: "Explicit synthetic lifecycle fixture; no real animal" })}::jsonb)`;
      const published = await command({
        kind: "publish",
        animal_id: animal,
        preview_id: preview.preview_id,
        reason: "acceptance",
      });
      expect(published.kind).toBe("published");
      expect(
        (await db`select name,publication_state from public.animals where id=${animal}::uuid`)[0],
      ).toMatchObject({ name: "Lifecycle cat", publication_state: "published" });
      await rejects(
        () =>
          db`update public.animal_publication_version set reason='changed' where id=${published.version_id}::uuid`,
      );
      expect(
        (await command({ kind: "copy", animal_id: animal, version_id: published.version_id }))
          .revision,
      ).toBe(2);
    } finally {
      await db.close({ timeout: 1 });
    }
  },
  30000,
);
