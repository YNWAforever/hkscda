/** Exact observed Task8 profile; all facets select one correlated cohort. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import evidence from "./task-8-cold-fix-1-binding.json";
import { tables } from "./task-8-profile";

export const tableFacets = [
  "relations",
  "columns",
  "constraints",
  "indexes",
  "triggers",
  "policies",
];
export const globalFacets = ["schemas", "defaults", "roles", "memberships"];
export const queryFacets = ["functions", "auth", "native", "indexes", "shape"];
export type Task8Profile = {
  catalog: Record<string, unknown>;
  functions: unknown[];
  targets: { name: string; body: string; [key: string]: unknown }[];
  auth: unknown;
  native: unknown[];
  indexes: unknown[];
  shape: unknown[];
};
export type Task8Vector = Record<string, unknown>;
const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const prefix = "docs/evidence/audit-remediation-20260927/r01-forward/";
const rawPin = "fe20d3fd0c047770e0b81e76e9ec428ef78b1e546252c52a8fc62a6ed2320d87";
const objectPin = "d65be2200bc1029ca9a3b69a68d41b71b7193b3319bdf902be2ee78c6a87a5d1";

export function task8Vector(profile: Task8Profile): Task8Vector {
  return {
    tables: Object.fromEntries(
      tables.map((name) => [
        name,
        Object.fromEntries(
          tableFacets.map((key) => [
            key,
            (profile.catalog[key] as unknown[]).filter((value) => {
              const entry = value as { schema: string; table?: string; name?: string };
              return entry.schema === "public" && (entry.table ?? entry.name) === name;
            }),
          ]),
        ),
      ]),
    ),
    ...Object.fromEntries(queryFacets.map((key) => [key, profile[key as keyof Task8Profile]])),
    ...Object.fromEntries(globalFacets.map((key) => [key, profile.catalog[key]])),
  };
}

export function assertTask8ColdBinding(value: unknown): typeof evidence {
  if (sha(JSON.stringify(value)) !== objectPin)
    throw Error("Task8 complete observed cold binding differs");
  return value as typeof evidence;
}

export function isKnownTask8Vector(value: unknown): boolean {
  const binding = assertTask8ColdBinding(evidence);
  return Object.values(binding.profiles).some((profile) =>
    isDeepStrictEqual(value, task8Vector(profile)),
  );
}

export async function verifyTask8ColdBinding(root: string, historical: Task8Profile[]) {
  const binding = assertTask8ColdBinding(evidence);
  for (const [file, pin] of [
    ["task-8-cold-fix-1-binding.json", rawPin],
    [binding.archive, binding.archiveSHA256],
    ["task-8-raw-receipts.zip", binding.originalArchiveSHA256],
  ])
    if (sha(await readFile(resolve(root, prefix + file))) !== pin)
      throw Error("Task8 observed profile/archive binding differs: " + file);
  if (
    historical.length !== 2 ||
    !isDeepStrictEqual(task8Vector(historical[0]), task8Vector(binding.profiles.hosted)) ||
    !isDeepStrictEqual(task8Vector(historical[1]), task8Vector(binding.profiles.modern))
  )
    throw Error("Task8 historical profiles differ from unchanged archived vectors");
  return binding.profiles.cold;
}
