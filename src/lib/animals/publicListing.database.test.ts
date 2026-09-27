import { SQL } from "bun";
import { expect, test } from "bun:test";
import type { Animal } from "../../types/animal";
import { buildPublicAnimalListing } from "./publicListing";
import { projectPublicAnimal } from "./publicProfile";

const databaseUrl = process.env.PUBLIC_LISTING_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== "57322" || target.pathname !== "/postgres")
    throw new Error("Public listing fixtures require the dedicated loopback DB");
}
const enabled =
  Boolean(databaseUrl) && process.env.PUBLIC_LISTING_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)(
  "DB filters before pagination and hides drafts, adopted animals and private columns",
  async () => {
    const db = new SQL(databaseUrl!, { max: 1, prepare: false });
    const rollback = new Error("rollback public listing fixture");
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          "insert into public.animals(id,type,name,gender,age,status,publication_state,adoption_eligible,sponsorship_eligible,image_url,created_at,public_profile) select ('00000000-0000-4000-8000-' || lpad(to_hex(gs),12,'0'))::uuid,'cat','T21 cat ' || gs,'female',case when gs % 2=0 then '約 2 歲' else '不詳' end,case when gs % 10=0 then 'adopted' else 'available' end,case when gs % 7=0 then 'draft' else 'published' end,true,false,case when gs<=50 then null else 'https://example.invalid/cat-' || gs || '.jpg' end,timestamptz '2026-01-01 00:00:00+00' + gs * interval '1 second',jsonb_build_object('code','T21-' || gs) from generate_series(1,1000) gs",
        );
        const [result] = (await tx.unsafe(
          "select public.public_animal_listing_page($1::jsonb) as page",
          [
            JSON.stringify({
              purpose: "adoption",
              species: "cat",
              query: "T21",
              hasPhoto: true,
              ageBand: "adult",
              gender: "female",
              neutered: "all",
              suitability: "all",
              page: 2,
              pageSize: 25,
            }),
          ],
        )) as { page: { items: Array<Record<string, unknown>>; total: number; page: number } }[];
        expect(result.page.page).toBe(2);
        expect(result.page.items).toHaveLength(25);
        expect(result.page.total).toBeGreaterThan(300);
        expect(
          result.page.items.every(
            (item) => item.status === "available" && item.publication_state === "published",
          ),
        ).toBe(true);
        expect(result.page.items.every((item) => typeof item.image_url === "string")).toBe(true);
        expect(result.page.items.every((item) => !("notes" in item) && !("notes_en" in item))).toBe(
          true,
        );
        const raw = (await tx.unsafe(
          "select id,type,name,name_en,gender,age,age_en,description,description_en,status,adoption_eligible,sponsorship_eligible,retired_at,publication_state,image_url,created_at,updated_at,public_profile from public.animals where name like 'T21 cat %'",
        )) as Animal[];
        const expected = buildPublicAnimalListing({
          animals: raw.map((animal) => projectPublicAnimal(animal)),
          type: "cat",
          ageFilter: "adult",
          genderFilter: "female",
          page: 2,
          pageSize: 25,
          withPhoto: true,
          q: "T21",
        });
        expect(result.page.total).toBe(expected.total);
        expect(result.page.items.map((item) => item.id)).toEqual(
          expected.animals.map((item) => item.id),
        );
        await tx.unsafe("set local role anon");
        const [anonymous] = (await tx.unsafe(
          "select public.public_animal_listing_page($1::jsonb) as page",
          [
            JSON.stringify({
              purpose: "adoption",
              species: "cat",
              query: "T21",
              hasPhoto: true,
              ageBand: "adult",
              gender: "female",
              page: 2,
              pageSize: 25,
            }),
          ],
        )) as { page: { items: Array<{ id: string }>; total: number } }[];
        expect(anonymous.page.total).toBe(expected.total);
        expect(anonymous.page.items.map((item) => item.id)).toEqual(
          expected.animals.map((item) => item.id),
        );
        await tx.unsafe("reset role");
        const [privateGrant] = (await tx.unsafe(
          "select has_column_privilege('anon','public.animals','notes','SELECT') as allowed",
        )) as { allowed: boolean }[];
        expect(privateGrant.allowed).toBe(false);
        await tx.unsafe(
          "insert into public.animals(id,type,name,gender,age,status,publication_state,adoption_eligible,sponsorship_eligible,image_url,created_at,public_profile) select ('00000000-0000-4000-8000-' || lpad(to_hex(gs),12,'0'))::uuid,'cat','T21 cat ' || gs,'female',case when gs % 2=0 then '約 2 歲' else '不詳' end,case when gs % 10=0 then 'adopted' else 'available' end,case when gs % 7=0 then 'draft' else 'published' end,true,false,case when gs<=50 then null else 'https://example.invalid/cat-' || gs || '.jpg' end,timestamptz '2026-01-01 00:00:00+00' + gs * interval '1 second',jsonb_build_object('code','T21-' || gs) from generate_series(1001,10000) gs",
        );
        const [large] = (await tx.unsafe(
          "select public.public_animal_listing_page($1::jsonb) as page",
          [
            JSON.stringify({
              purpose: "adoption",
              species: "cat",
              query: "T21",
              hasPhoto: true,
              ageBand: "adult",
              gender: "female",
              sort: "oldest",
              page: 20,
              pageSize: 25,
            }),
          ],
        )) as { page: { items: Array<{ id: string }>; total: number; page: number } }[];
        const all = (await tx.unsafe(
          "select id,type,name,name_en,gender,age,age_en,description,description_en,status,adoption_eligible,sponsorship_eligible,retired_at,publication_state,image_url,created_at,updated_at,public_profile from public.animals where name like 'T21 cat %'",
        )) as Animal[];
        const expectedLarge = buildPublicAnimalListing({
          animals: all.map((animal) => projectPublicAnimal(animal)),
          type: "cat",
          ageFilter: "adult",
          genderFilter: "female",
          page: 20,
          pageSize: 25,
          withPhoto: true,
          q: "T21",
        });
        expect(large.page.total).toBe(expectedLarge.total);
        expect(large.page.items).toHaveLength(25);
        expect(new Set(large.page.items.map((item) => item.id)).size).toBe(25);
        expect(JSON.stringify(large.page).length).toBeLessThan(50_000);
        const orderedNewest = buildPublicAnimalListing({
          animals: all.map((animal) => projectPublicAnimal(animal)),
          type: "cat",
          ageFilter: "adult",
          genderFilter: "female",
          page: 1,
          pageSize: 10_000,
          withPhoto: true,
          q: "T21",
        }).animals;
        expect(large.page.items.map((item) => item.id)).toEqual(
          [...orderedNewest]
            .reverse()
            .slice(19 * 25, 20 * 25)
            .map((item) => item.id),
        );
        const [ageBands] = (await tx.unsafe(
          "select private.normalize_public_animal_age('18 months') as adult, private.normalize_public_animal_age('rescue 2026') as unknown, private.normalize_public_animal_age('約 8 個月') as baby",
        )) as { adult: string; unknown: string; baby: string }[];
        expect(ageBands).toEqual({ adult: "adult", unknown: "unknown", baby: "bb" });
        const [publicGrant] = (await tx.unsafe(
          "select has_column_privilege('anon','public.animals','public_age_band','SELECT') as age_visible, has_function_privilege('anon','private.normalize_public_animal_age(text)','EXECUTE') as private_callable",
        )) as { age_visible: boolean; private_callable: boolean }[];
        expect(publicGrant).toEqual({ age_visible: true, private_callable: false });
        await tx.unsafe(
          "insert into public.animals(id,type,name,gender,age,status,publication_state,adoption_eligible,sponsorship_eligible,image_url,created_at,public_profile) values ('00000000-0000-4000-8000-00000000f001','cat','T21 sponsor cat','female','9 歲','available','published',false,true,'https://example.invalid/sponsor-cat.jpg',now(),jsonb_build_object('birthday',to_char((now() at time zone 'Asia/Hong_Kong')::date - interval '2 years','YYYY-MM-DD'))),('00000000-0000-4000-8000-00000000f002','sponsor','T21 sponsor legacy','female','約 2 歲','available','published',false,true,'https://example.invalid/sponsor-legacy.jpg',now(),'{}'::jsonb)",
        );
        const [sponsors] = (await tx.unsafe(
          "select public.public_animal_listing_page($1::jsonb) as page",
          [
            JSON.stringify({
              purpose: "sponsorship",
              query: "T21 sponsor",
              ageBand: "adult",
              page: 1,
              pageSize: 25,
            }),
          ],
        )) as { page: { items: Array<{ id: string }>; total: number } }[];
        expect(sponsors.page.total).toBe(2);
        expect(sponsors.page.items).toHaveLength(2);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);
