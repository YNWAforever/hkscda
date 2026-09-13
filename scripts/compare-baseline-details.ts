import { SQL } from "bun";
import { readFile, writeFile } from "node:fs/promises";
const db = new SQL(
  "postgresql://postgres:postgres@127.0.0.1:56322/hkscda_baseline_parity_20260913",
  { max: 1, prepare: false },
);
try {
  const local = await db.unsafe(await readFile("scripts/baseline-parity-details.sql", "utf8"));
  const remote = JSON.parse(
    await readFile(
      "docs/evidence/admin-volunteer-settings/production-baseline-details.json",
      "utf8",
    ),
  ).objects;
  const differences = [];
  for (const row of local) {
    const other = remote.find((x) => x.kind === row.kind && x.key === row.key);
    if (!other || other.definition !== row.definition)
      differences.push({
        kind: row.kind,
        key: row.key,
        baseline: row.definition,
        production: other?.definition ?? null,
      });
  }
  for (const row of remote)
    if (!local.some((x) => x.kind === row.kind && x.key === row.key))
      differences.push({
        kind: row.kind,
        key: row.key,
        baseline: null,
        production: row.definition,
      });
  await writeFile(
    "docs/evidence/admin-volunteer-settings/baseline-parity-details.json",
    JSON.stringify(differences, null, 2),
  );
  console.log(
    JSON.stringify(
      differences.filter((x) => x.kind !== "function"),
      null,
      2,
    ),
  );
  for (const row of differences.filter((x) => x.kind === "function")) {
    await writeFile(
      ".local-policy-test/baseline-parity/" + row.key + ".baseline.sql",
      row.baseline ?? "",
    );
    await writeFile(
      ".local-policy-test/baseline-parity/" + row.key + ".production.sql",
      row.production ?? "",
    );
  }
} finally {
  await db.close();
}
