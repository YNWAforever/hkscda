import { expect, test } from "bun:test";
import { isDeepStrictEqual } from "node:util";
import binding from "./task-8-cold-fix-1-binding.json";
import {
  assertTask8ColdBinding,
  isKnownTask8Vector,
  task8Vector,
} from "./task-8-cold-fix-1-profile";

const cohorts = Object.entries(binding.profiles).map(([name, profile]) => ({
  name,
  vector: task8Vector(profile),
}));
test("exact measured binding is accepted", () =>
  expect(assertTask8ColdBinding(binding)).toBe(binding));
for (const cohort of cohorts)
  test("complete " + cohort.name + " cohort is accepted", () => {
    expect(isKnownTask8Vector(cohort.vector)).toBe(true);
  });
const paths = [
  ...Object.keys(cohorts[0].vector.tables as Record<string, Record<string, unknown>>).flatMap(
    (table) =>
      ["relations", "columns", "constraints", "indexes", "triggers", "policies"].map((key) => [
        "tables",
        table,
        key,
      ]),
  ),
  ...[
    "functions",
    "auth",
    "native",
    "indexes",
    "shape",
    "schemas",
    "defaults",
    "roles",
    "memberships",
  ].map((key) => [key]),
];
function at(vector: Record<string, unknown>, path: string[]) {
  let parent = vector;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  return { parent, key: path.at(-1)! };
}
for (const cohort of cohorts)
  for (const path of paths)
    test(cohort.name + " refuses altered " + path.join("."), () => {
      const changed = structuredClone(cohort.vector),
        slot = at(changed, path);
      slot.parent[slot.key] = { unexpected: slot.parent[slot.key] };
      expect(isKnownTask8Vector(changed)).toBe(false);
    });
for (const left of cohorts)
  for (const right of cohorts) {
    if (left === right) continue;
    for (const path of paths) {
      const original = at(left.vector, path),
        donor = at(right.vector, path);
      if (isDeepStrictEqual(original.parent[original.key], donor.parent[donor.key])) continue;
      const crossed = structuredClone(left.vector),
        slot = at(crossed, path);
      slot.parent[slot.key] = structuredClone(donor.parent[donor.key]);
      // A cross that is itself an entire measured cohort is valid by definition.
      if (cohorts.some((c) => isDeepStrictEqual(crossed, c.vector))) continue;
      test(left.name + " refuses crossed " + right.name + " " + path.join("."), () => {
        expect(isKnownTask8Vector(crossed)).toBe(false);
      });
    }
  }
for (const key of Object.keys(binding))
  test("binding refuses altered provenance/vector " + key, () => {
    expect(() => assertTask8ColdBinding({ ...binding, [key]: null })).toThrow("binding differs");
  });
test("unknown complete profile and extra facets refuse", () => {
  expect(isKnownTask8Vector({ ...cohorts[2].vector, unknown: true })).toBe(false);
  expect(isKnownTask8Vector({})).toBe(false);
});
