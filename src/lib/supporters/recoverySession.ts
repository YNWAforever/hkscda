import type { SupportedStorage } from "@supabase/supabase-js";

type Tokens = { access_token: string; refresh_token: string };
type SessionFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type RecoverySessionSnapshot = { revision: string; session: string | null };
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
  const revisionKey = deps.storageKey + "-hkscda-revision";
  const now = deps.now ?? Date.now;
  const serialized = <T>(fn: () => Promise<T>) =>
    deps.lock("hkscda-auth-storage:" + deps.storageKey, fn);
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
        } else {
          await deps.backing.setItem(key, value);
        }
      }),
    removeItem: (key) =>
      serialized(async () => {
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
        }
      }),
  };
  return {
    adapter,
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
        }
        const response = await transport(input, init);
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
