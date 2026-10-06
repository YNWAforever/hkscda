import { assertCloneUrl, type createProductionClone } from "./productionSchemaClone";
import {
  captureGuardRawState,
  assertGuardRawPreserved,
  rawStateDigests,
  type RawCloneState,
} from "./documentGuardPreservation";
import { namedGuardContracts, validateNamedGuardContracts } from "./documentGuardContracts";

type OwnedClone = Awaited<ReturnType<typeof createProductionClone>>;
const deny = (message: string): never => {
  throw Object.assign(new Error("55000 " + message), { code: "55000" });
};
const code = (e: unknown) =>
  e !== null && typeof e === "object" && "code" in e ? e.code : undefined;
const empty = new Set<string>();

/** The caller provides the tracked migration and a guarded schema-only clone.
 * Every snapshot retains its original server strings only in memory. Receipts are
 * digests/counts; no catalog bodies, credentials or Auth rows are emitted.
 */
export async function applyDocumentGuards(
  clone: OwnedClone,
  migration: string,
  profile: "missing" | "modern",
) {
  assertCloneUrl(clone.url);
  if (Buffer.byteLength(migration) > 262144) deny("Document guard migration exceeds compact cap");
  const expected = namedGuardContracts(migration),
    before = await captureGuardRawState(clone.sql, clone.url);
  if (profile === "missing" && before.version !== "170006")
    deny("Unmeasured missing-profile server version");
  if (profile === "modern") validateNamedGuardContracts(before, migration);
  else {
    const names = expected.map((c) => c.name);
    for (const [table, field] of [
      ["pg_proc", "proname"],
      ["pg_trigger", "tgname"],
      ["pg_constraint", "conname"],
    ] as const) {
      const values = before.catalogs["pg_catalog." + table];
      if (!values) deny("Missing named installation inventory");
      // The missing profile is deliberately stricter: no duplicate names in any schema.
      if (
        values.some((r) => {
          const v: unknown = JSON.parse(r.raw);
          return (
            v !== null &&
            typeof v === "object" &&
            Object.entries(v).some(([key, value]) => key === field && names.includes(String(value)))
          );
        })
      )
        deny("Expected completely absent named guards");
    }
  }
  const apply = async () =>
    clone.sql.begin(async (tx) => {
      // Set the deadline BEFORE submitting the DO; an in-DO set_config is insufficient.
      await tx`set local lock_timeout='5s'`;
      await tx`set local statement_timeout='30s'`;
      await tx`set local role postgres`;
      const context = await tx`select current_user as actor,session_user as session,
      current_setting('statement_timeout') as deadline,current_setting('lock_timeout') as lock_bound`;
      if (
        context.length !== 1 ||
        context[0].actor !== "postgres" ||
        context[0].session !== "supabase_admin" ||
        context[0].deadline !== "30s" ||
        context[0].lock_bound !== "5s"
      )
        deny("Wrong pre-DO transaction context");
      await tx.unsafe(migration);
      return {
        actor: context[0].actor,
        session: context[0].session,
        statementTimeout: context[0].deadline,
        lockTimeout: context[0].lock_bound,
      };
    });
  const firstTransaction = await apply(),
    after = await captureGuardRawState(clone.sql, clone.url);
  const firstAdmission = validateNamedGuardContracts(after, migration);
  const firstPreservation = assertGuardRawPreserved(
    before,
    after,
    profile === "missing" ? firstAdmission.objects : [],
    profile === "missing" ? firstAdmission.dependencies : empty,
    profile === "missing" ? firstAdmission.owners : empty,
  );
  const secondTransaction = await apply(),
    second = await captureGuardRawState(clone.sql, clone.url);
  const secondAdmission = validateNamedGuardContracts(second, migration);
  const secondPreservation = assertGuardRawPreserved(after, second, [], empty, empty);
  if (JSON.stringify(firstAdmission.objects) !== JSON.stringify(secondAdmission.objects))
    deny("Second application changed object identities");
  return {
    profile,
    applications: 2,
    firstTransaction,
    secondTransaction,
    admittedObjects: profile === "missing" ? firstAdmission.objects : [],
    before: rawStateDigests(before),
    after: rawStateDigests(after),
    second: rawStateDigests(second),
    firstPreservation,
    secondPreservation,
    sameCloneLogicalPreserved: firstPreservation.logicalPreserved,
    sameCloneUnaffectedRawPreserved: firstPreservation.unaffectedRawEqual,
    secondApplyRawNoOp: secondPreservation.rawEqual,
    modernRawNoOp:
      profile === "modern" && firstPreservation.rawEqual && secondPreservation.rawEqual,
  };
}

/** A real SET ROLE must be refused before reading any private catalog inventory.
 * RESET ROLE is in finally; the positive follow-up snapshot proves owning context
 * and every original catalog/data/sequence string remained unchanged.
 */
export async function documentGuardSnapshotContextRefusal(clone: OwnedClone) {
  assertCloneUrl(clone.url);
  const before = await captureGuardRawState(clone.sql, clone.url);
  let refused = false;
  try {
    await clone.sql`set role service_role`;
    try {
      await captureGuardRawState(clone.sql, clone.url);
      deny("Wrong-role snapshot was accepted");
    } catch (e) {
      if (
        !(e instanceof Error) ||
        code(e) !== "55000" ||
        e.message !== "55000 Foreign snapshot context"
      )
        throw e;
      refused = true;
    }
  } finally {
    await clone.sql`reset role`;
  }
  if (!refused) deny("Wrong-role snapshot refusal was not observed");
  const after = await captureGuardRawState(clone.sql, clone.url);
  const preservation = assertGuardRawPreserved(before, after, [], empty, empty);
  // A stable session alone must not allow a copied descriptor with a foreign actor.
  const wrong: RawCloneState = { ...after, actor: "service_role" };
  let descriptorRefused = false;
  try {
    assertGuardRawPreserved(before, wrong, [], empty, empty);
  } catch (e) {
    if (
      !(e instanceof Error) ||
      code(e) !== "55000" ||
      e.message !== "55000 Snapshot owning context changed"
    )
      throw e;
    descriptorRefused = true;
  }
  if (!descriptorRefused) deny("Wrong-actor snapshot descriptor was accepted");
  return {
    wrongRoleActualRefused: true,
    wrongActorDescriptorRefused: true,
    roleReset: true,
    before: rawStateDigests(before),
    after: rawStateDigests(after),
    preservation,
    logicalPreserved: preservation.logicalPreserved,
    unaffectedRawPreserved: preservation.unaffectedRawEqual,
  };
}
