import { expect, test } from "bun:test";

import {
  withdrawContentPublicationMedia,
  type ContentPublicationMediaWithdrawalPort,
  type WithdrawnContentMedia,
} from "./publicationMediaWithdrawal.server";

// BUG-72: public copies a story no longer uses are deleted from content-media and marked removed.
const LEASE_MS = 15 * 60 * 1000;
const revision = {
  current: "11111111-1111-4111-8111-111111111111",
  superseded: "22222222-2222-4222-8222-222222222222",
};
const media = "33333333-3333-4333-8333-333333333333";

type Asset = {
  id: string;
  revisionId: string;
  publicPath: string;
  withdrawnAt: Date | null;
  removedAt: Date | null;
  claimedAt: Date | null;
  leaseToken: string | null;
};

/**
 * In-memory stand-in for content_public_asset + the content-media bucket. claim() follows
 * claim_withdrawn_content_public_assets: withdrawn, not removed, not leased (or lease expired),
 * and never a copy of the item's current published revision.
 */
function fakeStore(clock: () => Date, assets: Asset[], publishedRevisionId = revision.current) {
  const objects = new Set(assets.map((asset) => asset.publicPath));
  const removedPaths: string[] = [];
  let failNextRemove = 0;
  let leases = 0;
  const port: ContentPublicationMediaWithdrawalPort = {
    async claim(limit) {
      const due = assets.filter(
        (asset) =>
          asset.withdrawnAt !== null &&
          asset.removedAt === null &&
          asset.revisionId !== publishedRevisionId &&
          (asset.claimedAt === null || clock().getTime() - asset.claimedAt.getTime() > LEASE_MS),
      );
      return due.slice(0, limit).map((asset): WithdrawnContentMedia => {
        asset.claimedAt = clock();
        asset.leaseToken = `lease-${++leases}`;
        return {
          id: asset.id,
          publicBucket: "content-media",
          publicPath: asset.publicPath,
          leaseToken: asset.leaseToken,
        };
      });
    },
    async remove(row) {
      if (failNextRemove > 0) {
        failNextRemove -= 1;
        throw new Error("Storage unavailable");
      }
      removedPaths.push(row.publicPath);
      // Like Supabase Storage, removing a missing object is not an error.
      objects.delete(row.publicPath);
    },
    async markRemoved(row) {
      const asset = assets.find((candidate) => candidate.id === row.id);
      if (!asset || asset.removedAt || asset.leaseToken !== row.leaseToken) return false;
      asset.removedAt = clock();
      asset.claimedAt = null;
      asset.leaseToken = null;
      return true;
    },
  };
  return {
    port,
    objects,
    removedPaths,
    failRemoves(count: number) {
      failNextRemove = count;
    },
  };
}

function asset(id: string, revisionId: string, withdrawn: boolean): Asset {
  return {
    id,
    revisionId,
    publicPath: `published/${revisionId}/${media.slice(0, -1)}${id.slice(-1)}.jpg`,
    withdrawnAt: withdrawn ? new Date("2026-11-05T00:00:00Z") : null,
    removedAt: null,
    claimedAt: null,
    leaseToken: null,
  };
}

const quiet = { error: () => {} };

test("BUG-72: deletes withdrawn public copies and marks them removed", async () => {
  const clock = () => new Date("2026-11-05T19:45:00Z");
  const assets = [
    asset("aaaaaaaa-0000-4000-8000-000000000001", revision.superseded, true),
    asset("aaaaaaaa-0000-4000-8000-000000000002", revision.superseded, true),
  ];
  const store = fakeStore(clock, assets);

  expect(await withdrawContentPublicationMedia(store.port, quiet, { now: clock })).toEqual({
    removed: 2,
    failed: 0,
  });
  expect(store.objects.size).toBe(0);
  expect(store.removedPaths).toHaveLength(2);
  expect(assets.map((row) => row.removedAt?.toISOString())).toEqual([
    "2026-11-05T19:45:00.000Z",
    "2026-11-05T19:45:00.000Z",
  ]);
});

test("BUG-72: never deletes a copy the current published revision uses", async () => {
  const clock = () => new Date("2026-11-05T19:45:00Z");
  const current = asset("bbbbbbbb-0000-4000-8000-000000000001", revision.current, false);
  // Even a current copy wrongly marked withdrawn is never claimed (the SQL claim re-checks).
  const currentMarked = asset("bbbbbbbb-0000-4000-8000-000000000002", revision.current, true);
  const superseded = asset("bbbbbbbb-0000-4000-8000-000000000003", revision.superseded, true);
  const store = fakeStore(clock, [current, currentMarked, superseded]);

  expect(await withdrawContentPublicationMedia(store.port, quiet, { now: clock })).toEqual({
    removed: 1,
    failed: 0,
  });
  expect(store.removedPaths).toEqual([superseded.publicPath]);
  expect(store.objects.has(current.publicPath)).toBe(true);
  expect(store.objects.has(currentMarked.publicPath)).toBe(true);
});

