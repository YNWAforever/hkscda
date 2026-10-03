import { expect, test } from "bun:test";
import { assertCapture, captureFlags } from "./task-12-receipt";
import * as receiptContract from "./task-12-receipt";
import { hash } from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
import { dependencies, fixtureScope } from "./task-12-profile";
// Portable synthetic validation only; this fixture never feeds executed SQL.
const catalogKeys=["roles","types","views","columns","indexes","schemas","defaults","policies","triggers","functions","relations","sequences","extensions","constraints","memberships","databaseOwner","extensionMembers"];
const protectedCatalog=Object.fromEntries(catalogKeys.map(k=>[k,[]]));
const protectedSnapshot=Object.fromEntries(["template","modern"].map(k=>[k,{catalog:protectedCatalog,managed:protectedCatalog,rows:[{schema:"synthetic",table:"synthetic",count:"0",hash:"0".repeat(32)}],sequences:[]}]));
const protectedValue=JSON.stringify({snapshot:protectedSnapshot,hash:hash(protectedSnapshot)});
const targetNames = ["update_group_enquiry_with_audit"];
function portableCapture() {
  const targets = targetNames.map((name) => ({
    schema: "public",
    name,
    owner: "postgres",
    args: "p_enquiry_id uuid, p_actor_user_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb",
    allargs: "p_enquiry_id uuid, p_actor_user_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb",
    defaults:0,default_expression:null,result:"jsonb",config:["search_path=public, pg_temp"],definer:true,language:"plpgsql",kind:"f",cost:100,rows:0,strict:false,leakproof:false,parallel:"u",volatility:"v",support:"-",variadic:"-",modes:null,
    body: "0".repeat(32),
    definition: "1".repeat(32),
    full_acl: ["postgres", "service_role"].map((grantee) => ({
      grantor: "postgres",
      grantee,
      privilege: "EXECUTE",
      grantable: false,
    })),
  }));
  return {
    receiptVersion: 1,
    receiptType: "capture",
    mode: "hosted",
    error: null,
    failedFinalFlags: [],
    requiredFinalFlags: [...captureFlags],
    ...Object.fromEntries(captureFlags.map((k) => [k, true])),
    oldTargets: targets,
    nextTargets: structuredClone(targets),
    protectedBefore:protectedValue,protectedAfter:protectedValue,
    functions: Array.from({length:6},()=>({ schema: "auth", name: "uid" })),
    catalog: { roles: [], memberships: null },
    auth: {
      serviceSelect: false,
      serviceUpdate: false,
      serviceColumnSelect: false,
      serviceColumnUpdate: false,
      postgresSelect: true,
      postgresUpdate: true,
    },
    native: Array.from({length:396},()=>({synthetic:true})),
    indexes: Array.from({length:26},()=>({synthetic:true})),
    shapes: ["auth.users","public.admin_user","public.group_enquiries","public.audit_log"].map(name=>({name})),
    bindings: {synthetic:{rawSha256:"0".repeat(64),canonicalSha256:"0".repeat(64),rawGitBlob:"0".repeat(40),rawBytes:1,archive:"s0.source"}},
    dependencies: [...dependencies],
    fixtureScope: [...fixtureScope],
  };
}
test("portable fully qualified capture validates without ignored receipts", () =>
  expect(() => assertCapture(portableCapture(), "hosted")).not.toThrow());
for (const flag of captureFlags)
  for (const value of [false, undefined, 1, "true"])
    test(`capture rejects ${flag}=${String(value)}`, () => {
      const r = { ...portableCapture(), [flag]: value };
      expect(() => assertCapture(r, "hosted")).toThrow();
    });
for (const patch of [
  { receiptVersion: 0 },
  { mode: "modern" },
  { mode: "component" },
  { receiptVersion: 1,
    receiptType: "composition" },
  { error: "cleanup failed" },
  { failedFinalFlags: ["normalDrop"] },
  { requiredFinalFlags: [] },
])
  test(`capture refuses mode/type/error contract ${JSON.stringify(patch)}`, () =>
    expect(() => assertCapture({ ...portableCapture(), ...patch }, "hosted")).toThrow());
