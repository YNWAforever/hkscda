import type { QueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { isAdminAuthPath, loginUrlFor } from "../../lib/admin/loginRedirect";
import { supabase } from "../../lib/supabase";
import { isLapsedSession } from "./failureClass";

export type SessionExpiryDeps = {
  queryClient: QueryClient;
  /** Moves to a URL inside the app. */
  navigate: (url: string) => void;
  /** The current path plus search, read when an expiry is seen. */
  getPath: () => string;
  /** Subscribes to Supabase auth events and returns the unsubscribe. */
  onAuthStateChange: (listener: (event: string) => void) => () => void;
};

export type SessionExpiryWatcher = {
  /** Call before a deliberate sign-out, so it does not carry a `redirect` back here. */
  suppress: () => void;
  stop: () => void;
};

function onAuthPage(path: string): boolean {
  return isAdminAuthPath(path.split(/[?#]/, 1)[0]);
}

/** The part of the router `expiryNavigate` uses. */
export type ExpiryRouter = {
  navigate: (options: { href: string; ignoreBlocker: boolean }) => Promise<void>;
};

/**
 * The `navigate` for `watchSessionExpiry`. It passes every navigation blocker: a lapsed session
 * cannot save, so a dirty form's "Discard and leave" dialog must not hold staff on a page whose
 * data has just been cleared. Without a router it falls back to a full page load.
 */
export function expiryNavigate(
  router: ExpiryRouter | null | undefined,
  assign: (url: string) => void = (url) => window.location.assign(url),
): (url: string) => void {
  return (url) => {
    if (router) void router.navigate({ href: url, ignoreBlocker: true });
    else assign(url);
  };
}

/**
 * Sends staff to sign-in, with the page they were on as `redirect`, when the session lapses:
 * a query or mutation fails with a session error or a 401, or Supabase reports SIGNED_OUT.
 * Navigates at most once however many failures arrive, and never from a sign-in page.
 */
export function watchSessionExpiry(deps: SessionExpiryDeps): SessionExpiryWatcher {
  let done = false;

  function expire() {
    if (done) return;
    const path = deps.getPath();
    if (onAuthPage(path)) return;
    done = true;
    const target = loginUrlFor(path);
    // The next person to sign in on this tab must not see the last one's cached data.
    deps.queryClient.clear();
    deps.navigate(target);
  }

  const stopQueries = deps.queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") {
      if (isLapsedSession(event.action.error)) expire();
    }
  });
  const stopMutations = deps.queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") {
      if (isLapsedSession(event.action.error)) expire();
    }
  });
  const stopAuth = deps.onAuthStateChange((authEvent) => {
    if (authEvent === "SIGNED_OUT") expire();
  });

  return {
    suppress: () => {
      done = true;
    },
    stop: () => {
      stopQueries();
      stopMutations();
      stopAuth();
    },
  };
}

function subscribeToSupabaseAuth(listener: (event: string) => void) {
  const { data } = supabase.auth.onAuthStateChange((event) => listener(event));
  return () => data.subscription.unsubscribe();
}

/**
 * Mounts `watchSessionExpiry` for the admin shell. Returns `suppress`, to call just before
 * the user signs out on purpose.
 */
export function useSessionExpiryRedirect(
  queryClient: QueryClient,
  onAuthStateChange: SessionExpiryDeps["onAuthStateChange"] = subscribeToSupabaseAuth,
): () => void {
  const router = useRouter({ warn: false });
  const watcherRef = useRef<SessionExpiryWatcher | null>(null);

  useEffect(() => {
    const watcher = watchSessionExpiry({
      queryClient,
      navigate: expiryNavigate(router),
      getPath: () => window.location.pathname + window.location.search,
      onAuthStateChange,
    });
    watcherRef.current = watcher;
    return () => {
      watcher.stop();
      watcherRef.current = null;
    };
  }, [queryClient, router, onAuthStateChange]);

  return () => watcherRef.current?.suppress();
}
