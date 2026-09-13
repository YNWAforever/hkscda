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
const [file, ...names] = process.argv.slice(2);
if (
  !/^supabase\/migrations\/20260913\d{6}_[a-z_]+\.sql$/.test(file ?? "") ||
  !names.length ||
  names.some((n) => !/^[a-z_]+$/.test(n))
)
  throw new Error("Explicit candidate migration and function names required");
const source = await Bun.file(file).text();
const definitions = [
  ...source.matchAll(/create (?:or replace )?function public\.([a-z_]+)\([\s\S]*?\$\$;/gi),
].filter((m) => names.includes(m[1]));
if (definitions.length !== names.length) throw new Error("Expected exact function count");
const db = new SQL(url!, { max: 1, prepare: false });
try {
  await db.begin(async (tx) => {
    for (const match of definitions)
      await tx.unsafe(
        match[0].replace(/^create (?:or replace )?function/i, "create or replace function"),
      );
    for (const grant of source.matchAll(
      /(?:revoke|grant)[^;]*on function public\.([a-z_]+)\([^;]*;/gi,
    )) {
      if (names.includes(grant[1])) await tx.unsafe(grant[0]);
    }
  });
  console.log(`Refreshed ${names.join(", ")} on disposable 56322`);
} finally {
  await db.close();
}
