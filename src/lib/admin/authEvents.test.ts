import { expect, test } from "bun:test";
import { createClient, type AuthChangeEvent, type Session } from "@supabase/supabase-js";
import { createSharedAdminAuthEvents } from "./authEvents";

function fixture(session: Session | null = null) {
  const storageKey = "isolated-auth-events-" + crypto.randomUUID();
  const values = new Map<string, string>();
  if (session) values.set(storageKey, JSON.stringify(session));
  let locks = 0;
  let networkRequests = 0;
  let queue = Promise.resolve();
  const blockNetwork = () => {
    networkRequests++;
    throw new Error("Unit Auth events must never perform a network request");
  };
  const blockedFetch = Object.assign(async () => blockNetwork(), { preconnect: blockNetwork });
  const client = createClient("http://127.0.0.1:1", "unit-only-key", {
    auth: {
      storageKey,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
        removeItem: (key) => void values.delete(key),
      },
      lock: async (_name, _timeout, operation) => {
        locks++;
        const previous = queue;
        let release!: () => void;
        queue = new Promise<void>((done) => {
          release = done;
        });
        // Web Locks grant asynchronously, even when currently uncontended.
        // An immediate fake grant masks the SDK's duplicate initial lock work.
        await previous;
        try {
          return await operation();
        } finally {
          release();
        }
      },
    },
    global: {
      fetch: blockedFetch,
    },
  });
  return {
    client,
    locks: () => locks,
    networkRequests: () => networkRequests,
    setStoredSession: (session: Session) => values.set(storageKey, JSON.stringify(session)),
  };
}

