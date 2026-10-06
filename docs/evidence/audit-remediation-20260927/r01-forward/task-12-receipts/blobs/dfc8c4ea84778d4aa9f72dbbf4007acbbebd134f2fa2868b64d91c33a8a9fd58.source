export const captureFlags = [
  "schemaParity",
  "fullScannerPassed",
  "dependenciesBound",
  "catalogPreserved",
  "normalDrop",
  "templatePreserved",
  "modernPreserved",
  "frozenInputsPreserved",
] as const;
export const componentCaptureFlags = [
  ...captureFlags,
  "componentSourceBound",
  "componentOnlyAuthChanged",
] as const;
export const gateFlags = [
  "finalProfilesQualified",
  "sourceFrozen",
  "frozenInputsPreserved",
  "templatePreserved",
] as const;
export function assertGates(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Gates object required");
  const r = value as Record<string, unknown>;
  if (
    r.receiptVersion !== 1 ||
    r.receiptType !== "gates" ||
    r.mode !== "local" ||
    r.error !== null ||
    JSON.stringify(r.failedFinalFlags) !== "[]" ||
    JSON.stringify(r.requiredFinalFlags) !== JSON.stringify(gateFlags) ||
    gateFlags.some((k) => r[k] !== true) ||
    !Array.isArray(r.gates) ||
    r.gates.length !== 4 ||
    JSON.stringify(r.gates.map((g) => g.gate).sort()) !==
      JSON.stringify(["build", "lint", "tests", "typecheck"]) ||
    r.gates.some((g) => g.exit !== 0) ||
    !r.databaseReceipts ||
    Object.keys(r.databaseReceipts).sort().join(",") !== "component,hosted,modern"
  )
    throw Error("Ineligible Task12 exact local gates");
  return r;
}
export const compositionFlags = [
  "schemaParity",
  "fullScannerPassed",
  "dependenciesBound",
  "firstApply",
  "secondApply",
  "secondApplyPreserved",
  "outsideTargetsPreserved",
  "supplementalPreserved",
  "refusalsPassed",
  "testPassed",
  "zeroRowsAfter",
  "catalogAfterBehaviorPreserved",
  "normalDrop",
  "templatePreserved",
  "modernPreserved",
  "frozenInputsPreserved",
] as const;
export function assertComposition(value: unknown, mode: "hosted" | "modern" | "component") {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Composition object required");
  const r = value as Record<string, unknown>;
  if (
    r.receiptVersion !== 1 ||
    r.receiptType !== "composition" ||
    r.mode !== mode ||
    r.error !== null ||
    JSON.stringify(r.failedFinalFlags) !== "[]" ||
    JSON.stringify(r.requiredFinalFlags) !== JSON.stringify(compositionFlags) ||
    compositionFlags.some((k) => r[k] !== true) ||
    r.testExit !== 0
  )
    throw Error("Ineligible Task12 composition flags/mode/type");
  assertProtected(r);
  if(JSON.stringify(r.dependencies)!==JSON.stringify(dependencies)||JSON.stringify(r.fixtureScope)!==JSON.stringify(fixtureScope))throw Error("Exact Task12 composition dependencies/scope required");
  const initialCount = mode === "hosted" ? 158 : 162,
    finalCount = mode === "hosted" ? 164 : 163;
  if (
    r.beforeGapCount !== (mode === "hosted" ? 8 : 1) ||
    r.afterGapCount !== (mode === "hosted" ? 7 : 1) ||
    !Array.isArray(r.beforeGaps) ||
    r.beforeGaps.length !== r.beforeGapCount ||
    !Array.isArray(r.afterGaps) ||
    r.afterGaps.length !== r.afterGapCount
  )
    throw Error("Ineligible Task12 actual gap cardinality");
  if (
    !Array.isArray(r.dependencies) ||
    r.dependencies.length !== 10 ||
    !Array.isArray(r.fixtureScope) ||
    r.fixtureScope.length !== 4 ||
    r.zeroApplicationTables !== initialCount ||
    !Array.isArray(r.rowCountsAfter) ||
    r.rowCountsAfter.length !== finalCount ||
    new Set(r.rowCountsAfter.map((t) => t.table)).size !== finalCount ||
    r.rowCountsAfter.some((t) => t.count !== "0") ||
    !Array.isArray(r.expectedRowTables) ||
    r.expectedRowTables.length !== finalCount ||
    JSON.stringify(r.rowCountsAfter.map((t) => t.table).sort()) !==
      JSON.stringify([...r.expectedRowTables].sort()) ||
    !r.expectedRowTables.includes("auth.users") ||
    !Array.isArray(r.refusals) ||
    r.refusals.length !== 14 ||
    new Set(r.refusals.map((t) => t.label)).size !== 14 ||
    r.refusals.some((t) => t.code !== "55000" || t.preserved !== true)
  )
    throw Error("Ineligible Task12 composition cardinality/rollback/rows");
  return r;
}
const targetNames = ["update_group_enquiry_with_audit"];
const targetAttributes = {
  args: "p_enquiry_id uuid, p_actor_user_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb",
  allargs: "p_enquiry_id uuid, p_actor_user_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb",
  defaults: 0, default_expression: null, result: "jsonb", config: ["search_path=public, pg_temp"],
  definer: true, language: "plpgsql", kind: "f", cost: 100, rows: 0, strict: false,
  leakproof: false, parallel: "u", volatility: "v", support: "-", variadic: "-", modes: null,
};
export function assertCapture(value: unknown, mode: "hosted" | "modern" | "component") {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Capture object required");
  const r = value as Record<string, unknown>;
  const flags = mode === "component" ? componentCaptureFlags : captureFlags;
  if (
    r.receiptVersion !== 1 ||
    r.receiptType !== "capture" ||
    r.mode !== mode ||
    r.error !== null ||
    JSON.stringify(r.failedFinalFlags) !== "[]" ||
    JSON.stringify(r.requiredFinalFlags) !== JSON.stringify(flags) ||
    flags.some((k) => r[k] !== true)
  )
    throw Error("Ineligible Task12 capture flags/mode/type");
  assertProtected(r);
  assertBindings(r.bindings);
  if(JSON.stringify(r.dependencies)!==JSON.stringify(dependencies)||JSON.stringify(r.fixtureScope)!==JSON.stringify(fixtureScope))throw Error("Exact Task12 capture dependencies/scope required");
  for (const key of ["oldTargets", "nextTargets"]) {
    const targets = r[key];
    if (
      !Array.isArray(targets) ||
      targets.length !== 1 ||
      JSON.stringify(targets.map((t) => t?.name).sort()) !== JSON.stringify(targetNames) ||
      targets.some(
        (t) =>
          !t ||
          t.schema !== "public" ||
          t.owner !== "postgres" ||
          Object.entries(targetAttributes).some(([key,value])=>JSON.stringify(t[key])!==JSON.stringify(value)) ||
          !/^[a-f0-9]{32}$/.test(t.body) ||
          !/^[a-f0-9]{32}$/.test(t.definition) ||
          !Array.isArray(t.full_acl) ||
          t.full_acl.length !== 2 ||
          JSON.stringify(t.full_acl.map((a: Record<string, unknown>) => a.grantee).sort()) !==
            JSON.stringify(["postgres", "service_role"]) ||
          t.full_acl.some(
            (a: Record<string, unknown>) =>
              a.grantor !== "postgres" ||
              !["postgres", "service_role"].includes(String(a.grantee)) ||
              a.privilege !== "EXECUTE" ||
              a.grantable !== false,
          ),
      )
    )
      throw Error("Ineligible Task12 exact one service target tuples:" + key);
  }
  if (
    !Array.isArray(r.functions) ||
    r.functions.length !== (mode==="hosted"?6:7) ||
    !r.catalog ||
    !r.auth ||
    !Array.isArray(r.native) ||
    r.native.length !== (mode==="hosted"?396:392) ||
    !Array.isArray(r.indexes) ||
    r.indexes.length !== 26 ||
    !Array.isArray(r.shapes) ||
    r.shapes.length !== 4 ||
    JSON.stringify(r.shapes.map(s=>s.name).sort())!==JSON.stringify(["auth.users","public.admin_user","public.audit_log","public.group_enquiries"]) ||
    !r.bindings ||
    !Array.isArray(r.dependencies) ||
    r.dependencies.length !== 10 ||
    !Array.isArray(r.fixtureScope) ||
    r.fixtureScope.length !== 4
  )
    throw Error("Ineligible Task12 full prerequisites/cardinality");
  const auth = r.auth as Record<string, unknown>;
  if (
    ["serviceSelect", "serviceUpdate", "serviceColumnSelect", "serviceColumnUpdate"].some(
      (k) => auth[k] !== false,
    ) ||
    ["postgresSelect", "postgresUpdate"].some((k) => auth[k] !== true)
  )
    throw Error("Ineligible Task12 effective Auth boundary");
  return r;
}
import { hash } from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
import { dependencies, fixtureScope } from "./task-12-profile";
const catalogKeys=["roles","types","views","columns","indexes","schemas","defaults","policies","triggers","functions","relations","sequences","extensions","constraints","memberships","databaseOwner","extensionMembers"];
function assertProtected(r:Record<string,unknown>){
  if(typeof r.protectedBefore!=="string"||r.protectedBefore!==r.protectedAfter)throw Error("Exact saved protected before/after required");
  const value=JSON.parse(r.protectedBefore);
  if(!value.snapshot||Object.keys(value.snapshot).sort().join(",")!=="modern,template"||value.hash!==hash(value.snapshot))throw Error("Complete protected source snapshot/hash required");
  for(const source of Object.values(value.snapshot) as Record<string,unknown>[]){
    for(const key of ["catalog","managed"]){const catalog=source[key];if(!catalog||typeof catalog!=="object"||catalogKeys.some(k=>!Object.hasOwn(catalog,k)))throw Error("Complete protected catalog required");}
    if(!Array.isArray(source.rows)||!source.rows.length||new Set(source.rows.map(r=>r.schema+"."+r.table)).size!==source.rows.length||source.rows.some(r=>typeof r.schema!=="string"||typeof r.table!=="string"||!/^\d+$/.test(r.count)||!/^[a-f0-9]{32}$/.test(r.hash))||!Array.isArray(source.sequences))throw Error("Complete protected row/sequence observations required");
  }
}
function assertBindings(value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value)||!Object.keys(value).length||Object.values(value).some(b=>!b||!Number.isInteger(b.rawBytes)||b.rawBytes<1||!/^[a-f0-9]{64}$/.test(b.rawSha256)||!/^[a-f0-9]{64}$/.test(b.canonicalSha256)||!/^[a-f0-9]{40}$/.test(b.rawGitBlob)||!/^s\d+\.source$/.test(b.archive)))throw Error("Exact nonempty raw/canonical/Git/archive source bindings required");
}
