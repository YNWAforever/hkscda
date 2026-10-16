import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export type AdminAuthListener = (
  event: AuthChangeEvent,
  session: Session | null,
) => void | Promise<void>;
type Subscription = { unsubscribe: () => void };
type AuthEventSource = {
  onAuthStateChange: (listener: AdminAuthListener) => {
    data: { subscription: Subscription };
  };
};
type Listener = {
  callback: AdminAuthListener;
  active: boolean;
  waitingInitial: boolean;
  initialSubscription?: Subscription;
};

/**
 * Share the SDK event stream and its pending initial read. No session is cached.
 * A listener joining after initialization asks the SDK for its own fresh initial
 * event, so an account change between mounts cannot replay an older identity.
 */
export function createSharedAdminAuthEvents(
  source: AuthEventSource,
  reportError: (error: unknown) => void = console.error,
) {
  const listeners = new Set<Listener>();
  let stream: Subscription | undefined;
  let initialPending = false;
  let generation = 0;

  async function deliver(listener: Listener, event: AuthChangeEvent, session: Session | null) {
    if (!listener.active) return;
    try {
      await listener.callback(event, session);
    } catch (error) {
      // One consumer must not prevent the expiry or identity consumer from
      // receiving the same event. Match the SDK's per-listener initial fallback.
      reportError(error);
      if (event === "INITIAL_SESSION" && session && listener.active) {
        try {
          await listener.callback(event, null);
        } catch (fallbackError) {
          reportError(fallbackError);
        }
      }
    }
  }

  return function subscribe(callback: AdminAuthListener) {
    const listener: Listener = { callback, active: true, waitingInitial: true };
    listeners.add(listener);
    if (!stream) {
      const current = ++generation;
      initialPending = true;
      stream = source.onAuthStateChange((event, session) => {
        if (current !== generation) return;
        if (event === "INITIAL_SESSION") initialPending = false;
        return Promise.all(
          [...listeners]
            .filter((entry) => event !== "INITIAL_SESSION" || entry.waitingInitial)
            .map((entry) => {
              if (event === "INITIAL_SESSION") entry.waitingInitial = false;
              return deliver(entry, event, session);
            }),
        ).then(() => {});
      }).data.subscription;
    } else if (!initialPending) {
      const initial: { subscription?: Subscription } = {};
      let completed = false;
      initial.subscription = source.onAuthStateChange((event, session) => {
        if (event !== "INITIAL_SESSION") return;
        completed = true;
        listener.waitingInitial = false;
        initial.subscription?.unsubscribe();
        return deliver(listener, event, session);
      }).data.subscription;
      // The SDK emits asynchronously; also tolerate an eager injected source.
      if (completed) initial.subscription.unsubscribe();
      else listener.initialSubscription = initial.subscription;
    }
    return () => {
      listener.active = false;
      listeners.delete(listener);
      listener.initialSubscription?.unsubscribe();
      if (!listeners.size) {
        generation++;
        stream?.unsubscribe();
        stream = undefined;
        initialPending = false;
      }
    };
  };
}
