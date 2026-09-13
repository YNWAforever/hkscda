import { createServerFn } from "@tanstack/react-start";

import { buildPublicImpact, type PublicImpactItem } from "./publicImpact";
import { PUBLIC_VISIBLE_ANIMAL_STATUSES } from "../../types/animal";

type CountResult = { count: number | null; error: { message: string } | null };

// Extracted so it's directly callable in tests -- createServerFn's wrapped
// export throws outside a real request context (no userCtx), the same reason
// submit-application.functions.ts keeps its core logic in a plain,
// separately-exported function rather than testing the wrapper itself.
//
// Read-only public projection over the anonymous client for available counts,
// so the existing RLS policy stays authoritative there. Adopted counts come
// from the service-role adoption-impact aggregate instead - the anon policy
// exposes only available animals, so an anon query for status = adopted could
// only ever return empty (defect G-04).
export async function resolvePublicImpactItems(): Promise<{
  items: PublicImpactItem[];
  asOf: string | null;
}> {
  const { supabase } = await import("../supabase");
  const { loadAdoptionSpeciesTotals } = await import("../adoptions/publicImpact.server");

  async function countAvailable(type: "cat" | "dog"): Promise<CountResult> {
    const { count, error } = await supabase
      .from("animals")
      .select("id", { count: "exact", head: true })
      .eq("type", type)
      .in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)
      .eq("adoption_eligible", true)
      .is("retired_at", null);
    return { count: count ?? null, error: error ? { message: error.message } : null };
  }

  const [availableCats, availableDogs, adoptedTotals] = await Promise.all([
    countAvailable("cat"),
    countAvailable("dog"),
    loadAdoptionSpeciesTotals().catch((error) => {
      console.error("Adoption species totals unavailable; omitting adopted-count cards.", error);
      return null;
    }),
  ]);

  const verified = (r: CountResult) => (r.error ? null : r.count);
  const asOf = new Date().toISOString();
  const items = buildPublicImpact({
    availableCats: verified(availableCats),
    availableDogs: verified(availableDogs),
    adoptedCats: adoptedTotals?.cat ?? null,
    adoptedDogs: adoptedTotals?.dog ?? null,
    asOf,
  });

  return { items, asOf: items.length ? asOf : null };
}

export const getPublicImpactItems = createServerFn({ method: "GET" }).handler(() =>
  resolvePublicImpactItems(),
);
