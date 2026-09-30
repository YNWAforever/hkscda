import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createRecoverySessionStorage,
  RecoverySessionUnavailableError,
  type RecoverySessionSnapshot,
} from "./supporters/recoverySession";

let browserSupabase: SupabaseClient | undefined;
let sessionStorage: ReturnType<typeof createRecoverySessionStorage> | undefined;

function requiredPublicEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY") {
  const value = import.meta.env[name] as string | undefined;
  if (!value) throw new Error(`Missing required public environment variable: ${name}`);
  return value;
}

export function getSupabaseClient() {
  if (!browserSupabase) {
    const url = requiredPublicEnv("VITE_SUPABASE_URL");
    const key = requiredPublicEnv("VITE_SUPABASE_ANON_KEY");
    let backing: Storage | undefined;
    try {
      if (typeof window !== "undefined") {
        const candidate = window.localStorage;
        const probe = "hkscda-storage-probe-" + crypto.randomUUID();
        candidate.setItem(probe, probe);
        candidate.removeItem(probe);
        backing = candidate;
      }
    } catch {
      /* Keep SDK fallback for unrelated auth. */
    }
    if (backing) {
      const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
      const coordinated = typeof navigator !== "undefined" && Boolean(navigator.locks);
      sessionStorage = createRecoverySessionStorage({
        backing,
        storageKey,
        coordinated,
        lock: async (_name, fn) => {
          if (!coordinated) return fn();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          try {
            return await navigator.locks.request(_name, { signal: controller.signal }, async () => {
              clearTimeout(timeout);
              return fn();
            });
          } finally {
            clearTimeout(timeout);
          }
        },
      });
      const client = createClient(url, key, {
        auth: {
          storageKey,
          storage: sessionStorage.adapter,
          ...(coordinated ? { lock: sessionStorage.authLock } : {}),
        },
        global: { fetch: sessionStorage.guardFetch(fetch.bind(globalThis)) },
      });
      const auth = coordinated ? sessionStorage.coordinateAuth(client.auth) : client.auth;
      browserSupabase = new Proxy(client, {
        get(target, name) {
          if (name === "auth") return auth;
          const value: unknown = Reflect.get(target, name, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    } else {
      browserSupabase = createClient(url, key);
    }
  }
  return browserSupabase;
}

export async function captureRecoverySessionAttempt(current: () => boolean) {
  getSupabaseClient();
  if (!sessionStorage) throw new RecoverySessionUnavailableError();
  return sessionStorage.capture(current);
}

export async function installRecoverySession(
  tokens: { access_token: string; refresh_token: string },
  current: () => boolean,
  snapshot: RecoverySessionSnapshot,
) {
  const client = getSupabaseClient();
  if (!sessionStorage) throw new RecoverySessionUnavailableError();
  const finish = await sessionStorage.prepare(tokens, current, snapshot);
  try {
    return await client.auth.setSession(tokens);
  } finally {
    finish();
  }
}

export async function signOutCurrentSession(expectedToken: string) {
  const client = getSupabaseClient();
  if (sessionStorage)
    return sessionStorage.protectLogout(expectedToken, () => client.auth.signOut());
  // Preserve ordinary SDK memory fallback; recovery cannot install sessions in this mode.
  const { data } = await client.auth.getSession();
  if (data.session?.access_token !== expectedToken) throw new RecoverySessionUnavailableError();
  return client.auth.signOut();
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
