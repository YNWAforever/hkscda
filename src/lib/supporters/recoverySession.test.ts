import { expect, test } from "bun:test";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { createRecoverySessionStorage, sameBrowserSession } from "./recoverySession";

const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const token = (
  sub: string,
  exp = Math.floor(Date.now() / 1000) + 3600,
  sessionId: string | undefined = "session-" + sub,
) =>
  `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub, exp, session_id: sessionId, aud: "authenticated", role: "authenticated" })}.synthetic-signature`;
function sharedStorage() {
  const data = new Map<string, string>();
  const queues = new Map<string, Promise<void>>();
  const backing: SupportedStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  async function lock<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const prior = queues.get(name) ?? Promise.resolve();
    let release!: () => void;
    queues.set(
      name,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    await prior;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  return { backing, lock, data };
}

function syntheticUser(sub: string) {
  return {
    id: sub,
    aud: "authenticated",
    email: sub + "@example.invalid",
    user_metadata: {},
    app_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
}

test("logout error visibility follows the same actor and session across token refresh", () => {
  expect(sameBrowserSession(token("a", 1), token("a", 2))).toBe(true);
  expect(sameBrowserSession(token("a"), token("b"))).toBe(false);
  expect(sameBrowserSession(token("a"), token("a", undefined, "new-session"))).toBe(false);
  expect(sameBrowserSession("opaque-a", "opaque-b")).toBe(false);
  expect(sameBrowserSession("", "")).toBe(false);
});

test.each(["setSession", "signInWithPassword", "verifyOtp"] as const)(
  "SDK logout cleanup and notification finish before %s installs another actor",
  async (method) => {
    const shared = sharedStorage();
    const key = "isolated-logout-notification";
    const storageA = createRecoverySessionStorage({
      ...shared,
      storageKey: key,
      coordinated: true,
    });
    const storageB = createRecoverySessionStorage({
      ...shared,
      storageKey: key,
      coordinated: true,
    });
    let release!: () => void, started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pause = false;
    const transport = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/logout")) return new Response(null, { status: 204 });
      if (String(input).includes("/token") || String(input).includes("/verify"))
        return Response.json({
          access_token: token("b"),
          refresh_token: "synthetic-b",
          token_type: "bearer",
          expires_in: 3600,
          user: syntheticUser("b"),
        });
      const bearer = new Headers(init?.headers).get("authorization")!;
      return Response.json(
        syntheticUser(JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString()).sub),
      );
    };
    const make = (storage: typeof storageA, main: boolean) =>
      createClient("http://127.0.0.1:1", "synthetic-anon", {
        auth: {
          storageKey: key,
          storage: main
            ? {
                ...storage.adapter,
                removeItem: async (name) => {
                  await storage.adapter.removeItem!(name);
                  if (pause && name === key) {
                    started();
                    await held;
                  }
                },
              }
            : storage.adapter,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          lock: storage.authLock,
        },
        global: { fetch: storage.guardFetch(transport) },
      });
    const a = make(storageA, true),
      b = make(storageB, false);
    const authB = storageB.coordinateAuth?.(b.auth) ?? b.auth;
    const originalA = token("a");
    await a.auth.setSession({ access_token: originalA, refresh_token: "synthetic-a" });
    await b.auth.getSession();
    const events: string[] = [];
    a.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") events.push("out-a");
    });
    b.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user.id === "b") events.push("in-b");
    });
    pause = true;
    const logout = storageA.protectLogout(originalA, () => a.auth.signOut({ scope: "local" }));
    await began;
    let installed = false;
    const login = (
      method === "setSession"
        ? authB.setSession({ access_token: token("b"), refresh_token: "synthetic-b" })
        : method === "signInWithPassword"
          ? authB.signInWithPassword({ email: "b@example.invalid", password: "synthetic-only" })
          : authB.verifyOtp({ email: "b@example.invalid", token: "synthetic-only", type: "email" })
    ).then((result) => {
      installed = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const completedBeforeLogoutNotification = installed;
    release();
    expect((await logout).error).toBeNull();
    expect((await login).error).toBeNull();
    expect(completedBeforeLogoutNotification).toBe(false);
    expect(events).toEqual(["out-a", "in-b"]);
    expect((await b.auth.getSession()).data.session?.user.id).toBe("b");
  },
);

