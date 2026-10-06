import {
  assertDocumentTestTarget,
  type DocumentTestTarget,
  documentTestActor,
  documentFixtureCountsEqual,
} from "./documentGuardTestTarget";
import { SQL, type TransactionSQL } from "bun";
import { assertSafeFixtureTables } from "./productionSchemaClone";
import { fixtureAsset, fixtureReference, referenceState } from "./documentGuardBusiness";

type Isolation = "read committed" | "repeatable read" | "serializable";
type Order = "publication-first" | "unpublish-first";
type RaceResult = {
  reference: "site" | "primary";
  isolation: Isolation;
  order: Order;
  blockerPid: string;
  waiterPid: string;
  observedBlocked: boolean;
  waiterOutcome: string;
  code?: string;
  message?: string;
  driverCode?: string;
  errno?: string;
  assetPublished: boolean;
  referencePublished: boolean;
  invariant: boolean;
};
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
const delay = () => new Promise<void>((r) => setTimeout(r, 25));

/** Two actual connections, transaction barriers and pg_blocking_pids observations.
 * No timing-only assertion: publication and inverse UPDATE must really block.
 * RR/Serializable outcomes are recorded separately. A committed broken invariant
 * is an actual RED and stops the caller, never an inferred success or an auto-fix.
 */
