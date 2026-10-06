import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import evidence from "./task-11-cold-prerequisites.json";
import { assertColdEvidence, withObservedPairs } from "./task-11-cold-profile";

test("admits the three complete actually observed control ACL pairs", () => {
  expect(assertColdEvidence(evidence).profiles).toHaveLength(3);
  const sql = readFileSync("supabase/migrations/20261002170945_r01_finance_callback_forward.sql", "utf8");
  const literal = (value: unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
  expect(sql).toContain("when v_before=" + literal(evidence.profiles[2].pair.catalog) + " then 2");
  expect(sql).toContain("when 2 then " + literal(evidence.profiles[2].pair.helpers));
});

test("rejects a restored browser write to a control column", () => {
  const changed = structuredClone(evidence);
  const column = changed.profiles[0].pair.catalog.columns.find(
    (c) => c.table === "donation" && c.name === "idempotency_key",
  )!;
  column.acl.push({ grantor: "postgres", grantee: "authenticated", privilege: "UPDATE", grantable: false });
  expect(() => assertColdEvidence(changed)).toThrow();
});

test("rejects new grant options and an independently substituted helper vector", () => {
  const grant = structuredClone(evidence);
  grant.profiles[0].pair.catalog.columns[20].acl[0].grantable = true;
  expect(() => assertColdEvidence(grant)).toThrow();
  const mixed = structuredClone(evidence);
  mixed.profiles[0].pair.helpers = mixed.profiles[1].pair.helpers;
  expect(() => assertColdEvidence(mixed)).toThrow();
});

test("rejects incomplete measured proof and production claims", () => {
  expect(() => assertColdEvidence({ ...evidence, profiles: evidence.profiles.slice(0, 1) })).toThrow();
  expect(() => assertColdEvidence({ ...evidence, productionApplied: true })).toThrow();
  expect(() => assertColdEvidence({ ...evidence, nativeActualServerVersion: 170006 })).toThrow();
});

test("rejects an unknown provider facet and crossed hosted helper tuple", () => {
  const provider = structuredClone(evidence);
  const constraint = provider.profiles[2].pair.catalog.constraints.find(c => c.table === "payment" && c.name === "payment_provider_check")!;
  constraint.definition += " OR provider = 'unapproved_provider'::text";
  expect(() => assertColdEvidence(provider)).toThrow();
  const crossed = structuredClone(evidence);
  crossed.profiles[2].pair.helpers = crossed.profiles[0].pair.helpers;
  expect(() => assertColdEvidence(crossed)).toThrow();
});

test("renders exact paired selection while retaining historical guards", () => {
  const guards = withObservedPairs({ catalog: "HISTORICAL_CATALOG", helpers: "HISTORICAL_HELPERS" }, [
    { catalog: "COLD_CATALOG", helpers: "COLD_HELPERS" },
    { catalog: "MODERN_CATALOG", helpers: "MODERN_HELPERS" },
    { catalog: "HOSTED_CATALOG", helpers: "HOSTED_HELPERS" },
  ]);
  expect(guards.catalog).toContain("HISTORICAL_CATALOG");
  expect(guards.helpers).toContain("HISTORICAL_HELPERS");
  expect(guards.helpers).toContain("elsif v_actual<>(case v_observed");
  expect(guards.helpers).toContain("when 0 then COLD_HELPERS when 1 then MODERN_HELPERS when 2 then HOSTED_HELPERS");
});