test("protected logout permits the SDK to refresh the same session before revoking it", async () => {
  const shared = sharedStorage();
  const key = "isolated-logout-refresh";
  const storage = createRecoverySessionStorage({ ...shared, storageKey: key, coordinated: true });
  const original = token("a", Math.floor(Date.now() / 1000) + 30),
    fresh = token("a");
  let refreshes = 0,
    logouts = 0;
  const client = createClient("http://127.0.0.1:1", "synthetic-anon", {
    auth: {
      storageKey: key,
      storage: storage.adapter,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      lock: storage.authLock,
    },
    global: {
      fetch: storage.guardFetch(async (input, init) => {
        if (String(input).includes("/token")) {
          refreshes++;
          return Response.json({
            access_token: fresh,
            refresh_token: "synthetic-a2",
            token_type: "bearer",
            expires_in: 3600,
            user: syntheticUser("a"),
          });
        }
        if (String(input).includes("/logout")) {
          logouts++;
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer " + fresh);
          return new Response(null, { status: 204 });
        }
        return Response.json(syntheticUser("a"));
      }),
    },
  });
  await client.auth.getSession();
  await client.auth.setSession({ access_token: original, refresh_token: "synthetic-a" });
  const result = await storage.protectLogout(original, () =>
    client.auth.signOut({ scope: "local" }),
  );
  expect(result.error).toBeNull();
  expect(refreshes).toBe(1);
  expect(logouts).toBe(1);
  expect((await client.auth.getSession()).data.session).toBeNull();
  await client.auth.stopAutoRefresh();
});

test.each(["user", "subject", "session", "missing-session", "empty-session", "storage-changed"])(
  "logout refresh refuses a response with changed %s",
  async (variant) => {
    const shared = sharedStorage(),
      key = "isolated-invalid-refresh-" + variant;
    const original = token("a");
    const storage = createRecoverySessionStorage({ ...shared, storageKey: key, coordinated: true });
    await storage.adapter.setItem(
      key,
      JSON.stringify({
        access_token: original,
        refresh_token: "synthetic-a",
        user: syntheticUser("a"),
      }),
    );
    const refreshed =
      variant === "subject"
        ? token("b")
        : variant === "session"
          ? token("a", undefined, "other-session")
          : variant === "missing-session"
            ? `${encode({ alg: "HS256" })}.${encode({ sub: "a", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`
            : variant === "empty-session"
              ? token("a", undefined, "")
              : token("a");
    const transport = storage.guardFetch(async () => {
      if (variant === "storage-changed")
        await storage.adapter.setItem(
          key,
          JSON.stringify({ access_token: token("b"), user: syntheticUser("b") }),
        );
      return Response.json({
        access_token: refreshed,
        refresh_token: "synthetic-a2",
        user: syntheticUser(variant === "user" ? "b" : "a"),
      });
    });
    const response = await storage.protectLogout(original, () =>
      transport("http://127.0.0.1:1/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: "synthetic-a" }),
      }),
    );
    expect(response.status).toBe(503);
    expect(JSON.parse(shared.data.get(key)!).user.id).toBe(
      variant === "storage-changed" ? "b" : "a",
    );
  },
);
async function newerActorSurvives(terminalError = false) {
  const shared = sharedStorage();
  const a = token("a"),
    b = token("b");
  const key = "isolated-recovery-session";
  let releaseA!: () => void, startedA!: () => void;
  const started = new Promise<void>((resolve) => {
    startedA = resolve;
  });
  const held = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  const storageA = createRecoverySessionStorage({ ...shared, storageKey: key, coordinated: true });
  const storageB = createRecoverySessionStorage({ ...shared, storageKey: key, coordinated: true });
  const transport = async (_url: RequestInfo | URL, init?: RequestInit) => {
    const sub = new Headers(init?.headers).get("authorization") === "Bearer " + a ? "a" : "b";
    if (sub === "a") {
      startedA();
      await held;
      if (terminalError)
        return Response.json(
          { error_code: "session_not_found", msg: "Synthetic revoked session" },
          { status: 403 },
        );
    }
    return Response.json({
      id: sub,
      aud: "authenticated",
      role: "authenticated",
      email: sub + "@example.invalid",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      user_metadata: {},
      app_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    });
  };
  const client = (storage: ReturnType<typeof createRecoverySessionStorage>) =>
    createClient("http://127.0.0.1:1", "synthetic-anon", {
      auth: {
        persistSession: true,
        storageKey: key,
        storage: storage.adapter,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: storage.guardFetch(transport) },
    });
  const ca = client(storageA),
    cb = client(storageB);
  await ca.auth.getSession();
  await cb.auth.getSession();
  const events: string[] = [];
  ca.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") events.push(session!.user.id);
  });
  const finish = await storageA.prepare(
    { access_token: a, refresh_token: "synthetic-a" },
    () => true,
    await storageA.capture(() => true),
  );
  const pending = ca.auth.setSession({ access_token: a, refresh_token: "synthetic-a" });
  await started;
  expect(
    (await cb.auth.setSession({ access_token: b, refresh_token: "synthetic-b" })).error,
  ).toBeNull();
  releaseA();
  if (terminalError) expect((await pending).error).not.toBeNull();
  else await expect(pending).rejects.toThrow("Stale recovery session");
  finish();
  expect((await ca.auth.getSession()).data.session?.user.id).toBe("b");
  expect(events).toEqual([]);
}
test("real SDK cannot commit stale recovery after another client stores a new actor, even before its auth event arrives", () =>
  newerActorSurvives());
