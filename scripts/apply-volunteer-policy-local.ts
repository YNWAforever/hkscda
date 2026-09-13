import { SQL } from "bun";
import { readFile } from "node:fs/promises";

const target = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (
  process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1" ||
  target !== "postgresql://postgres:postgres@127.0.0.1:56322/postgres"
) {
  throw new Error("Explicit disposable volunteer test database required");
}
const sql = new SQL(target);
try {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260913062837_volunteer_versioned_policy.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(migration);
  });
  console.log("Volunteer policy candidate applied to disposable local database only");
} finally {
  await sql.close();
}
