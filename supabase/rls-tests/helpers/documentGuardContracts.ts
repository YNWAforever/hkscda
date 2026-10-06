import type { GuardObject, RawCloneState, RawRow } from "./documentGuardPreservation";

type ObjectValue = Record<string, unknown>;
type Contract = {
  name: string;
  table: string;
  functionRaw: ObjectValue;
  triggerRaw: ObjectValue;
  constraintRaw: ObjectValue;
};
function deny(message: string): never {
  throw Object.assign(new Error("55000 " + message), { code: "55000" });
}
const object = (v: unknown): ObjectValue =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as ObjectValue)
    : deny("Missing catalog object");
const text = (v: unknown): string => (typeof v === "string" ? v : deny("Missing catalog identity"));
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x !== null && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
const omit = (v: ObjectValue, keys: string[]) =>
  Object.fromEntries(Object.entries(v).filter(([k]) => !keys.includes(k)));
const parsed = (r: RawRow) => object(JSON.parse(r.raw));
const rows = (s: RawCloneState, name: string) =>
  s.catalogs["pg_catalog." + name] ?? deny("Missing raw catalog " + name);
const one = (s: RawCloneState, name: string, predicate: (v: ObjectValue) => boolean) => {
  const found = rows(s, name).map(parsed).filter(predicate);
  return found.length === 1 ? found[0] : deny("Ambiguous named native contract " + name);
};

/** Read only the finite embedded contracts in the tracked migration under test.
 * Actual original row strings always come from the SAME raw snapshot, never this DATA.
 */
export function namedGuardContracts(migration: string): Contract[] {
  const parts = migration.split("$contracts$");
  if (parts.length !== 3) deny("Missing finite migration contracts");
  const value: unknown = JSON.parse(parts[1]);
  if (!Array.isArray(value) || value.length !== 3) deny("Bad contract count");
  const expected = new Map([
    ["enforce_published_site_document_slot_asset", "public.site_document_slots"],
    ["enforce_published_knowledge_document_assets", "public.knowledge_posts"],
    ["protect_published_document_references", "public.document_assets"],
  ]);
  const seen = new Set<string>();
  return value.map((v) => {
    const c = object(v),
      name = text(c.name),
      table = text(c.table);
    if (expected.get(name) !== table || seen.has(name)) deny("Unknown named contract");
    seen.add(name);
    return {
      name,
      table,
      functionRaw: object(c.functionRaw),
      triggerRaw: object(c.triggerRaw),
      constraintRaw: object(c.constraintRaw),
    };
  });
}

export type NamedGuardAdmission = {
  objects: GuardObject[];
  dependencies: ReadonlySet<string>;
  owners: ReadonlySet<string>;
};
/** Validate every named native row and its entire incoming/outgoing/shared closure.
 * Expected edge DATA is compared structurally; returned exclusion sets preserve the
 * exact original row_to_json TEXT from this snapshot, including its key order.
 */
