import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DocumentCiTestTarget } from "./helpers/documentGuardTestTarget";
import { documentGuardBusiness } from "./helpers/documentGuardBusiness";
import { documentGuardRaces } from "./helpers/documentGuardRaces";
import { documentPublicationFenceTests } from "./helpers/documentPublicationFenceTests";
import { documentAnnualPublicationRace } from "./helpers/documentAnnualPublicationRace";
import { documentPublicationFenceNoOp } from "./helpers/documentPublicationFenceNoOp";

const enabled = process.env.R01_DOCUMENT_PUBLICATION_ALLOW_LOCAL_FIXTURES === "1";
/** Existing RLS CI explicitly enables this fixed 55322 synthetic fixture gate.
 * The current migrated baseline already contains strengthening; restoration is
 * never resubmitted here. Ordinary unit runs do not query any database.
 */
test.skipIf(!enabled)(
  "document publication: actual permissions, audit, races and strengthening no-op",
  async () => {
    const target = await DocumentCiTestTarget.open();
    let before: Awaited<ReturnType<DocumentCiTestTarget["seedSnapshot"]>> | undefined;
    let failure: unknown;
    try {
      before = await target.seedSnapshot();
      const fence = await readFile(
        resolve(import.meta.dir, "../migrations/20261006023123_r01_document_publication_fence.sql"),
        "utf8",
      );
      const noOp = await documentPublicationFenceNoOp(target, fence);
      expect(noOp.namedRawEqual).toBe(true);
      const permissions = await documentPublicationFenceTests(target);
      expect(permissions.results).toHaveLength(17);
      expect(permissions.outerRollbackVerified).toBe(true);
      expect(permissions.privateFenceRowsRemainZero).toBe(true);
      const business = await documentGuardBusiness(target);
      expect(business).toHaveLength(26);
      const races = await documentGuardRaces(target);
      expect(races).toHaveLength(12);
      for (const race of races) {
        expect(race.observedBlocked).toBe(true);
        expect(race.invariant).toBe(true);
      }
      const annual = [];
      for (const kind of ["unpublish", "kind-change"] as const) {
        const result = await documentAnnualPublicationRace(target, kind);
        expect(result.observedBlocked).toBe(true);
        expect(result.invariant).toBe(true);
        annual.push(result);
      }
      expect(annual).toHaveLength(2);
    } catch (e) {
      failure = e;
    } finally {
      try {
        if (before) expect(await target.seedSnapshot()).toEqual(before);
      } catch (e) {
        failure =
          failure === undefined
            ? e
            : new AggregateError(
                [failure, e],
                "Owning failure and committed seed preservation failure",
              );
      } finally {
        try {
          await target.close();
        } catch (e) {
          failure =
            failure === undefined
              ? e
              : new AggregateError([failure, e], "Owning failure and connection cleanup failure");
        }
      }
    }
    if (failure !== undefined) throw failure;
  },
  120000,
);