export async function documentGuardRaces(clone: DocumentTestTarget): Promise<RaceResult[]> {
  await assertDocumentTestTarget(clone);
  await assertSafeFixtureTables(clone.sql, [
    "public.document_assets",
    "public.site_document_slots",
    "public.knowledge_posts",
  ]);
  const other = new SQL(clone.url, { max: 1 });
  const results: RaceResult[] = [];
  const table = (kind: "site" | "primary") =>
    kind === "site" ? "site_document_slots" : "knowledge_posts";
  try {
    for (const isolation of ["read committed", "repeatable read", "serializable"] as const)
      for (const kind of ["site", "primary"] as const)
        for (const order of ["publication-first", "unpublish-first"] as const) {
          let asset = "",
            reference = "";
          const reached = latch(),
            release = latch(),
            waiterSnapshot = latch();
          let blockerTx: TransactionSQL | undefined;
          let blocker: Promise<unknown> | undefined,
            waiter:
              | Promise<{
                  outcome: string;
                  code?: string;
                  message?: string;
                  driverCode?: string;
                  errno?: string;
                }>
              | undefined;
          let waiterReady = false,
            waiterSetupError: unknown,
            blockerSetupError: unknown,
            pendingRejected: PromiseRejectedResult | undefined;
          try {
            await clone.sql.begin(async (tx) => {
              asset = await fixtureAsset(tx, true);
              reference = await fixtureReference(tx, kind, asset, false);
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
            ), "Race connection context mismatch");
            const blockerPid = String(contexts[0][0].pid),
              waiterPid = String(contexts[1][0].pid);
            require(blockerPid !== waiterPid, "Distinct race backends required");
            // Establish the waiter snapshot before the blocker changes publication.
            // For READ COMMITTED later statements receive their own snapshot.
            waiter = other
              .begin(async (tx) => {
                await tx.unsafe("set transaction isolation level " + isolation);
                await tx`set local lock_timeout='5s'`;
                await tx`set local statement_timeout='30s'`;
                const initial = await referenceState(tx, kind, asset, reference);
                require(initial.asset_published === true &&
                  initial.reference_published === false, "Race initial owning state absent");
                waiterReady = true;
                waiterSnapshot.resolve();
                await reached.promise;
                if (order === "publication-first")
                  await tx`update public.document_assets set is_published=false where id=${asset}::uuid`;
                else
                  await tx.unsafe(
                    `update public.${table(kind)} set is_published=true where id=$1::uuid`,
                    [reference],
                  );
                return { outcome: "COMMITTED" };
              })
              .catch((e) => {
                if (!waiterReady) {
                  waiterSetupError = e;
                  waiterSnapshot.resolve();
                }
                return {
                  outcome: "REFUSED",
                  code: code(e),
                  message: e instanceof Error ? e.message : String(e),
                  driverCode: e instanceof SQL.PostgresError ? e.code : undefined,
                  errno: e instanceof SQL.PostgresError ? e.errno : undefined,
                };
              });
            await waiterSnapshot.promise;
            if (waiterSetupError !== undefined) throw waiterSetupError;
            blocker = clone.sql
              .begin(async (tx) => {
                await tx.unsafe("set transaction isolation level " + isolation);
                await tx`set local lock_timeout='5s'`;
                await tx`set local statement_timeout='30s'`;
                blockerTx = tx;
                if (order === "publication-first")
                  await tx.unsafe(
                    `update public.${table(kind)} set is_published=true where id=$1::uuid`,
                    [reference],
                  );
                else
                  await tx`update public.document_assets set is_published=false where id=${asset}::uuid`;
                reached.resolve();
                await release.promise;
              })
              .catch((e) => {
                blockerSetupError = e;
                reached.resolve();
                throw e;
              });
            await reached.promise;
            if (blockerSetupError !== undefined) throw blockerSetupError;
            require(blockerTx !== undefined, "Missing actual blocker transaction");
            let observedBlocked = false;
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
              const blocked =
                await blockerTx`select ${blockerPid}::integer=any(pg_catalog.pg_blocking_pids(${waiterPid}::integer)) blocked`;
              if (blocked.length === 1 && blocked[0].blocked === true) {
                observedBlocked = true;
                break;
              }
              await delay();
            }
            require(observedBlocked, "Actual waiter was not observed blocked by owning transaction");
            release.resolve();
            await blocker;
            const actual = await waiter;
            const state = await clone.sql.begin((tx) => referenceState(tx, kind, asset, reference));
            const assetPublished = state.asset_published,
              referencePublished = state.reference_published;
            require(typeof assetPublished === "boolean" &&
              typeof referencePublished === "boolean", "Race final fixture state missing");
            const invariant = !referencePublished || assetPublished;
            const result: RaceResult = {
              reference: kind,
              isolation,
              order,
              blockerPid,
              waiterPid,
              observedBlocked,
              waiterOutcome: actual.outcome,
              code: actual.code,
              message: actual.message,
              driverCode: actual.driverCode,
              errno: actual.errno,
              assetPublished,
              referencePublished,
              invariant,
            };
            results.push(result);
            if (!invariant) {
              const e = Object.assign(new Error("ACTUAL_DOCUMENT_PUBLICATION_RACE_RED"), {
                code: "TASK13_RACE_RED",
                result,
                successfulPrefix: results,
              });
              throw e;
            }
            if (isolation === "read committed") {
              const expectedMessage =
                order === "publication-first"
                  ? "Unpublish public document references before unpublishing their PDF asset"
                  : kind === "site"
                    ? "Publish the PDF asset before publishing its site document slot"
                    : "Publish the PDF asset before publishing its knowledge post";
              require(actual.outcome === "REFUSED" &&
                actual.code === "23514" &&
                actual.message === expectedMessage, "READ COMMITTED owning guard refusal differs");
            } else
              require(actual.outcome === "REFUSED" &&
                ["23514", "40001", "40P01"].includes(
                  actual.code ?? "",
                ), "Unexpected RR/Serializable outcome");
          } finally {
            // Release barriers even after an assertion; retain natural server timeout
            // cleanup. Never terminate a backend or force-drop a database.
            reached.resolve();
            release.resolve();
            waiterSnapshot.resolve();
            const pending = await Promise.allSettled([
              ...(blocker ? [blocker] : []),
              ...(waiter ? [waiter] : []),
            ]);
            const rejected = pending.find((r) => r.status === "rejected");
            if (asset && reference)
              await clone.sql.begin(async (tx) => {
                await tx`set local lock_timeout='5s'`;
                await tx`set local statement_timeout='30s'`;
                await tx.unsafe(`delete from public.${table(kind)} where id=$1::uuid`, [reference]);
                await tx`delete from public.document_assets where id=${asset}::uuid`;
              });
            if (rejected?.status === "rejected") pendingRejected = rejected;
          }
          if (pendingRejected !== undefined) throw pendingRejected.reason;
        }
    const counts =
      await clone.sql`select (select count(*)::text from public.document_assets) assets,
      (select count(*)::text from public.site_document_slots) slots,(select count(*)::text from public.knowledge_posts) knowledge`;
    require(counts.length === 1 &&
      documentFixtureCountsEqual(clone, counts[0]), "Race fixture cleanup incomplete");
    return results;
  } catch (e) {
    throw Object.assign(new Error("Document race suite stopped at first actual failure"), {
      cause: e,
      successfulPrefix: [...results],
    });
  } finally {
    await other.close();
  }
}
