import { beforeEach, expect, mock, test } from "bun:test";
import React from "react";
import * as realQuery from "@tanstack/react-query";

import type { AdminSessionTokenSet } from "./sessionMemory";

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

const sessionA: AdminSessionTokenSet = {
  accessToken: "token-a",
  expiresAt: Date.now() + 3_600_000,
  authUserId: "A",
};
const sessionB: AdminSessionTokenSet = { ...sessionA, accessToken: "token-b", authUserId: "B" };

let session: AdminSessionTokenSet | null = null;
const listeners = new Set<() => void>();
function setSession(next: AdminSessionTokenSet | null) {
  session = next;
  for (const listener of listeners) listener();
}

let bootstrapResolve: (value: AdminSessionTokenSet | null) => void = () => {};
let bootstrap = () =>
  new Promise<AdminSessionTokenSet | null>((resolve) => {
    bootstrapResolve = resolve;
  });

mock.module("./sessionMemory", () => ({
  adminSessionSnapshot: () => session,
  subscribeAdminSession: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  bootstrapAdminSession: () => bootstrap(),
  // Imported by session.ts, which identity.ts pulls in for the real query options.
  ensureAdminSession: async () => {
    if (!session) throw new Error("not signed in");
    return session;
  },
  refreshAdminSession: async () => {
    if (!session) throw new Error("not signed in");
    return session;
  },
  clearAdminSession: () => {
    session = null;
  },
  logoutAdminSession: async () => {
    session = null;
  },
}));

let cachedActor = "A",
  resets = 0,
  removals = 0;
const fakeClient = {
  getQueryData: () => ({ admin: { authUserId: cachedActor } }),
  removeQueries: async () => {
    removals++;
  },
  resetQueries: async () => {
    resets++;
  },
};
let queryClient: typeof fakeClient | realQuery.QueryClient = fakeClient;
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => queryClient,
  queryOptions: (options: unknown) => options,
}));

const { useLiveAdminActor } = await import("./useLiveAdminActor");
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

beforeEach(() => {
  queryClient = fakeClient;
  value = undefined;
  cleanup = undefined;
  writes = 0;
  session = null;
  listeners.clear();
  cachedActor = "A";
  resets = 0;
  removals = 0;
  bootstrap = () =>
    new Promise<AdminSessionTokenSet | null>((resolve) => {
      bootstrapResolve = resolve;
    });
});

test("a page-load bootstrap shows the in-memory session account", async () => {
  session = sessionA;
  useLiveAdminActor();
  bootstrapResolve(sessionA);
  await flush();
  expect(value).toBe("A");
  cleanup!();
});

test("a session change to another account updates the actor and defers the cache clear", async () => {
  session = sessionA;
  useLiveAdminActor();
  bootstrapResolve(sessionA);
  await flush();
  expect(value).toBe("A");

  setSession(sessionB);
  expect(value).toBe("B");
  expect(resets).toBe(0);
  await flush();
  expect(resets).toBe(1);
  expect(removals).toBe(1);
  cleanup!();
});

test("a page load with no refreshable session leaves the actor null", async () => {
  session = null;
  // No identity cached from a previous account, so there is nothing to switch away from.
  cachedActor = "";
  useLiveAdminActor();
  bootstrapResolve(null);
  await flush();
  expect(value).toBeNull();
  expect(resets).toBe(0);
  cleanup!();
});

test("a sign-in that beats the bootstrap is not clobbered when the bootstrap settles", async () => {
  session = null;
  useLiveAdminActor();
  setSession(sessionB);
  expect(value).toBe("B");
  bootstrapResolve(null);
  await flush();
  expect(value).toBe("B");
  cleanup!();
});

test("unmount stops store notifications and cancels deferred resets", async () => {
  session = sessionA;
  useLiveAdminActor();
  bootstrapResolve(sessionA);
  await flush();
  setSession(sessionB);
  cleanup!();
  const before = writes;
  setSession(null);
  await flush();
  expect(writes).toBe(before);
  expect(resets).toBe(0);
});

test("AUTH-04: an account switch removes every non-identity cached query", async () => {
  const client = new realQuery.QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient = client;
  session = sessionA;
  client.setQueryData(["supporters"], [{ name: "Previous admin's supporter" }]);
  client.setQueryData(["admin-me"], { admin: { authUserId: "A" } });
  useLiveAdminActor();
  bootstrapResolve(sessionA);
  await flush();

  setSession(sessionB);
  await flush();

  expect(client.getQueryData(["supporters"])).toBeUndefined();
  cleanup!();
  client.clear();
});
