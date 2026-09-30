import type { SupportedStorage, SupabaseClient } from "@supabase/supabase-js";

type Tokens = { access_token: string; refresh_token: string };
type SessionFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type RecoverySessionSnapshot = { revision: string; session: string | null };
// Browser UI fencing only; server authorization always validates the bearer with Auth.
export function sameBrowserSession(previous: string, current: string) {
  if (!previous || !current) return false;
  if (previous === current) return true;
  try {
    const read = (token: string): unknown =>
      JSON.parse(atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")));
    const a = read(previous),
      b = read(current);
    return Boolean(
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      "sub" in a &&
      "sub" in b &&
      typeof a.sub === "string" &&
      a.sub === b.sub &&
      "session_id" in a &&
      "session_id" in b &&
      typeof a.session_id === "string" &&
      a.session_id &&
      a.session_id === b.session_id,
    );
  } catch {
    return false;
  }
}
type Guard = {
  current: () => boolean;
  revision: string | null;
  session: string | null;
  refresh: string;
  expires: number;
};

export class StaleRecoverySessionError extends Error {
  constructor() {
    super("Stale recovery session");
  }
}
export class RecoverySessionUnavailableError extends Error {
  constructor() {
    super("Recovery session installation unavailable");
  }
}

export function createRecoverySessionStorage(deps: {
  backing: SupportedStorage;
  storageKey: string;
  coordinated: boolean;
  lock: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  now?: () => number;
}) {
  const guards = new Map<string, Guard>();
  type Logout = {
    revision: string | null;
    session: string | null;
    token: string;
    refresh: string | undefined;
    subject: string;
    sessionId: string | null;
    refreshed?: Tokens;
  };
  let logout: Logout | undefined;
  const revisionKey = deps.storageKey + "-hkscda-revision";
  const now = deps.now ?? Date.now;
  const serialized = <T>(fn: () => Promise<T>) =>
    deps.lock("hkscda-auth-storage:" + deps.storageKey, fn);
  const authLock = <T>(name: string, _acquireTimeout: number, operation: () => Promise<T>) =>
    deps.lock("hkscda-auth-operation:" + name, operation);
  const identity = (token: string) => {
    const value: unknown = JSON.parse(
      atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
    );
    if (!value || typeof value !== "object" || !("sub" in value) || typeof value.sub !== "string")
      throw new RecoverySessionUnavailableError();
    return {
      subject: value.sub,
      sessionId:
        "session_id" in value && typeof value.session_id === "string" ? value.session_id : null,
    };
  };
  const expiration = (token: string): number => {
    try {
      const value: unknown = JSON.parse(
        atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
      );
      if (
        !value ||
        typeof value !== "object" ||
        !("exp" in value) ||
        typeof value.exp !== "number" ||
        !Number.isFinite(value.exp)
      )
        throw new Error();
      return value.exp * 1000;
    } catch {
      throw new RecoverySessionUnavailableError();
    }
  };
  const adapter: SupportedStorage = {
    getItem: (key) => deps.backing.getItem(key),
    setItem: (key, value) =>
      serialized(async () => {
        if (key === deps.storageKey) {
          const incoming: unknown = JSON.parse(value);
          const token =
            incoming &&
            typeof incoming === "object" &&
            "access_token" in incoming &&
            typeof incoming.access_token === "string"
              ? incoming.access_token
              : "";
          const guard = guards.get(token);
          const refreshed = logout?.refreshed;
          const rebasing = Boolean(
            refreshed &&
            token === refreshed.access_token &&
            incoming &&
            typeof incoming === "object" &&
            "refresh_token" in incoming &&
            incoming.refresh_token === refreshed.refresh_token,
          );
          if (
            rebasing &&
            logout &&
            ((await deps.backing.getItem(revisionKey)) !== logout.revision ||
              (await deps.backing.getItem(key)) !== logout.session)
          )
            throw new StaleRecoverySessionError();
          if (
            guard &&
            (!guard.current() ||
              guard.expires <= now() ||
              (await deps.backing.getItem(revisionKey)) !== guard.revision ||
              (await deps.backing.getItem(key)) !== guard.session)
          )
            throw new StaleRecoverySessionError();
          await deps.backing.setItem(revisionKey, crypto.randomUUID());
          await deps.backing.setItem(key, value);
          if (rebasing && logout && refreshed) {
            logout.token = token;
            logout.refresh = refreshed.refresh_token;
            logout.session = value;
            logout.revision = await deps.backing.getItem(revisionKey);
            logout.refreshed = undefined;
          }
        } else {
          await deps.backing.setItem(key, value);
        }
      }),
    removeItem: (key) =>
      serialized(async () => {
        if (
          key === deps.storageKey &&
          logout &&
          ((await deps.backing.getItem(revisionKey)) !== logout.revision ||
            (await deps.backing.getItem(key)) !== logout.session)
        )
          throw new StaleRecoverySessionError();
        // Recovery uses implicit sessions and owns no PKCE verifier. Preserve another flow's verifier.
        if (key === deps.storageKey + "-code-verifier" && guards.size > 0) return;
        await deps.backing.removeItem(key);
        if (key === deps.storageKey) {
          try {
            await deps.backing.setItem(revisionKey, crypto.randomUUID());
          } catch {
            // Every captured attempt has a persistent revision. Removing it invalidates even
            // an empty-session logout, while quota failure must never retain credentials.
            await deps.backing.removeItem(revisionKey);
          }
          if (logout) {
            logout.session = null;
            logout.revision = await deps.backing.getItem(revisionKey);
          }
        }
      }),
  };
  return {
    adapter,
    // The supported SDK lock covers the whole operation, including storage cleanup and
    // subscriber/broadcast notification. Its namespace differs from short storage commits.
    authLock,
    coordinateAuth(auth: SupabaseClient["auth"]) {
      // In pinned auth-js 2.108.1 these public writers bypass its custom lock.
      // Wrap the public API; retain the original client and its internal SDK state.
      const writers = new Set([
        "signInAnonymously",
        "signUp",
        "signInWithPassword",
        "signInWithWeb3",
        "signInWithIdToken",
        "verifyOtp",
        "signInWithPasskey",
        "linkIdentity",
      ]);
      const methods = new Map<string | symbol, unknown>();
      return new Proxy(auth, {
        get(target, name) {
          const value: unknown = Reflect.get(target, name, target);
          if (typeof value !== "function") return value;
          if (!methods.has(name)) {
            methods.set(
              name,
              typeof name === "string" && writers.has(name)
                ? async (...args: unknown[]) => {
                    // Initialization itself uses the SDK lock; settle it before acquiring ours.
                    await target.initialize();
                    return authLock("lock:" + deps.storageKey, 5000, () =>
                      Reflect.apply(value, target, args),
                    );
                  }
                : value.bind(target),
            );
          }
          return methods.get(name);
        },
      });
    },
    async protectLogout<T>(token: string, operation: () => Promise<T>): Promise<T> {
      const snapshot = await serialized(async () => {
        if (logout) throw new RecoverySessionUnavailableError();
        const session = await deps.backing.getItem(deps.storageKey);
        let stored: unknown;
        try {
          stored = session === null ? null : JSON.parse(session);
        } catch {
          throw new StaleRecoverySessionError();
        }
        if (
          !stored ||
          typeof stored !== "object" ||
          !("access_token" in stored) ||
          stored.access_token !== token
        )
          throw new StaleRecoverySessionError();
        const snapshot: Logout = {
          token,
          session,
          revision: await deps.backing.getItem(revisionKey),
          refresh:
            "refresh_token" in stored && typeof stored.refresh_token === "string"
              ? stored.refresh_token
              : undefined,
          ...identity(token),
        };
        logout = snapshot;
        return snapshot;
      });
      try {
        return await operation();
      } finally {
        if (logout === snapshot) logout = undefined;
      }
    },
    async capture(current: () => boolean): Promise<RecoverySessionSnapshot> {
      if (!deps.coordinated) throw new RecoverySessionUnavailableError();
      return serialized(async () => {
        if (!current()) throw new StaleRecoverySessionError();
        const session = await deps.backing.getItem(deps.storageKey);
        if (session !== null) throw new StaleRecoverySessionError();
        let revision = await deps.backing.getItem(revisionKey);
        if (revision === null) {
          revision = crypto.randomUUID();
          await deps.backing.setItem(revisionKey, revision);
        }
        return { revision, session };
      });
    },
    async prepare(
      tokens: Tokens,
      current: () => boolean,
      snapshot: RecoverySessionSnapshot,
    ): Promise<() => void> {
      if (!deps.coordinated || !tokens.refresh_token) throw new RecoverySessionUnavailableError();
      const expires = expiration(tokens.access_token);
      if (expires <= now() || !current()) throw new StaleRecoverySessionError();
      return serialized(async () => {
        if (
          expires <= now() ||
          !current() ||
          (await deps.backing.getItem(revisionKey)) !== snapshot.revision ||
          (await deps.backing.getItem(deps.storageKey)) !== snapshot.session
        )
          throw new StaleRecoverySessionError();
        const guard = {
          current,
          expires,
          refresh: tokens.refresh_token,
          ...snapshot,
        };
        guards.set(tokens.access_token, guard);
        return () => {
          if (guards.get(tokens.access_token) === guard) guards.delete(tokens.access_token);
        };
      });
    },
    guardFetch(transport: SessionFetch) {
      const guarded: SessionFetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        let refreshingLogout: Logout | undefined;
        if (url.pathname.endsWith("/auth/v1/logout") && logout) {
          const bearer = new Headers(
            init?.headers ?? (input instanceof Request ? input.headers : undefined),
          )
            .get("authorization")
            ?.replace(/^Bearer /i, "");
          const valid = await serialized(
            async () =>
              logout &&
              bearer === logout.token &&
              (await deps.backing.getItem(revisionKey)) === logout.revision &&
              (await deps.backing.getItem(deps.storageKey)) === logout.session,
          );
          if (!valid) return Response.json({ msg: "Session changed" }, { status: 503 });
        }
        if (
          url.pathname.endsWith("/auth/v1/token") &&
          url.searchParams.get("grant_type") === "refresh_token"
        ) {
          const body =
            typeof init?.body === "string"
              ? init.body
              : input instanceof Request
                ? await input.clone().text()
                : "";
          let refresh: unknown;
          try {
            refresh = (JSON.parse(body) as { refresh_token?: unknown }).refresh_token;
          } catch {
            /* Provider validates unrelated requests. */
          }
          if ([...guards.values()].some((guard) => guard.refresh === refresh)) {
            // Never let an expired recovery installation mint an unguarded replacement token.
            return Response.json(
              { msg: "Recovery session installation unavailable" },
              // The SDK removes the current actor for terminal Auth errors. A local retryable
              // refusal preserves it; every bounded retry remains local and cannot mint tokens.
              { status: 503 },
            );
          }
          if (logout && refresh === logout.refresh) {
            refreshingLogout = await serialized(async () => {
              if (
                !logout ||
                (await deps.backing.getItem(revisionKey)) !== logout.revision ||
                (await deps.backing.getItem(deps.storageKey)) !== logout.session
              )
                return undefined;
              return logout;
            });
            if (!refreshingLogout)
              return Response.json({ msg: "Session changed" }, { status: 503 });
          }
        }
        const response = await transport(input, init);
        if (response.ok && refreshingLogout) {
          try {
            const result: unknown = await response.clone().json();
            if (
              !result ||
              typeof result !== "object" ||
              !("access_token" in result) ||
              typeof result.access_token !== "string" ||
              !("refresh_token" in result) ||
              typeof result.refresh_token !== "string" ||
              !result.refresh_token ||
              !("user" in result) ||
              !result.user ||
              typeof result.user !== "object" ||
              !("id" in result.user) ||
              result.user.id !== refreshingLogout.subject
            )
              throw new StaleRecoverySessionError();
            const next = identity(result.access_token);
            if (
              !refreshingLogout.sessionId ||
              next.subject !== refreshingLogout.subject ||
              next.sessionId !== refreshingLogout.sessionId
            )
              throw new StaleRecoverySessionError();
            const refreshed = {
              access_token: result.access_token,
              refresh_token: result.refresh_token,
            };
            await serialized(async () => {
              if (
                logout !== refreshingLogout ||
                (await deps.backing.getItem(revisionKey)) !== refreshingLogout.revision ||
                (await deps.backing.getItem(deps.storageKey)) !== refreshingLogout.session
              )
                throw new StaleRecoverySessionError();
              refreshingLogout.refreshed = refreshed;
            });
          } catch {
            return Response.json({ msg: "Session changed" }, { status: 503 });
          }
        }
        if (!response.ok && url.pathname.endsWith("/auth/v1/user")) {
          const bearer = new Headers(
            init?.headers ?? (input instanceof Request ? input.headers : undefined),
          )
            .get("authorization")
            ?.replace(/^Bearer /i, "");
          if (bearer && guards.has(bearer)) {
            // A terminal error for this incoming token must not remove a different cached actor.
            // Return a verification refusal without the SDK's session-wide cleanup error code.
            return Response.json(
              { msg: "Recovery session verification failed", error_code: "invalid_token" },
              { status: 401 },
            );
          }
        }
        return response;
      };
      // Preserve runtime fetch helpers (including Bun's preconnect) without changing transport.
      return Object.assign(guarded, globalThis.fetch);
    },
  };
}
