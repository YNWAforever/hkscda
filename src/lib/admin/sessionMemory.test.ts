import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  adminSessionSnapshot,
  adminSessionUsable,
  bootstrapAdminSession,
  clearAdminSession,
  clearLegacyAdminTokenStorage,
  ensureAdminSession,
  loginAdminSession,
  logoutAdminSession,
  refreshAdminSession,
  setAdminSession,
  subscribeAdminSessionCleared,
  type AdminSessionTokenSet,
} from "./sessionMemory";

const tokens: AdminSessionTokenSet = {
  accessToken: "access-1",
  expiresAt: Date.now() + 3_600_000,
  authUserId: "auth-a",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function responseBody(overrides: Partial<AdminSessionTokenSet> = {}) {
  const merged = { ...tokens, ...overrides };
  return {
    accessToken: merged.accessToken,
    expiresAt: merged.expiresAt,
    authUserId: merged.authUserId,
  };
}

type StorageSpy = Storage & { written: string[] };

function storageSpy(initial: Record<string, string> = {}): StorageSpy {
  const data = new Map(Object.entries(initial));
  const written: string[] = [];
  return {
    get written() {
      return written;
    },
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => data.delete(key),
    setItem: (key: string, value: string) => {
      written.push(key);
      data.set(key, value);
    },
  } as StorageSpy;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  clearAdminSession();
  globalThis.fetch = mock(async () => json(responseBody())) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("admin session memory store", () => {
  test("login keeps the access token only in memory", async () => {
    const spy = storageSpy();
    (globalThis as { localStorage?: Storage }).localStorage = spy;

    await loginAdminSession("admin@example.com", "secret");

    expect(adminSessionSnapshot()?.accessToken).toBe("access-1");
    expect(spy.written).toEqual([]);
    expect(spy.getItem("sb-test-auth-token")).toBeNull();
  });

  test("bootstrap refreshes once when the tab has no token, then reuses it", async () => {
    const session = await bootstrapAdminSession();
    expect(session?.authUserId).toBe("auth-a");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/admin/session/refresh",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );

    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect((await ensureAdminSession()).accessToken).toBe("access-1");
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
      calls,
    );
  });

  test("a token close to expiry is refreshed before use", async () => {
    setAdminSession({ ...tokens, expiresAt: Date.now() + 1_000 });
    await ensureAdminSession();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("concurrent callers share one refresh request", async () => {
    const [first, second] = await Promise.all([ensureAdminSession(), ensureAdminSession()]);
    expect(first.accessToken).toBe("access-1");
    expect(second.accessToken).toBe("access-1");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("a failed refresh clears the session and notifies cleared listeners", async () => {
    let cleared = 0;
    const unsubscribe = subscribeAdminSessionCleared(() => {
      cleared++;
    });
    setAdminSession(tokens);
    globalThis.fetch = mock(async () => json({ error: "no" }, 401)) as unknown as typeof fetch;

    const error = await refreshAdminSession().catch((caught: unknown) => caught);

    expect(error).toMatchObject({ reason: "invalid_credentials" });
    expect(adminSessionSnapshot()).toBeNull();
    expect(cleared).toBe(1);
    unsubscribe();
  });

  test("a rate-limited login is reported as such", async () => {
    globalThis.fetch = mock(async () =>
      json({ error: "slow down" }, 429),
    ) as unknown as typeof fetch;
    const error = await loginAdminSession("admin@example.com", "secret").catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ reason: "rate_limited" });
  });

  test("logout clears memory and the legacy sb-* web-storage entries", async () => {
    const spy = storageSpy({
      "sb-test-auth-token": '{"access_token":"old"}',
      "sb-other-auth-token": "{}",
      "unrelated-key": "keep",
    });
    (globalThis as { window?: { localStorage: Storage } }).window = { localStorage: spy };
    setAdminSession(tokens);

    await logoutAdminSession();

    expect(adminSessionSnapshot()).toBeNull();
    expect(spy.written).toEqual([]);
    expect(spy.getItem("sb-test-auth-token")).toBeNull();
    expect(spy.getItem("sb-other-auth-token")).toBeNull();
    expect(spy.getItem("unrelated-key")).toBe("keep");
  });

  test("legacy cleanup tolerates unavailable storage", () => {
    (globalThis as { window?: { localStorage: Storage } }).window = {
      localStorage: {
        get length(): number {
          throw new Error("denied");
        },
      } as unknown as Storage,
    };
    expect(() => clearLegacyAdminTokenStorage()).not.toThrow();
  });

  test("adminSessionUsable treats an expired token as absent", () => {
    setAdminSession({ ...tokens, expiresAt: Date.now() - 1 });
    expect(adminSessionUsable()).toBeNull();
    expect(adminSessionSnapshot()?.accessToken).toBe("access-1");
  });
});
