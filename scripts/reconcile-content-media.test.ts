import { expect, test } from "bun:test";
import { summarizeContentMediaReconciliation } from "./reconcile-content-media";
test("reconciliation retains revision references, active sessions, public copies and recent objects", () => {
  const old = "2026-09-01T00:00:00Z";
  const counts = summarizeContentMediaReconciliation(
    {
      objects: [
        { bucket: "private", path: "revision", createdAt: old },
        { bucket: "private", path: "session", createdAt: old },
        { bucket: "public", path: "prepared", createdAt: old },
        { bucket: "private", path: "recent", createdAt: "2026-09-05T23:00:00Z" },
        { bucket: "private", path: "orphan", createdAt: old },
      ],
      revisionObjects: [{ bucket: "private", path: "revision" }],
      publicationObjects: [{ bucket: "public", path: "prepared" }],
      sessions: [
        { bucket: "private", path: "session", expiresAt: "2026-09-07T00:00:00Z", finalized: false },
      ],
      legacyInternalPublicCount: 3,
    },
    new Date("2026-09-06T00:00:00Z"),
  );
  expect(counts.orphanCandidates).toBe(1);
  expect(counts.protectedObjects).toBe(4);
  expect(counts.legacyInternalPublicCount).toBe(3);
  expect(JSON.stringify(counts)).not.toContain("revision");
});
