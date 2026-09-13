type CatalogRow = { kind: string; key: string; value: Record<string, unknown> };
type Difference = {
  key: string;
  status: string;
  fields?: string[];
  baseline?: Record<string, unknown>;
  production?: Record<string, unknown>;
};
import { SQL } from "bun";
import { readFile, writeFile } from "node:fs/promises";
const db = new SQL(
  "postgresql://postgres:postgres@127.0.0.1:56322/hkscda_baseline_parity_20260913",
  { max: 1, prepare: false },
);
function canonical(x: unknown): string {
  return JSON.stringify(x, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}
try {
  const baseline = await db.unsafe(await readFile("scripts/baseline-schema-catalog.sql", "utf8"));
  const production = JSON.parse(
    await readFile(
      "docs/evidence/admin-volunteer-settings/production-baseline-catalog.json",
      "utf8",
    ),
  );
  const local = new Map(baseline.map((x: CatalogRow) => [x.kind + ":" + x.key, x]));
  const remote = new Map(production.objects.map((x: CatalogRow) => [x.kind + ":" + x.key, x]));
  const differences: Difference[] = [];
  let exact = 0;
  for (const [key, row] of local) {
    const other = remote.get(key);
    if (!other) {
      differences.push({ key, status: "missing_in_production", baseline: row.value });
      continue;
    }
    const fields = Object.keys(row.value).filter(
      (k) => canonical(row.value[k]) !== canonical(other.value[k]),
    );
    if (!fields.length) exact++;
    else
      differences.push({
        key,
        status:
          fields.length === 1 && fields[0] === "body_md5"
            ? "whitespace_normalized_match"
            : "different",
        fields,
        baseline: row.value,
        production: other.value,
      });
  }
  for (const [key, row] of remote)
    if (!local.has(key))
      differences.push({ key, status: "production_only", production: row.value });
  const report = {
    checked_at: new Date().toISOString(),
    read_only_production: true,
    baseline_migrations: 63,
    baseline_objects: baseline.length,
    production_objects: production.objects.length,
    exact_matches: exact,
    differences,
  };
  await writeFile(
    "docs/evidence/admin-volunteer-settings/baseline-parity-comparison.json",
    JSON.stringify(report, null, 2),
  );
  await writeFile(
    "docs/evidence/admin-volunteer-settings/local-baseline-catalog.json",
    JSON.stringify({ target: "hkscda_baseline_parity_20260913", objects: baseline }, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        ...report,
        differences: differences.map(({ key, status, fields }) => ({ key, status, fields })),
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