test("revoked recovery identity lookup cannot clear another client's new actor", () =>
  newerActorSurvives(true));
test("expired-token refresh is refused during recovery installation before calling the provider", async () => {
  const shared = sharedStorage();
  let providerCalls = 0;
  const storage = createRecoverySessionStorage({
    ...shared,
    storageKey: "isolated-expiry",
    coordinated: true,
    now: () => 0,
  });
  const expired = token("a", 10000);
  const c = createClient("http://127.0.0.1:1", "synthetic-anon", {
    auth: {
      persistSession: true,
      storageKey: "isolated-expiry",
      storage: storage.adapter,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: storage.guardFetch(async () => {
        providerCalls++;
        throw new Error("Must not call provider");
      }),
    },
  });
  await c.auth.getSession();
  const finish = await storage.prepare(
    { access_token: expired, refresh_token: "synthetic-a" },
    () => true,
    await storage.capture(() => true),
  );
  await storage.adapter.setItem(
    "isolated-expiry",
    JSON.stringify({
      access_token: token("b"),
      refresh_token: "synthetic-b",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "b" },
    }),
  );
  const result = await c.auth.setSession({ access_token: expired, refresh_token: "synthetic-a" });
  finish();
  expect(result.error).not.toBeNull();
  expect(providerCalls).toBe(0);
  expect((await c.auth.getSession()).data.session?.user.id).toBe("b");
}, 30000);
test("logout revision fences recovery even when the backing session was already empty", async () => {
  const shared = sharedStorage();
  const storage = createRecoverySessionStorage({
    ...shared,
    storageKey: "isolated-empty",
    coordinated: true,
  });
  const a = token("a");
  const finish = await storage.prepare(
    { access_token: a, refresh_token: "synthetic-a" },
    () => true,
    await storage.capture(() => true),
  );
  await storage.adapter.removeItem("isolated-empty");
  await expect(
    storage.adapter.setItem("isolated-empty", JSON.stringify({ access_token: a })),
  ).rejects.toThrow("Stale recovery session");
  finish();
  expect(shared.data.has("isolated-empty")).toBe(false);
});

test("a new actor written during the recovery HTTP wait cannot become its accepted baseline", async () => {
  const shared = sharedStorage();
  const key = "isolated-http-wait";
  const storage = createRecoverySessionStorage({ ...shared, storageKey: key, coordinated: true });
  const snapshot = await storage.capture(() => true);
  const b = JSON.stringify({ access_token: token("b"), refresh_token: "synthetic-b" });
  await storage.adapter.setItem(key, b);
  await expect(
    storage.prepare(
      { access_token: token("a"), refresh_token: "synthetic-a" },
      () => true,
      snapshot,
    ),
  ).rejects.toThrow("Stale recovery session");
  expect(shared.data.get(key)).toBe(b);
});
test("uncoordinated storage and expired sessions cannot begin recovery installation", async () => {
  const shared = sharedStorage();
  const plain = createRecoverySessionStorage({
    ...shared,
    storageKey: "isolated-unavailable",
    coordinated: false,
  });
  await expect(plain.capture(() => true)).rejects.toThrow();
  const guarded = createRecoverySessionStorage({
    ...shared,
    storageKey: "isolated-expired",
    coordinated: true,
  });
  await expect(
    guarded.prepare(
      { access_token: token("a", 1), refresh_token: "synthetic-a" },
      () => true,
      await guarded.capture(() => true),
    ),
  ).rejects.toThrow();
});

test("recovery preserves a PKCE verifier owned by another login flow", async () => {
  const shared = sharedStorage();
  const key = "isolated-pkce";
  shared.data.set(key + "-code-verifier", "other-flow-verifier");
  const storage = createRecoverySessionStorage({ ...shared, storageKey: key, coordinated: true });
  const finish = await storage.prepare(
    { access_token: token("a"), refresh_token: "synthetic-a" },
    () => true,
    await storage.capture(() => true),
  );
  await storage.adapter.removeItem(key + "-code-verifier");
  expect(shared.data.get(key + "-code-verifier")).toBe("other-flow-verifier");
  finish();
  await storage.adapter.removeItem(key + "-code-verifier");
  expect(shared.data.has(key + "-code-verifier")).toBe(false);
});