test("BUG-72: refuses to delete anything outside published/<revision>/<media>.<ext>", async () => {
  const removed: string[] = [];
  const rows: WithdrawnContentMedia[] = [
    {
      id: "cccccccc-0000-4000-8000-000000000001",
      publicBucket: "content-media",
      publicPath: "published/../site-logo.png",
      leaseToken: "lease",
    },
    {
      id: "cccccccc-0000-4000-8000-000000000002",
      publicBucket: "content-media",
      publicPath: "stories/legacy-cover.jpg",
      leaseToken: "lease",
    },
  ];
  const port: ContentPublicationMediaWithdrawalPort = {
    claim: async () => rows.splice(0, 1),
    remove: async (row) => {
      removed.push(row.publicPath);
    },
    markRemoved: async () => true,
  };
  expect(await withdrawContentPublicationMedia(port, quiet)).toEqual({ removed: 0, failed: 2 });
  expect(removed).toEqual([]);
});

test("BUG-72: a storage failure leaves the row for the next run, which removes it", async () => {
  let now = new Date("2026-11-05T19:45:00Z");
  const clock = () => now;
  const row = asset("dddddddd-0000-4000-8000-000000000001", revision.superseded, true);
  const store = fakeStore(clock, [row]);
  store.failRemoves(1);
  const errors: unknown[] = [];

  expect(
    await withdrawContentPublicationMedia(
      store.port,
      { error: (...args: unknown[]) => errors.push(args) },
      { now: clock },
    ),
  ).toEqual({ removed: 0, failed: 1 });
  expect(row.removedAt).toBeNull();
  expect(store.objects.has(row.publicPath)).toBe(true);
  expect(errors).toHaveLength(1);

  // The next daily run, after the lease has expired, retries and succeeds.
  now = new Date("2026-11-06T19:45:00Z");
  expect(await withdrawContentPublicationMedia(store.port, quiet, { now: clock })).toEqual({
    removed: 1,
    failed: 0,
  });
  expect(row.removedAt?.toISOString()).toBe("2026-11-06T19:45:00.000Z");
  expect(store.objects.has(row.publicPath)).toBe(false);
});

test("BUG-72: withdrawal is idempotent: reruns and already-missing objects are no-ops", async () => {
  let now = new Date("2026-11-05T19:45:00Z");
  const clock = () => now;
  const row = asset("eeeeeeee-0000-4000-8000-000000000001", revision.superseded, true);
  const store = fakeStore(clock, [row]);
  // The object is already gone (for example a previous run deleted it but failed to ack).
  store.objects.delete(row.publicPath);

  expect(await withdrawContentPublicationMedia(store.port, quiet, { now: clock })).toEqual({
    removed: 1,
    failed: 0,
  });
  now = new Date("2026-11-06T19:45:00Z");
  expect(await withdrawContentPublicationMedia(store.port, quiet, { now: clock })).toEqual({
    removed: 0,
    failed: 0,
  });
  expect(store.removedPaths).toEqual([row.publicPath]);
});

test("BUG-72: a lost lease is reported and never counted as removed", async () => {
  const port: ContentPublicationMediaWithdrawalPort = {
    claim: (() => {
      const rows: WithdrawnContentMedia[] = [
        {
          id: "ffffffff-0000-4000-8000-000000000001",
          publicBucket: "content-media",
          publicPath: `published/${revision.superseded}/${media}.webp`,
          leaseToken: "lease",
        },
      ];
      return async () => rows.splice(0, 1);
    })(),
    remove: async () => {},
    markRemoved: async () => false,
  };
  const errors: unknown[] = [];
  expect(
    await withdrawContentPublicationMedia(port, { error: (...args) => errors.push(args) }),
  ).toEqual({ removed: 0, failed: 1 });
  expect(errors).toHaveLength(1);
});

test("BUG-72: stops at the item limit and the injected-clock time budget", async () => {
  let tick = 0;
  const start = new Date("2026-11-05T19:45:00Z").getTime();
  // Each call to now() advances 10 seconds.
  const clock = () => new Date(start + tick++ * 10_000);
  let claims = 0;
  const port: ContentPublicationMediaWithdrawalPort = {
    claim: async () => {
      claims += 1;
      return [
        {
          id: "99999999-0000-4000-8000-000000000001",
          publicBucket: "content-media",
          publicPath: `published/${revision.superseded}/${media}.png`,
          leaseToken: `lease-${claims}`,
        },
      ];
    },
    remove: async () => {},
    markRemoved: async () => true,
  };
  const timed = await withdrawContentPublicationMedia(port, quiet, {
    now: clock,
    timeBudgetMs: 25_000,
  });
  expect(timed.removed).toBeLessThan(5);
  claims = 0;
  const limited = await withdrawContentPublicationMedia(port, quiet, { maxItems: 3 });
  expect(limited).toEqual({ removed: 3, failed: 0 });
  expect(claims).toBe(3);
});
