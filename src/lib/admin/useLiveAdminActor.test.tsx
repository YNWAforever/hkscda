import { beforeEach, expect, mock, test } from "bun:test";
import React from "react";
import * as realQuery from "@tanstack/react-query";
let value: string | null | undefined,
  cleanup: (() => void) | undefined,
  writes = 0;
mock.module("react", () => ({
  ...React,
  useState: () => [
    value,
    (next: string | null) => {
      value = next;
      writes++;
    },
  ],
  useEffect: (callback: () => () => void) => {
    cleanup = callback();
  },
}));
let cachedActor = "A",
  resets = 0,
  callback: (_event: string, session: { user: { id: string } } | null) => void,
  unsubscribed = 0;
const fakeClient = {
  getQueryData: () => ({ admin: { authUserId: cachedActor } }),
  resetQueries: async () => {
    resets++;
  },
};
let queryClient: typeof fakeClient | realQuery.QueryClient = fakeClient;
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => queryClient,
  queryOptions: (v: unknown) => v,
}));
let initial: Promise<{ data: { session: { user: { id: string } } | null } }>;
mock.module("../supabase", () => ({
  supabase: {
    auth: {
      getSession: () => initial,
      onAuthStateChange: (fn: typeof callback) => {
        callback = fn;
        return { data: { subscription: { unsubscribe: () => unsubscribed++ } } };
      },
    },
  },
}));
const { useLiveAdminActor } = await import("./useLiveAdminActor");
const flush = () => new Promise<void>((r) => setTimeout(r, 10));
beforeEach(() => {
  queryClient = fakeClient;
  value = undefined;
  cleanup = undefined;
  writes = 0;
  cachedActor = "A";
  resets = 0;
  unsubscribed = 0;
  initial = Promise.resolve({ data: { session: { user: { id: "A" } } } });
});
test("live account changes immediately invalidate visible actor and defer cached identity reset", async () => {
  useLiveAdminActor();
  await flush();
  expect(value).toBe("A");
  callback("SIGNED_IN", { user: { id: "B" } });
  expect(value).toBe("B");
  expect(resets).toBe(0);
  await flush();
  expect(resets).toBe(1);
  cleanup!();
  expect(unsubscribed).toBe(1);
});
test("an older initial session read cannot replace a newer auth event", async () => {
  let resolve!: (v: { data: { session: { user: { id: string } } } }) => void;
  initial = new Promise((r) => (resolve = r));
  useLiveAdminActor();
  callback("SIGNED_IN", { user: { id: "B" } });
  resolve({ data: { session: { user: { id: "A" } } } });
  await flush();
  expect(value).toBe("B");
  cleanup!();
});
test("same-actor refresh keeps identity cache; logout hides the actor", async () => {
  useLiveAdminActor();
  await flush();
  callback("TOKEN_REFRESHED", { user: { id: "A" } });
  await flush();
  expect(resets).toBe(0);
  callback("SIGNED_OUT", null);
  expect(value).toBeNull();
  await flush();
  expect(resets).toBe(1);
  cleanup!();
});
test("unmount cancels callbacks and deferred resets", async () => {
  useLiveAdminActor();
  await flush();
  callback("SIGNED_IN", { user: { id: "B" } });
  cleanup!();
  const before = writes;
  callback("SIGNED_IN", { user: { id: "C" } });
  await flush();
  expect(writes).toBe(before);
  expect(resets).toBe(0);
  expect(unsubscribed).toBe(1);
});

for (const refresh of [false, true])
  test(`a third actor cancels the prior identity read with empty cache (refresh=${refresh})`, async () => {
    const client = new realQuery.QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient = client;
    client.setQueryData(["admin-me"], { admin: { authUserId: "A" } });
    let finishB!: (value: { admin: { authUserId: string } }) => void;
    let reads = 0;
    const observer = new realQuery.QueryObserver(client, {
      queryKey: ["admin-me"],
      staleTime: Infinity,
      queryFn: () => {
        reads++;
        return reads === 1
          ? new Promise<{ admin: { authUserId: string } }>((resolve) => {
              finishB = resolve;
            })
          : Promise.resolve({ admin: { authUserId: "C" } });
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    useLiveAdminActor();
    await flush();
    callback("SIGNED_IN", { user: { id: "B" } });
    await flush();
    expect(client.getQueryData(["admin-me"])).toBeUndefined();
    callback("SIGNED_IN", { user: { id: "C" } });
    if (refresh) callback("TOKEN_REFRESHED", { user: { id: "C" } });
    await flush();
    finishB({ admin: { authUserId: "B" } });
    await flush();
    expect(value).toBe("C");
    expect(client.getQueryData<{ admin: { authUserId: string } }>(["admin-me"])).toEqual({
      admin: { authUserId: "C" },
    });
    expect(reads).toBe(2);
    cleanup!();
    unsubscribe();
    client.clear();
  });