test("failed revision write does not persist a recovery session", async () => {
  const shared = sharedStorage();
  const key = "isolated-storage-failure";
  let unavailable = false;
  const backing = {
    ...shared.backing,
    setItem: (name: string, value: string) => {
      if (unavailable && name.endsWith("-hkscda-revision"))
        throw new Error("synthetic storage unavailable");
      return shared.backing.setItem(name, value);
    },
  };
  const storage = createRecoverySessionStorage({
    ...shared,
    backing,
    storageKey: key,
    coordinated: true,
  });
  const access_token = token("a");
  const finish = await storage.prepare(
    { access_token, refresh_token: "synthetic-a" },
    () => true,
    await storage.capture(() => true),
  );
  unavailable = true;
  await expect(storage.adapter.setItem(key, JSON.stringify({ access_token }))).rejects.toThrow(
    "synthetic storage unavailable",
  );
  finish();
  expect(shared.data.has(key)).toBe(false);
});

test("storage becoming unwritable cannot retain credentials on logout or revive a pending empty-session recovery", async () => {
  const shared = sharedStorage();
  const key = "isolated-runtime-quota";
  let unwritable = false;
  const backing = {
    ...shared.backing,
    setItem: (name: string, value: string) => {
      if (unwritable) throw new Error("Synthetic runtime quota");
      return shared.backing.setItem(name, value);
    },
  };
  const storage = createRecoverySessionStorage({
    ...shared,
    backing,
    storageKey: key,
    coordinated: true,
  });
  const snapshot = await storage.capture(() => true);
  unwritable = true;
  await storage.adapter.removeItem(key);
  unwritable = false;
  await expect(
    storage.prepare(
      { access_token: token("a"), refresh_token: "synthetic-a" },
      () => true,
      snapshot,
    ),
  ).rejects.toThrow("Stale recovery session");
  await storage.adapter.setItem(key, JSON.stringify({ access_token: token("b") }));
  unwritable = true;
  await storage.adapter.removeItem(key);
  expect(shared.data.has(key)).toBe(false);
});

test("late successful logout for actor A cannot remove actor B or emit its signed-out event", async () => {
  const shared = sharedStorage();
  const key = "isolated-late-logout";
  const storage = createRecoverySessionStorage({ ...shared, storageKey: key, coordinated: true });
  let release!: () => void, started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/logout")) {
      started();
      await held;
      return new Response(null, { status: 204 });
    }
    const authorization = new Headers(init?.headers).get("authorization")!;
    const sub = JSON.parse(Buffer.from(authorization.split(".")[1], "base64url").toString()).sub;
    return Response.json({
      id: sub,
      aud: "authenticated",
      email: sub + "@example.invalid",
      user_metadata: {},
      app_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    });
  };
  const client = createClient("http://127.0.0.1:1", "synthetic-anon", {
    auth: {
      storageKey: key,
      storage: storage.adapter,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: storage.guardFetch(transport) },
  });
  const a = token("a");
  await client.auth.setSession({ access_token: a, refresh_token: "synthetic-a" });
  const events: string[] = [];
  client.auth.onAuthStateChange((event) => {
    events.push(event);
  });
  const pending = storage.protectLogout(a, () => client.auth.signOut({ scope: "local" }));
  await began;
  await client.auth.setSession({ access_token: token("b"), refresh_token: "synthetic-b" });
  release();
  await expect(pending).rejects.toThrow("Stale recovery session");
  expect((await client.auth.getSession()).data.session?.user.id).toBe("b");
  expect(events.includes("SIGNED_OUT")).toBe(false);
});

test("logout does not send a newer actor's bearer when identity changes before SDK session read", async () => {
  const shared = sharedStorage();
  const key = "isolated-before-logout";
  let logoutRequests = 0;
  const storage = createRecoverySessionStorage({ ...shared, storageKey: key, coordinated: true });
  const client = createClient("http://127.0.0.1:1", "synthetic-anon", {
    auth: {
      storageKey: key,
      storage: storage.adapter,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: storage.guardFetch(async (input, init) => {
        if (String(input).includes("/logout")) {
          logoutRequests++;
          return new Response(null, { status: 204 });
        }
        const bearer = new Headers(init?.headers).get("authorization")!;
        const sub = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString()).sub;
        return Response.json({
          id: sub,
          aud: "authenticated",
          email: sub + "@example.invalid",
          user_metadata: {},
          app_metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        });
      }),
    },
  });
  const a = token("a");
  await client.auth.setSession({ access_token: a, refresh_token: "synthetic-a" });
  const result = await storage.protectLogout(a, async () => {
    await client.auth.setSession({ access_token: token("b"), refresh_token: "synthetic-b" });
    return client.auth.signOut({ scope: "local" });
  });
  expect(result.error).not.toBeNull();
  expect(logoutRequests).toBe(0);
  expect((await client.auth.getSession()).data.session?.user.id).toBe("b");
});