for (const key of ["oldTargets", "nextTargets"] as const)
  for (const count of [0, 2, 4, 6])
    test(`${key} requires exactly one`, () => {
      const r = portableCapture();
      r[key] = Array.from({ length: count }, (_, i) => ({ ...r[key][0], name: "target" + i }));
      expect(() => assertCapture(r, "hosted")).toThrow();
    });
test("unrelated named functions cannot qualify as Task12 targets", () => {
  const r = portableCapture();
  r.nextTargets = r.nextTargets.map((t, i) => ({ ...t, name: "unreviewed" + i }));
  expect(() => assertCapture(r, "hosted")).toThrow();
});
for(const [key,value]of Object.entries({args:"p_actor_user_id uuid",allargs:"bad",defaults:1,default_expression:"null::uuid",result:"void",config:["search_path=public"],definer:false,language:"sql",kind:"p",cost:101,rows:1,strict:true,leakproof:true,parallel:"s",volatility:"s",support:"helper",variadic:"text",modes:["i"]}))
 test("capture rejects altered exact target attribute "+key,()=>{const r=portableCapture();Object.assign(r.nextTargets[0],{[key]:value});expect(()=>assertCapture(r,"hosted")).toThrow()});
for(const patch of [{protectedBefore:undefined},{protectedAfter:undefined},{protectedAfter:"{}"},{protectedBefore:"{}",protectedAfter:"{}"},{bindings:{}},{native:[]},{indexes:[]},{functions:[]},{fixtureScope:["synthetic","synthetic","synthetic","synthetic"]},{dependencies:Array.from({length:10},()=>["synthetic","0".repeat(64)])}])
 test("capture refuses incomplete saved proof contract "+JSON.stringify(patch).slice(0,80),()=>expect(()=>assertCapture({...portableCapture(),...patch},"hosted")).toThrow());
for (const key of [
  "serviceSelect",
  "serviceUpdate",
  "serviceColumnSelect",
  "serviceColumnUpdate",
] as const)
  test(`unexpected effective Auth ${key} cannot qualify`, () => {
    const r = portableCapture();
    r.auth[key] = true;
    expect(() => assertCapture(r, "hosted")).toThrow();
  });

const compositionFlags = [
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
];
function portableComposition() {
  const tables = Array.from({ length: 163 }, (_, i) => "synthetic" + i).concat("auth.users");
  return {
    receiptVersion: 1,
    receiptType: "composition",
    mode: "hosted",
    error: null,
    failedFinalFlags: [],
    requiredFinalFlags: compositionFlags,
    ...Object.fromEntries(compositionFlags.map((k) => [k, true])),
    protectedBefore:protectedValue,protectedAfter:protectedValue,
    testExit: 0,
    dependencies:[...dependencies],
    fixtureScope:[...fixtureScope],
    rowCountsAfter: tables.map((table) => ({ table, count: "0" })),
    expectedRowTables: tables,
    zeroApplicationTables: 158,
    refusals: Array.from({ length: 14 }, (_, i) => ({
      label: "synthetic" + i,
      code: "55000",
      preserved: true,
    })),
    beforeGapCount: 8,
    afterGapCount: 7,
    beforeGaps: Array(8).fill("synthetic"),
    afterGaps: Array(7).fill("synthetic"),
  };
}
test("portable fully qualified composition requires an explicit consumer", () =>
  expect(() => receiptContract.assertComposition(portableComposition(), "hosted")).not.toThrow());
for (const flag of compositionFlags)
  for (const value of [false, undefined, 1, "true"])
    test(`composition rejects ${flag}=${String(value)}`, () =>
      expect(() =>
        receiptContract.assertComposition({ ...portableComposition(), [flag]: value }, "hosted"),
      ).toThrow());
