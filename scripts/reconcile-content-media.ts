import { readFileSync } from "node:fs";
import { z } from "zod";
const objectRef = z.object({ bucket: z.string().min(1), path: z.string().min(1) });
const inventorySchema = z.object({
  objects: z.array(objectRef.extend({ createdAt: z.string().datetime() })),
  revisionObjects: z.array(objectRef),
  publicationObjects: z.array(objectRef),
  sessions: z.array(objectRef.extend({ expiresAt: z.string().datetime(), finalized: z.boolean() })),
  legacyInternalPublicCount: z.number().int().nonnegative(),
});
export function summarizeContentMediaReconciliation(raw: unknown, now = new Date()) {
  const inventory = inventorySchema.parse(raw);
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  const key = (ref: { bucket: string; path: string }) => JSON.stringify([ref.bucket, ref.path]);
  const protectedPaths = new Set(
    [
      ...inventory.revisionObjects,
      ...inventory.publicationObjects,
      ...inventory.sessions.filter(
        (session) => !session.finalized && Date.parse(session.expiresAt) > now.getTime(),
      ),
    ].map(key),
  );
  const candidates = inventory.objects.filter(
    (object) => Date.parse(object.createdAt) < cutoff && !protectedPaths.has(key(object)),
  );
  return {
    mode: "dry-run",
    objectsInspected: inventory.objects.length,
    orphanCandidates: candidates.length,
    protectedObjects: inventory.objects.length - candidates.length,
    expiredIncompleteSessions: inventory.sessions.filter(
      (session) => !session.finalized && Date.parse(session.expiresAt) < cutoff,
    ).length,
    legacyInternalPublicCount: inventory.legacyInternalPublicCount,
  };
}
if (import.meta.main) {
  if (process.argv.includes("--apply"))
    throw new Error(
      "This count-only command does not modify objects; applying cleanup requires a separately approved remediation operation",
    );
  const index = process.argv.indexOf("--inventory");
  if (index < 0 || !process.argv[index + 1])
    throw new Error(
      "Usage: bun scripts/reconcile-content-media.ts --inventory <authorized-inventory.json> [--dry-run]",
    );
  const inventory: unknown = JSON.parse(readFileSync(process.argv[index + 1], "utf8"));
  console.log(JSON.stringify(summarizeContentMediaReconciliation(inventory), null, 2));
}
