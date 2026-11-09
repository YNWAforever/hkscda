import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { ADMIN_IDENTITY_QUERY_KEY } from "./identity";
import type { AdminMeResponse } from "./session";

/** Local session identity only; server-verified admin roles remain authoritative. */
export function useLiveAdminActor() {
  const queryClient = useQueryClient();
  const [actor, setActor] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true,
      sequence = 0,
      actorGeneration = 0;
    let lastAccepted: string | null | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const accept = (userId: string | null) => {
      if (!active) return;
      setActor(userId);
      const cached = queryClient.getQueryData<AdminMeResponse>(ADMIN_IDENTITY_QUERY_KEY);
      const cachedActorId = cached?.admin.authUserId;
      // A different account now owns the shared Supabase session: a sign-in in another tab,
      // or a switch in this one. The first read after mounting is only a switch when the cache
      // already names another account.
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
        // Keep Supabase calls outside its synchronous auth event callback.
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
    const initial = sequence;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (sequence === initial) accept(data.session?.user.id ?? null);
      })
      .catch(() => {
        if (sequence === initial) accept(null);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      sequence += 1;
      accept(session?.user.id ?? null);
    });
    return () => {
      active = false;
      for (const timer of timers) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [queryClient]);
  return actor;
}