for (const patch of [
  { receiptVersion: 0 },
  { mode: "modern" },
  { mode: "component" },
  { receiptVersion: 1,
    receiptType: "capture" },
  { error: "cleanup observation failed" },
  { failedFinalFlags: ["modernPreserved"] },
  { requiredFinalFlags: [] },
  { testExit: 1 },
  { rowCountsAfter: [] },
  { refusals: [] },
])
  test(`composition rejects fixed contract ${JSON.stringify(patch)}`, () =>
    expect(() =>
      receiptContract.assertComposition({ ...portableComposition(), ...patch }, "hosted"),
    ).toThrow());

test("portable component capture requires both additional exact flags", () => {
  const r = {
    ...portableCapture(),
    functions:Array.from({length:7},()=>({schema:"synthetic",name:"synthetic"})),
    native:Array.from({length:392},()=>({synthetic:true})),
    mode: "component",
    requiredFinalFlags: [...receiptContract.componentCaptureFlags],
    componentSourceBound: true,
    componentOnlyAuthChanged: true,
  };
  expect(() => assertCapture(r, "component")).not.toThrow();
  for (const key of ["componentSourceBound", "componentOnlyAuthChanged"])
    for (const value of [false, undefined, 1, "true"])
      expect(() => assertCapture({ ...r, [key]: value }, "component")).toThrow();
});
for (const mode of ["modern", "component"] as const)
  test(`portable ${mode} composition uses its actual cardinality`, () => {
    const tables = Array.from({ length: 162 }, (_, i) => "synthetic" + i).concat("auth.users");
    const r = {
      ...portableComposition(),
      mode,
      zeroApplicationTables: 162,
      expectedRowTables: tables,
      rowCountsAfter: tables.map((table) => ({ table, count: "0" })),
      beforeGapCount: 1,
      afterGapCount: 1,
      beforeGaps: ["synthetic"],
      afterGaps: ["synthetic"],
    };
    expect(() => receiptContract.assertComposition(r, mode)).not.toThrow();
    expect(() =>
      receiptContract.assertComposition({ ...r, rowCountsAfter: r.rowCountsAfter.slice(1) }, mode),
    ).toThrow();
  });
function portableGates() {
  return {
    receiptVersion: 1,
    receiptType: "gates",
    mode: "local",
    error: null,
    failedFinalFlags: [],
    requiredFinalFlags: [...receiptContract.gateFlags],
    ...Object.fromEntries(receiptContract.gateFlags.map((k) => [k, true])),
    gates: ["build", "lint", "tests", "typecheck"].map((gate) => ({ gate, exit: 0 })),
    databaseReceipts: { hosted: "synthetic", modern: "synthetic", component: "synthetic" },
  };
}
test("portable four local gates validate without ignored receipts", () =>
  expect(() => receiptContract.assertGates(portableGates())).not.toThrow());
for (const flag of receiptContract.gateFlags)
  for (const value of [false, undefined, 1, "true"])
    test(`local gates reject ${flag}=${String(value)}`, () =>
      expect(() => receiptContract.assertGates({ ...portableGates(), [flag]: value })).toThrow());
for (const patch of [
  { mode: "hosted" },
  { error: "cleanup observation failed" },
  { failedFinalFlags: ["templatePreserved"] },
  { requiredFinalFlags: [] },
  { gates: [] },
  { databaseReceipts: { hosted: "synthetic", modern: "synthetic" } },
])
  test(`local gates reject fixed contract ${JSON.stringify(patch)}`, () =>
    expect(() => receiptContract.assertGates({ ...portableGates(), ...patch })).toThrow());
test("nonzero or duplicated local gate cannot qualify", () => {
  const r = portableGates();
  r.gates[0].exit = 1;
  expect(() => receiptContract.assertGates(r)).toThrow();
  r.gates[0] = { gate: "tests", exit: 0 };
  expect(() => receiptContract.assertGates(r)).toThrow();
});