function session(id: string): Session {
  return {
    access_token: "unit-access-" + id,
    refresh_token: "unit-refresh-" + id,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id,
      aud: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-10-16T00:00:00Z",
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const sdkIdle = () => new Promise<void>((done) => setImmediate(done));

test("two shell listeners receive the SDK initial session with one actual SDK lock", async () => {
  const direct = fixture(session("actor-a"));
  await direct.client.auth.initialize();
  await sdkIdle();
  const directBefore = direct.locks();
  const rawInitial = deferred();
  let rawEvents = 0;
  const onRaw = (event: AuthChangeEvent) => {
    if (event === "INITIAL_SESSION" && ++rawEvents === 2) rawInitial.resolve();
  };
  const directA = direct.client.auth.onAuthStateChange(onRaw);
  const directB = direct.client.auth.onAuthStateChange(onRaw);
  await rawInitial.promise;
  expect(direct.locks() - directBefore).toBe(2);
  directA.data.subscription.unsubscribe();
  directB.data.subscription.unsubscribe();
  expect(direct.networkRequests()).toBe(0);
  const f = fixture(session("actor-a"));
  await f.client.auth.initialize();
  await sdkIdle();
  const before = f.locks();
  const subscribe = createSharedAdminAuthEvents(f.client.auth);
  const received: string[] = [];
  const complete = deferred();
  const listen = (name: string) => (event: AuthChangeEvent, current: Session | null) => {
    if (event !== "INITIAL_SESSION") return;
    received.push(name + ":" + current?.user.id);
    if (received.length === 2) complete.resolve();
  };
  const stopA = subscribe(listen("expiry"));
  const stopB = subscribe(listen("workspace"));
  await complete.promise;
  expect(received.sort()).toEqual(["expiry:actor-a", "workspace:actor-a"]);
  expect(f.locks() - before).toBe(1);
  stopA();
  stopB();
  expect(f.networkRequests()).toBe(0);
});

test("a late listener receives a fresh SDK initial read rather than an old session snapshot", async () => {
  const f = fixture(session("actor-a"));
  await f.client.auth.initialize();
  await sdkIdle();
  const subscribe = createSharedAdminAuthEvents(f.client.auth);
  const initialA = deferred();
  const stopA = subscribe((event, current) => {
    if (event === "INITIAL_SESSION") {
      expect(current?.user.id).toBe("actor-a");
      initialA.resolve();
    }
  });
  await initialA.promise;
  await sdkIdle();
  f.setStoredSession(session("actor-b"));
  const initialB = deferred();
  const before = f.locks();
  const stopB = subscribe((event, current) => {
    if (event === "INITIAL_SESSION") {
      expect(current?.user.id).toBe("actor-b");
      initialB.resolve();
    }
  });
  await initialB.promise;
  expect(f.locks() - before).toBe(1);
  stopA();
  stopB();
  expect(f.networkRequests()).toBe(0);
});

test("unsubscribing one listener retains real SDK sign-out events for the other", async () => {
  const f = fixture();
  await f.client.auth.initialize();
  await sdkIdle();
  const subscribe = createSharedAdminAuthEvents(f.client.auth);
  const first = deferred();
  const second = deferred();
  const eventsA: AuthChangeEvent[] = [];
  const eventsB: AuthChangeEvent[] = [];
  const stopA = subscribe((event) => {
    eventsA.push(event);
    if (event === "INITIAL_SESSION") first.resolve();
  });
  const stopB = subscribe((event) => {
    eventsB.push(event);
    if (event === "INITIAL_SESSION") second.resolve();
  });
  await Promise.all([first.promise, second.promise]);
  stopA();
  await f.client.auth.signOut({ scope: "local" });
  expect(eventsA).toEqual(["INITIAL_SESSION"]);
  expect(eventsB).toEqual(["INITIAL_SESSION", "SIGNED_OUT"]);
  stopB();
  expect(f.networkRequests()).toBe(0);
});

test("a new mount after complete unsubscribe gets the latest SDK session", async () => {
  const f = fixture(session("actor-a"));
  await f.client.auth.initialize();
  await sdkIdle();
  const subscribe = createSharedAdminAuthEvents(f.client.auth);
  const first = deferred();
  const oldEvents: string[] = [];
  const stop = subscribe((event, current) => {
    if (event === "INITIAL_SESSION") {
      oldEvents.push(current?.user.id ?? "signed-out");
      first.resolve();
    }
  });
  await first.promise;
  stop();
  f.setStoredSession(session("actor-b"));
  const next = deferred();
  const stopNext = subscribe((event, current) => {
    if (event === "INITIAL_SESSION") {
      expect(current?.user.id).toBe("actor-b");
      next.resolve();
    }
  });
  await next.promise;
  expect(oldEvents).toEqual(["actor-a"]);
  stopNext();
  expect(f.networkRequests()).toBe(0);
});

test("a failing initial listener cannot replace another listener's identity with null", async () => {
  const f = fixture(session("actor-a"));
  await f.client.auth.initialize();
  await sdkIdle();
  const errors: unknown[] = [];
  const subscribe = createSharedAdminAuthEvents(f.client.auth, (error) => errors.push(error));
  const fallback = deferred();
  const other = deferred();
  const seen: (string | null)[] = [];
  const stopA = subscribe((_event, current) => {
    if (current) throw new Error("consumer failed");
    fallback.resolve();
  });
  const stopB = subscribe((_event, current) => {
    seen.push(current?.user.id ?? null);
    other.resolve();
  });
  await Promise.all([fallback.promise, other.promise]);
  expect(errors).toHaveLength(1);
  expect(seen).toEqual(["actor-a"]);
  stopA();
  stopB();
  expect(f.networkRequests()).toBe(0);
});

test("cleanup while SDK initialization is pending cannot notify a later mount's old listener", async () => {
  const f = fixture(session("actor-a"));
  await f.client.auth.initialize();
  await sdkIdle();
  const subscribe = createSharedAdminAuthEvents(f.client.auth);
  const old: AuthChangeEvent[] = [];
  const stopOld = subscribe((event) => {
    old.push(event);
  });
  stopOld();
  f.setStoredSession(session("actor-b"));
  const next = deferred();
  const stopNext = subscribe((event, current) => {
    if (event === "INITIAL_SESSION") {
      expect(current?.user.id).toBe("actor-b");
      next.resolve();
    }
  });
  await next.promise;
  expect(old).toEqual([]);
  stopNext();
  expect(f.networkRequests()).toBe(0);
});
