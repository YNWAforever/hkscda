import { expect, test } from "bun:test";
import {
  runLocalContentMediaReconciliation,
  validateLocalMaintenanceTarget,
} from "./content-media-reconciliation-local";

const local = {
  apply: true,
  localMaintenance: true,
  apiUrl: "http://127.0.0.1:55321",
  dbUrl: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
};

test("local maintenance requires the exact disposable loopback stack and explicit opt-in", () => {
  expect(() => validateLocalMaintenanceTarget({ ...local, localMaintenance: false })).toThrow(
    "local-maintenance",
  );
  expect(() =>
    validateLocalMaintenanceTarget({ ...local, apiUrl: "https://project.supabase.co" }),
  ).toThrow("local API");
  expect(() =>
    validateLocalMaintenanceTarget({ ...local, dbUrl: "postgresql://postgres@db:5432/postgres" }),
  ).toThrow("local database");
  expect(validateLocalMaintenanceTarget(local)).toEqual(local);
});

test("fresh local dry-run reports counts without removing objects", async () => {
  let removed = false;
  const result = await runLocalContentMediaReconciliation(
    { ...local, apply: false },
    {
      now: new Date("2026-09-06T00:00:00Z"),
      withLockedInventory: (operation) =>
        operation({
          objects: [
            {
              bucket: "content-media-private",
              path: "orphan.png",
              createdAt: "2026-09-01T00:00:00Z",
            },
          ],
          mediaObjects: [],
          revisionObjects: [],
          publicationObjects: [],
          sessions: [],
          legacyInternalPublicCount: 0,
        }),
      remove: async () => {
        removed = true;
      },
    },
  );
  expect(result).toMatchObject({ mode: "dry-run", orphanCandidates: 1 });
  expect(removed).toBe(false);
});
test("fresh locked reconciliation removes only old unreferenced objects", async () => {
  const events: string[] = [];
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const result = await runLocalContentMediaReconciliation(local, {
    now: new Date("2026-09-06T00:00:00Z"),
    withLockedInventory: async (operation) => {
      events.push("locked");
      const value = await operation({
        objects: [
          {
            bucket: "content-media-private",
            path: "orphan.png",
            createdAt: "2026-09-01T00:00:00Z",
          },
          {
            bucket: "content-media-private",
            path: "current.png",
            createdAt: "2026-09-01T00:00:00Z",
          },
          { bucket: "content-media", path: "revision.png", createdAt: "2026-09-01T00:00:00Z" },
          { bucket: "content-media", path: "finalized.png", createdAt: "2026-09-01T00:00:00Z" },
          {
            bucket: "content-media-private",
            path: "recent.png",
            createdAt: "2026-09-05T12:00:01Z",
          },
        ],
        mediaObjects: [{ bucket: "content-media-private", path: "current.png" }],
        revisionObjects: [{ bucket: "content-media", path: "revision.png" }],
        publicationObjects: [],
        sessions: [
          {
            bucket: "content-media",
            path: "finalized.png",
            expiresAt: "2026-09-01T00:00:00Z",
            finalized: true,
          },
        ],
        legacyInternalPublicCount: 0,
      });
      events.push("unlock");
      return value;
    },
    remove: async (bucket, paths) => {
      events.push("remove");
      removed.push({ bucket, paths });
    },
  });
  expect(events).toEqual(["locked", "remove", "unlock"]);
  expect(removed).toEqual([{ bucket: "content-media-private", paths: ["orphan.png"] }]);
  expect(result).toEqual({ mode: "local-apply", objectsInspected: 5, deleted: 1 });
});

test("refuses more than 100 candidates before calling Storage remove", async () => {
  let removed = false;
  await expect(
    runLocalContentMediaReconciliation(local, {
      now: new Date("2026-09-06T00:00:00Z"),
      withLockedInventory: (operation) =>
        operation({
          objects: Array.from({ length: 101 }, (_, index) => ({
            bucket: "content-media-private",
            path: `orphan-${index}.png`,
            createdAt: "2026-09-01T00:00:00Z",
          })),
          mediaObjects: [],
          revisionObjects: [],
          publicationObjects: [],
          sessions: [],
          legacyInternalPublicCount: 0,
        }),
      remove: async () => {
        removed = true;
      },
    }),
  ).rejects.toThrow("100");
  expect(removed).toBe(false);
});
