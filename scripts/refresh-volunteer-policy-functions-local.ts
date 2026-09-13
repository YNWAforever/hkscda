import { SQL } from "bun";
import { readFile } from "node:fs/promises";
const target = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (
  process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1" ||
  target !== "postgresql://postgres:postgres@127.0.0.1:56322/postgres"
)
  throw new Error("Disposable local target required");
const sql = new SQL(target);
try {
  const text = await readFile(
    new URL(
      "../supabase/migrations/20260913062837_volunteer_versioned_policy.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const functions = [...text.matchAll(/create (?:or replace )?function[\s\S]*?\$\$;/g)].map(
    ([definition]) => definition.replace(/^create function/, "create or replace function"),
  );
  await sql.begin(async (tx) => {
    for (const definition of functions) await tx.unsafe(definition);
  });
  console.log(`Refreshed ${functions.length} candidate functions in disposable database`);
} finally {
  await sql.close();
}
