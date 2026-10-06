import {
  assertDocumentTestTarget,
  type DocumentTestTarget,
  documentTestActor,
} from "./documentGuardTestTarget";
import { SQL, type TransactionSQL } from "bun";
import { assertSafeFixtureTables } from "./productionSchemaClone";
import { fixtureAsset, fixtureReference } from "./documentGuardBusiness";

type Target = "unpublish" | "kind-change";
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(message);
}
const latch = () => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const code = (e: unknown) =>
  e instanceof SQL.PostgresError && typeof e.errno === "string" && /^[0-9A-Z]{5}$/.test(e.errno)
    ? e.errno
    : undefined;

/** FIRST annual-only RR publication-first regression on ORIGINAL annual bodies.
 * Each target is a distinct intended first call; this does not rerun the twelve
 * existing site/knowledge cases. A broken invariant throws actual RED evidence.
 * No supplemental annual trigger is installed by this test.
 */
export async function documentAnnualPublicationRace(clone: DocumentTestTarget, target: Target) {
  await assertDocumentTestTarget(clone);
  require(target === "unpublish" || target === "kind-change", "Unknown annual race target");
  await assertSafeFixtureTables(clone.sql, ["public.document_assets", "public.annual_reports"]);
  const other = new SQL(clone.url, { max: 1 }),
    snapshot = latch(),
    published = latch(),
    release = latch();
  let asset = "",
    reference = "",
    blockerTx: TransactionSQL | undefined;
  let waiter: Promise<{ outcome: string; error?: unknown; code?: string }> | undefined,
    blocker: Promise<unknown> | undefined;
  let waiterReady = false,
    waiterSetupError: unknown,
    blockerSetupError: unknown;
  const row = async (tx: TransactionSQL) => {
    const r =
      await tx`select a.is_published asset_published,a.kind asset_kind,r.is_published reference_published
      from public.document_assets a join public.annual_reports r on r.document_asset_id=a.id
      where a.id=${asset}::uuid and r.id=${reference}::uuid`;
    require(r.length === 1, "Exact joined annual race fixture required");
    return r[0];
  };
  try {
    await clone.sql.begin(async (tx) => {
      asset = await fixtureAsset(tx, true, "annual_report");
      reference = await fixtureReference(tx, "annual", asset, false);
    });
    const contexts = await Promise.all([
      clone.sql`select pg_backend_pid()::text pid,current_user actor,session_user session,current_database() database`,
      other`select pg_backend_pid()::text pid,current_user actor,session_user session,current_database() database`,
    ]);
    require(contexts.every(
      (c) =>
        c.length === 1 &&
        c[0].actor === documentTestActor(clone) &&
        c[0].session === documentTestActor(clone) &&
        c[0].database === clone.name,
    ), "Annual race owning context mismatch");
    const blockerPid = String(contexts[0][0].pid),
      waiterPid = String(contexts[1][0].pid);
    require(blockerPid !== waiterPid, "Distinct annual race backends required");
    waiter = other
      .begin(async (tx) => {
        await tx`set transaction isolation level repeatable read`;
        await tx`set local lock_timeout='5s'`;
        await tx`set local statement_timeout='30s'`;
        const initial = await row(tx);
        require(initial.asset_published === true &&
          initial.asset_kind === "annual_report" &&
          initial.reference_published === false, "Annual initial fixture state differs");
        waiterReady = true;
        snapshot.resolve();
        await published.promise;
        if (target === "unpublish")
          await tx`update public.document_assets set is_published=false where id=${asset}::uuid`;
        else
          await tx`update public.document_assets set kind='adoption_guide' where id=${asset}::uuid`;
        return { outcome: "COMMITTED" };
      })
      .catch((e) => {
        if (!waiterReady) {
          waiterSetupError = e;
          snapshot.resolve();
        }
        return {
          outcome: "REFUSED",
          code: code(e),
          error:
            e instanceof SQL.PostgresError
              ? {
                  message: e.message,
                  code: e.code,
                  errno: e.errno,
                  severity: e.severity,
                  detail: e.detail,
                  hint: e.hint,
                  routine: e.routine,
                  stack: e.stack,
                }
              : {
                  type: e instanceof Error ? e.constructor.name : typeof e,
                  message: e instanceof Error ? e.message : String(e),
                },
        };
      });
    await snapshot.promise;
    if (waiterSetupError !== undefined) throw waiterSetupError;
    blocker = clone.sql
      .begin(async (tx) => {
        await tx`set transaction isolation level repeatable read`;
        await tx`set local lock_timeout='5s'`;
        await tx`set local statement_timeout='30s'`;
        blockerTx = tx;
        await tx`update public.annual_reports set is_published=true where id=${reference}::uuid`;
        published.resolve();
        await release.promise;
      })
      .catch((e) => {
        blockerSetupError = e;
        published.resolve();
        throw e;
      });
    await published.promise;
    if (blockerSetupError !== undefined) throw blockerSetupError;
    require(blockerTx !== undefined, "Missing annual blocker transaction");
    let observedBlocked = false;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const blocked =
        await blockerTx`select ${blockerPid}::integer=any(pg_catalog.pg_blocking_pids(${waiterPid}::integer)) blocked`;
      if (blocked.length === 1 && blocked[0].blocked === true) {
        observedBlocked = true;
        break;
      }
      await new Promise<void>((r) => setTimeout(r, 25));
    }
    require(observedBlocked, "Annual waiter was not observed blocked by publication transaction");
    release.resolve();
    await blocker;
    const actual = await waiter;
    const final = await clone.sql.begin((tx) => row(tx));
    const invariant =
      final.reference_published !== true ||
      (final.asset_published === true && final.asset_kind === "annual_report");
    const result = {
      reference: "annual",
      isolation: "repeatable read",
      order: "publication-first",
      target,
      blockerPid,
      waiterPid,
      observedBlocked,
      waiterOutcome: actual.outcome,
      actualError: actual.error,
      code: actual.code,
      assetPublished: final.asset_published,
      assetKind: final.asset_kind,
      referencePublished: final.reference_published,
      invariant,
    };
    if (!invariant)
      throw Object.assign(new Error("ACTUAL_ANNUAL_PUBLICATION_RACE_RED"), {
        code: "TASK13_ANNUAL_RACE_RED",
        result,
      });
    require(actual.outcome === "REFUSED" &&
      ["23514", "40001", "40P01"].includes(
        actual.code ?? "",
      ), "Unexpected actual annual RR outcome");
    return result;
  } finally {
    snapshot.resolve();
    published.resolve();
    release.resolve();
    await Promise.allSettled([...(blocker ? [blocker] : []), ...(waiter ? [waiter] : [])]);
    try {
      if (asset && reference)
        await clone.sql.begin(async (tx) => {
          await tx`set local lock_timeout='5s'`;
          await tx`set local statement_timeout='30s'`;
          await tx`delete from public.annual_reports where id=${reference}::uuid`;
          await tx`delete from public.document_assets where id=${asset}::uuid`;
        });
    } finally {
      await other.close();
    }
  }
}
