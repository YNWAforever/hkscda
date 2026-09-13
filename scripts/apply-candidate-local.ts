import { SQL } from "bun";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
const target = new URL(url ?? "http://invalid");
if (
  target.hostname !== "127.0.0.1" ||
  target.port !== "56322" ||
  target.pathname !== "/postgres" ||
  process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1"
)
  throw new Error("Dedicated disposable database required");
const files = process.argv.slice(2);
if (
  !files.length ||
  files.some((path) => !/^supabase\/migrations\/20260913\d{6}_[a-z_]+\.sql$/.test(path))
)
  throw new Error("Only explicit candidate migration paths are accepted");
const db = new SQL(url!, { max: 1 });
try {
  for (const file of files) {
    await db.begin(async (tx) => {
      await tx.unsafe(await Bun.file(file).text());
    });
    console.log(`Applied ${file} to disposable 56322`);
  }
} finally {
  await db.close();
}
