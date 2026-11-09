import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ADMIN_IDENTITY_QUERY_KEY } from "./identity";
import {
  adminSessionSnapshot,
  bootstrapAdminSession,
  subscribeAdminSession,
} from "./sessionMemory";
import type { AdminMeResponse } from "./session";

/**
 * Local session identity only; server-verified admin roles remain authoritative.
 *
 * The actor now comes from the in-memory session store (populated by the session BFF), not
 * from a persisted Supabase session: a page load bootstraps via `/api/admin/session/refresh`,
 * and the query cache is cleared only when the account behind the store changes.
 */
export function useLiveAdminActor() {
  const queryClient = useQueryClient();
  const [actor, setActor] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true,
      actorGeneration = 0;
    let lastAccepted: string | null | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const accept = (userId: string | null) => {
      if (!active) return;
      setActor(userId);
      const cached = queryClient.getQueryData<AdminMeResponse>(ADMIN_IDENTITY_QUERY_KEY);
      const cachedActorId = cached?.admin.authUserId;
      // A different account now owns the session: a sign-in in another tab, or a switch in
      // this one. The first read after mounting is only a switch when the cache already names
      // another account.
      const switched =
        lastAccepted === undefined
          ? Boolean(cachedActorId && cachedActorId !== userId)
          : lastAccepted !== userId;
      const changed =
        lastAccepted === undefined ? cachedActorId !== userId : lastAccepted !== userId;
      if (changed) actorGeneration++;
      lastAccepted = userId;
      if (switched || (cachedActorId && cachedActorId !== userId)) {
        const acceptedActorGeneration = actorGeneration;
        // Keep network calls outside the synchronous store notification.
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (active && actorGeneration === acceptedActorGeneration) {
            // Nothing the previous admin loaded may stay on screen once the session belongs to
            // someone else (AUTH-04). The identity entry survives so the reset below still
            // refetches it, as it did before.
            if (switched)
              queryClient.removeQueries({
                predicate: (query) => query.queryKey[0] !== ADMIN_IDENTITY_QUERY_KEY[0],
              });
            void queryClient.resetQueries({ queryKey: ADMIN_IDENTITY_QUERY_KEY, exact: true });
          }
        }, 0);
        timers.add(timer);
      }
    };

    const initial = adminSessionSnapshot();
    if (initial) accept(initial.authUserId);
    const unsubscribe = subscribeAdminSession(() => {
      accept(adminSessionSnapshot()?.authUserId ?? null);
    });
    // A reload has no in-memory token: the refresh cookie re-establishes the session. Read the
    // store after the attempt (a concurrent sign-in may have won the race).
    void bootstrapAdminSession().then(() => {
      if (active) accept(adminSessionSnapshot()?.authUserId ?? null);
    });

    return () => {
      active = false;
      for (const timer of timers) clearTimeout(timer);
      unsubscribe();
    };
  }, [queryClient]);
  return actor;
}
