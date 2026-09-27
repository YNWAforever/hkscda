import { SQL } from "bun";

import type { Animal } from "../src/types/animal";
import { buildPublicAnimalListing } from "../src/lib/animals/publicListing";
import { projectPublicAnimal } from "../src/lib/animals/publicProfile";

const databaseUrl = process.env.PUBLIC_LISTING_BENCH_DATABASE_URL;
if (!databaseUrl || process.env.PUBLIC_LISTING_BENCH_ALLOW_LOCAL_FIXTURES !== "1")
  throw new Error("Explicit local public listing benchmark opt-in is required");
const target = new URL(databaseUrl);
if (target.hostname !== "127.0.0.1" || target.port !== "57322" || target.pathname !== "/postgres")
  throw new Error("Public listing benchmark requires the dedicated loopback DB");

const db = new SQL(databaseUrl, { max: 1, prepare: false });
const rollback = new Error("rollback synthetic public listing benchmark");
const input = {
  type: "cat" as const,
  ageFilter: "adult" as const,
  genderFilter: "female" as const,
  page: 20,
  pageSize: 25,
  withPhoto: true,
  q: "T21BENCH",
};
const filters = JSON.stringify({
  purpose: "adoption",
  species: "cat",
  query: "T21BENCH",
  hasPhoto: true,
  ageBand: "adult",
  gender: "female",
  sort: "newest",
  page: 20,
  pageSize: 25,
});
const oldSql =
  "select id,type,name,name_en,gender,age,age_en,description,description_en,status,adoption_eligible,sponsorship_eligible,retired_at,publication_state,image_url,created_at,updated_at,public_profile,gallery from public.animals where name like 'T21BENCH %' and publication_state='published' and status in ('available','fostered') and retired_at is null and adoption_eligible order by created_at desc,id limit 1000 offset $1";
const measure = (values: number[], fraction: number) =>
  Number(values.toSorted((a, b) => a - b)[Math.ceil(values.length * fraction) - 1].toFixed(2));
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

try {
  await db.begin(async (tx) => {
    await tx.unsafe(
      "insert into public.animals(id,type,name,gender,age,status,publication_state,adoption_eligible,sponsorship_eligible,image_url,created_at,public_profile) select ('10000000-0000-4000-8000-' || lpad(to_hex(gs),12,'0'))::uuid,'cat','T21BENCH ' || gs,'female','約 2 歲','available','published',true,false,'https://example.invalid/bench-' || gs || '.jpg',timestamptz '2026-01-01 00:00:00+00' + gs * interval '1 second','{}'::jsonb from generate_series(1,10000) gs",
    );
    const oldTimes: number[] = [];
    const newTimes: number[] = [];
    let oldBytes = 0;
    let newBytes = 0;
    for (let sample = 0; sample < 30; sample++) {
      let started = performance.now();
      const all: Animal[] = [];
      let transfer = 0;
      for (let offset = 0; offset <= 10000; offset += 1000) {
        const batch = (await tx.unsafe(oldSql, [offset])) as Animal[];
        transfer += bytes(batch);
        all.push(...batch.map((animal) => projectPublicAnimal(animal)));
      }
      const oldResult = buildPublicAnimalListing({ animals: all, ...input });
      oldTimes.push(performance.now() - started);
      oldBytes = transfer;
      started = performance.now();
      const [newResult] = (await tx.unsafe(
        "select public.public_animal_listing_page($1::jsonb) as page",
        [filters],
      )) as { page: { items: Array<{ id: string }>; total: number } }[];
      newTimes.push(performance.now() - started);
      newBytes = bytes(newResult.page);
      if (
        oldResult.total !== newResult.page.total ||
        oldResult.animals.map((animal) => animal.id).join(",") !==
          newResult.page.items.map((animal) => animal.id).join(",")
      )
        throw new Error("Benchmark result mismatch");
    }
    console.log(
      JSON.stringify({
        environment: "isolated loopback DB, same 10000 synthetic rows and client, warm samples",
        samples: 30,
        old: {
          p50Ms: measure(oldTimes, 0.5),
          p95Ms: measure(oldTimes, 0.95),
          bytes: oldBytes,
          roundTrips: 11,
        },
        candidate: {
          p50Ms: measure(newTimes, 0.5),
          p95Ms: measure(newTimes, 0.95),
          bytes: newBytes,
          roundTrips: 1,
        },
      }),
    );
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await db.close();
}