export function validateNamedGuardContracts(
  state: RawCloneState,
  migration: string,
): NamedGuardAdmission {
  if (
    state.actor !== "supabase_admin" ||
    state.session !== "supabase_admin" ||
    !["170006", "170011"].includes(state.version)
  )
    deny("Unmeasured named contract context");
  const contracts = namedGuardContracts(migration);
  const namespace = (name: string) =>
    text(one(state, "pg_namespace", (v) => v.nspname === name).oid);
  const privateOid = namespace("private"),
    publicOid = namespace("public");
  // pg_authid rows retain their ordinary fields and a server-only password hash.
  const role = rows(state, "pg_authid")
    .map((r) => object(JSON.parse(r.raw.split(" SHA256_PRIVATE_FIELDS=")[0])))
    .filter((v) => v.rolname === "postgres");
  if (role.length !== 1) deny("Missing actual postgres owner");
  const owner = text(role[0].oid);
  const language = text(one(state, "pg_language", (v) => v.lanname === "plpgsql").oid);
  const classOid = (name: string) =>
    text(
      one(
        state,
        "pg_class",
        (v) => v.relnamespace === namespace("pg_catalog") && v.relname === name,
      ).oid,
    );
  const procClass = classOid("pg_proc"),
    triggerClass = classOid("pg_trigger"),
    constraintClass = classOid("pg_constraint");
  const namespaceClass = classOid("pg_namespace"),
    languageClass = classOid("pg_language"),
    relationClass = classOid("pg_class"),
    roleClass = classOid("pg_authid");
  const objects: GuardObject[] = [],
    required: ObjectValue[] = [],
    sharedRequired: ObjectValue[] = [];
  const edge = (
    classid: string,
    objid: string,
    refclassid: string,
    refobjid: string,
    deptype: string,
  ) => ({ classid, objid, objsubid: 0, refclassid, refobjid, refobjsubid: 0, deptype });
  const namedFunctions = rows(state, "pg_proc")
    .map(parsed)
    .filter((p) => p.pronamespace === privateOid && contracts.some((c) => c.name === p.proname));
  const namedTriggers = rows(state, "pg_trigger")
    .map(parsed)
    .filter(
      (t) =>
        contracts.some((c) => c.name === t.tgname) &&
        rows(state, "pg_class")
          .map(parsed)
          .some((r) => r.oid === t.tgrelid && r.relnamespace === publicOid),
    );
  const namedConstraints = rows(state, "pg_constraint")
    .map(parsed)
    .filter((c) => c.connamespace === publicOid && contracts.some((e) => e.name === c.conname));
  if (namedFunctions.length !== 3 || namedTriggers.length !== 3 || namedConstraints.length !== 3)
    deny("Partial named installation");
  for (const c of contracts) {
    const table = c.table.split(".")[1],
      relation = text(
        one(state, "pg_class", (r) => r.relnamespace === publicOid && r.relname === table).oid,
      );
    const p = one(state, "pg_proc", (v) => v.pronamespace === privateOid && v.proname === c.name);
    const t = one(state, "pg_trigger", (v) => v.tgrelid === relation && v.tgname === c.name);
    const k = one(state, "pg_constraint", (v) => v.oid === t.tgconstraint);
    if (
      p.proowner !== owner ||
      p.prolang !== language ||
      t.tgfoid !== p.oid ||
      k.conrelid !== relation ||
      k.connamespace !== publicOid ||
      canonical(omit(p, ["oid", "pronamespace", "proowner", "prolang"])) !==
        canonical(c.functionRaw) ||
      canonical(omit(t, ["oid", "tgrelid", "tgfoid", "tgconstraint"])) !==
        canonical(c.triggerRaw) ||
      canonical(omit(k, ["oid", "conrelid", "connamespace"])) !== canonical(c.constraintRaw)
    )
      deny("Named native contract mismatch " + c.name);
    const pid = text(p.oid),
      tid = text(t.oid),
      kid = text(k.oid);
    objects.push(
      { classid: procClass, objid: pid },
      { classid: triggerClass, objid: tid },
      { classid: constraintClass, objid: kid },
    );
    required.push(
      edge(procClass, pid, namespaceClass, privateOid, "n"),
      edge(procClass, pid, languageClass, language, "n"),
      edge(triggerClass, tid, procClass, pid, "n"),
      edge(triggerClass, tid, relationClass, relation, "a"),
      edge(constraintClass, kid, triggerClass, tid, "i"),
      edge(constraintClass, kid, relationClass, relation, "a"),
    );
    sharedRequired.push({
      dbid: state.databaseOid,
      classid: procClass,
      objid: pid,
      objsubid: 0,
      refclassid: roleClass,
      refobjid: owner,
      deptype: "o",
    });
  }
  const owns = (classid: unknown, objid: unknown) =>
    objects.some((o) => o.classid === classid && o.objid === objid);
  const dependencies = rows(state, "pg_depend").filter((r) => {
    const v = parsed(r);
    return owns(v.classid, v.objid) || owns(v.refclassid, v.refobjid);
  });
  const owners = rows(state, "pg_shdepend").filter((r) => {
    const v = parsed(r);
    return v.dbid === state.databaseOid && owns(v.classid, v.objid);
  });
  const same = (actual: RawRow[], expected: ObjectValue[]) =>
    actual.length === expected.length &&
    canonical(actual.map((r) => canonical(parsed(r))).sort()) ===
      canonical(expected.map(canonical).sort());
  if (!same(dependencies, required) || !same(owners, sharedRequired))
    deny("Named native dependency closure mismatch");
  return {
    objects,
    dependencies: new Set(dependencies.map((r) => r.raw)),
    owners: new Set(owners.map((r) => r.raw)),
  };
}
