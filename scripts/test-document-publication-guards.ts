/** Explicit isolated integration gate. No production credentials, .env fallback,
 * provider composition, saved receipt dependency or reachability-based skip. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  captureModernLocalSchema,
  createProductionClone,
} from "../supabase/rls-tests/helpers/productionSchemaClone";
import { applyDocumentGuards } from "../supabase/rls-tests/helpers/documentGuardApplication";
import { documentGuardBusiness } from "../supabase/rls-tests/helpers/documentGuardBusiness";
import { documentGuardRaces } from "../supabase/rls-tests/helpers/documentGuardRaces";
import { documentPublicationFenceTests } from "../supabase/rls-tests/helpers/documentPublicationFenceTests";
import { documentAnnualPublicationRace } from "../supabase/rls-tests/helpers/documentAnnualPublicationRace";
import { documentPublicationFenceNoOp } from "../supabase/rls-tests/helpers/documentPublicationFenceNoOp";

const mode = process.argv[2];
if (process.argv.length !== 3 || !["--modern-local", "--strengthened-local"].includes(mode ?? ""))
  throw Error(
    "Explicit local baseline mode required: read-only 57322 source, newly owned 52322 clone",
  );
const root = resolve(import.meta.dir, "..");
const restoration = await readFile(
  resolve(root, "supabase/migrations/20261003075753_r01_document_publication_guards_forward.sql"),
  "utf8",
);
const fence = await readFile(
  resolve(root, "supabase/migrations/20261006023123_r01_document_publication_fence.sql"),
  "utf8",
);
let clone: Awaited<ReturnType<typeof createProductionClone>> | undefined;
try {
  // Existing guarded factory captures schema only, checks parity/zero rows and
  // creates a fresh UUID database; it never writes to the local source or template.
  clone = await createProductionClone(await captureModernLocalSchema());
  // The current committed CI/source baseline may already include strengthening.
  // In that mode restoration is deliberately NOT submitted over changed bodies.
  const restored =
    mode === "--modern-local"
      ? await applyDocumentGuards(clone, restoration, "modern")
      : { submitted: false, baseline: "already-strengthened" };
  await clone.sql.begin(async (tx) => {
    await tx`set local lock_timeout='5s'`;
    await tx`set local statement_timeout='30s'`;
    await tx`set local role postgres`;
    await tx.unsafe(fence);
  });
  // Restoration intentionally precedes strengthening and is never reapplied to
  // the changed guard bodies. This separate second fence application is tested.
  const noOp = await documentPublicationFenceNoOp(clone, fence);
  const permissions = await documentPublicationFenceTests(clone);
  if (
    permissions.results.length !== 17 ||
    !permissions.outerRollbackVerified ||
    !permissions.privateFenceRowsRemainZero
  )
    throw Error("Incomplete actual permission/rollback/FK evidence");
  const business = await documentGuardBusiness(clone);
  if (business.length !== 26) throw Error("Incomplete document business suite");
  const races = await documentGuardRaces(clone);
  if (races.length !== 12) throw Error("Incomplete site/knowledge race matrix");
  const annual = [];
  for (const target of ["unpublish", "kind-change"] as const)
    annual.push(await documentAnnualPublicationRace(clone, target));
  console.log(
    JSON.stringify({
      restoration: restored,
      strengtheningNoOp: noOp,
      permissions: permissions.results.length,
      business: business.length,
      races: races.length,
      annual: annual.length,
    }),
  );
} finally {
  if (clone) {
    await clone.close();
    if (!clone.templatePreserved) throw Error("Clone template changed during document acceptance");
  }
}
