import { expect, test } from "bun:test";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { createRecoverySessionStorage } from "./recoverySession";

const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const token = (sub: string, exp = Math.floor(Date.now() / 1000) + 3600) =>
  `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub, exp, aud: "authenticated", role: "authenticated" })}.synthetic-signature`;
function sharedStorage() {
  const data = new Map<string, string>();
  let queued = Promise.resolve();
  const backing: SupportedStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  async function lock<T>(_name: string, fn: () => Promise<T>): Promise<T> {
    const prior = queued;
    let release!: () => void;
    queued = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  return { backing, lock, data };
}
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
