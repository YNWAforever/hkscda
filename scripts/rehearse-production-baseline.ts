import { SQL } from "bun";
import { readFile, writeFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new SQL(
  "postgresql://postgres:postgres@127.0.0.1:56322/hkscda_baseline_parity_20260913",
  { max: 1, prepare: false },
);
const accepted = new SQL("postgresql://postgres:postgres@127.0.0.1:56322/postgres", {
  max: 1,
  prepare: false,
});
const dir = "docs/evidence/admin-volunteer-settings/";
const quote = (x: string) => '"' + x.replaceAll('"', '""') + '"';
const details = JSON.parse(await readFile(dir + "baseline-parity-details.json", "utf8"));
const remote = JSON.parse(await readFile(dir + "production-baseline-catalog.json", "utf8")).objects;
const catalog = await readFile("scripts/baseline-schema-catalog.sql", "utf8");
const migration = await readFile(
  "supabase/migrations/20260913060000_verified_baseline_compatibility.sql",
  "utf8",
);
const results: string[] = [];
const expectedObjectCount = (await accepted.unsafe(catalog)).length;
try {
  await db.begin(async (tx) => {
    await tx.unsafe("savepoint unknown_drift");
    await tx.unsafe(
      "create or replace function public.log_animal_mutation() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin return new;end$$",
    );
    let rejected = false;
    try {
      await tx.unsafe(migration);
    } catch (e) {
      rejected = String(e).includes("Unreviewed definition: log_animal_mutation");
    }
    await tx.unsafe("rollback to savepoint unknown_drift");
    assert(rejected);
    results.push("Unreviewed function drift aborts before migration writes");
    await tx.unsafe("savepoint configuration_drift");
    await tx.unsafe("alter function public.log_animal_mutation() reset all");
    rejected = false;
    try {
      await tx.unsafe(migration);
    } catch (e) {
      rejected = String(e).includes(
        "Unreviewed animal command signature or security configuration",
      );
    }
    await tx.unsafe("rollback to savepoint configuration_drift");
    assert(rejected);
    results.push("Missing pinned function configuration fails closed");
    await tx.unsafe(migration);
    const sourceFiles = (await readdir("supabase/migrations"))
      .filter((x) => x.startsWith("20260913") && !x.includes("060000"))
      .sort();
    assert(sourceFiles.length >= 36);
    for (const file of sourceFiles)
      await tx.unsafe(await readFile("supabase/migrations/" + file, "utf8"));
    assert.equal((await tx.unsafe(catalog)).length, expectedObjectCount);
    results.push(
      `Full source chain applies: 63 baseline plus prerequisite and ${sourceFiles.length} feature migrations, ${expectedObjectCount} application objects`,
    );
    await tx.unsafe("rollback");
  });
  await db.begin(async (tx) => {
    // Model only observed public/private structural and grant differences, never production rows.
    for (const row of details.filter((x) => x.kind === "trigger" && x.production === null)) {
      const [t, n] = row.key.split(".");
      await tx.unsafe(`drop trigger ${quote(n)} on public.${quote(t)}`);
    }
    for (const row of details.filter((x) => x.kind === "policy" && x.baseline !== null)) {
      const [t, n] = row.key.split(".");
      await tx.unsafe(`drop policy ${quote(n)} on public.${quote(t)}`);
    }
    await tx.unsafe(
      `create policy "admin only" on public.adoption_applications for all to public using(auth.role()='authenticated')`,
    );
    for (const row of details.filter((x) => x.kind === "constraint" && x.production === null)) {
      const [t, n] = row.key.split(".");
      await tx.unsafe(`alter table public.${quote(t)} drop constraint ${quote(n)}`);
    }
    for (const row of details.filter((x) => x.kind === "index" && x.production === null)) {
      const [t, n] = row.key.split(".");
      await tx.unsafe(`drop index public.${quote(n)}`);
    }
    for (const row of details.filter((x) => x.kind === "column" && x.production === null)) {
      const [t, n] = row.key.split(".");
      await tx.unsafe(`alter table public.${quote(t)} drop column ${quote(n)}`);
    }
    for (const row of details.filter((x) => x.kind === "constraint" && x.production !== null)) {
      const [t, n] = row.key.split(".");
      await tx.unsafe(
        `alter table public.${quote(t)} drop constraint ${quote(n)};alter table public.${quote(t)} add constraint ${quote(n)} ${row.production}`,
      );
    }
    await tx.unsafe(
      "alter table public.animals add column source_url text;create unique index animals_source_url_idx on public.animals(source_url) where source_url is not null",
    );
    for (const row of details.filter((x) => x.kind === "function")) await tx.unsafe(row.production);
    await tx.unsafe(
      "drop function public.update_animal_status_with_audit(uuid,uuid,text,timestamptz);drop function public.upsert_animal_internal_profile_with_audit(uuid,uuid,jsonb)",
    );
    for (const row of remote.filter((x) => x.kind === "function")) {
      // Identity argument names are accepted in GRANT FUNCTION signatures.
      for (const role of ["anon", "authenticated", "service_role"])
        await tx.unsafe(
          `${row.value[role] ? "grant" : "revoke"} execute on function ${row.key} ${row.value[role] ? "to" : "from"} ${role}`,
        );
    }
    const shaped = await tx.unsafe(catalog);
    for (const row of shaped.filter((x) => x.kind === "relation")) {
      const other = remote.find((x) => x.kind === row.kind && x.key === row.key);
      assert.deepEqual(
        { ...row.value, columns: undefined },
        { ...other.value, columns: undefined },
        row.key,
      );
    }
    const shapedDetails = await tx.unsafe(
      await readFile("scripts/baseline-parity-details.sql", "utf8"),
    );
    const remoteDetails = JSON.parse(
      await readFile(dir + "production-baseline-details.json", "utf8"),
    ).objects;
    assert.deepEqual(
      shapedDetails.filter((x) => x.kind === "column"),
      remoteDetails.filter((x) => x.kind === "column"),
    );
    results.push(
      "All relation catalogs match production except physical column order; all four changed tables match named column definitions",
    );
    await tx.unsafe(
      `insert into public.animals(id,name,type,age,gender,publication_state,source_url) values('ad000000-0000-4000-8000-000000000013','Isolated parity sentinel','cat','adult','female','draft','https://example.invalid/parity-source')`,
    );
    await tx.unsafe(migration);
    assert.equal(
      (
        await tx.unsafe(
          "select count(*)::int n from information_schema.columns where table_schema='public' and table_name='animals' and column_name='source_url'",
        )
      )[0].n,
      1,
    );
    assert.equal(
      (
        await tx.unsafe(
          "select count(*)::int n from pg_policies where schemaname='public' and tablename='adoption_applications' and policyname='admin only'",
        )
      )[0].n,
      0,
    );
    for (const role of ["anon", "authenticated"])
      assert.equal(
        (
          await tx.unsafe(
            `select has_function_privilege('${role}','public.update_animal_status_with_audit(uuid,uuid,text,timestamptz)','execute') allowed`,
          )
        )[0].allowed,
        false,
      );
    results.push(
      "Prerequisite repairs observed gaps, retains source_url, removes broad policy and denies browser actor RPCs",
    );
    const files = (await readdir("supabase/migrations"))
      .filter((x) => x.startsWith("20260913") && !x.includes("060000"))
      .sort();
    assert(files.length >= 36);
    for (const file of files)
      await tx.unsafe(await readFile("supabase/migrations/" + file, "utf8"));
    const retained = await tx.unsafe(
      `select name,source_url from public.animals where id='ad000000-0000-4000-8000-000000000013'`,
    );
    assert.deepEqual(
      [...retained],
      [{ name: "Isolated parity sentinel", source_url: "https://example.invalid/parity-source" }],
    );
    results.push(
      `All ${files.length} feature migrations apply and preserve the synthetic canonical animal ID and production-only source URL`,
    );
    const final = await tx.unsafe(catalog);
    const expected = await accepted.unsafe(catalog);
    const differences = [];
    for (const row of expected) {
      const actual = final.find((x) => x.kind === row.kind && x.key === row.key);
      if (!actual) {
        differences.push({ key: row.key, missing: true });
        continue;
      }
      const fields = Object.keys(row.value).filter(
        (k) => JSON.stringify(row.value[k]) !== JSON.stringify(actual.value[k]),
      );
      if (fields.length) differences.push({ key: row.key, fields });
    }
    const allowed: Record<string, string[]> = Object.fromEntries([
      ["private.assert_sponsorship_allocation_valid()", ["body_md5", "normalized_body_md5"]],
      ...remote
        .filter(
          (x) =>
            x.kind === "function" &&
            [
              "assign_sponsorship_animal_with_audit",
              "record_sponsorship_payment_proof",
              "review_sponsorship_payment_proof",
              "set_animal_catalog_membership_defaults",
            ].some((n) => x.key.startsWith("public." + n + "(")),
        )
        .map((x) => [x.key, ["body_md5", "normalized_body_md5"]]),
      ["public.animals", ["columns", "indexes"]],
      ["public.donation", ["columns"]],
    ]);
    for (const difference of differences) {
      assert(!difference.missing, `Missing candidate object: ${difference.key}`);
      assert.deepEqual(
        difference.fields,
        allowed[difference.key],
        `Unexpected candidate drift: ${difference.key}`,
      );
    }
    results.push(
      `All ${expectedObjectCount} accepted candidate objects are present; only reviewed comment hashes, source_url and physical column order differ`,
    );
    await writeFile(
      dir + "six-phase-production-shaped-rehearsal.json",
      JSON.stringify(
        {
          checked_at: new Date().toISOString(),
          target: "hkscda_baseline_parity_20260913",
          production_mutated: false,
          transaction_rolled_back: true,
          scope:
            "Observed public/private structural drift; no production data, platform or storage clone",
          results,
          accepted_candidate_objects: expected.length,
          rehearsed_objects: final.length,
          differences,
        },
        null,
        2,
      ),
    );
    await tx.unsafe("rollback");
  });
  console.log(results.join("\n"));
} finally {
  await db.close();
  await accepted.close();
}
