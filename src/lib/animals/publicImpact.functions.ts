import { createServerFn } from "@tanstack/react-start";

import { buildPublicImpact, type PublicImpactItem } from "./publicImpact";

type CountResult = { count: number | null; error: { message: string } | null };

/**
 * Read-only public projection over the anonymous client, so the existing RLS
 * policy stays authoritative. Adopted counts are requested but the anon policy
 * exposes only available animals; buildPublicImpact drops non-positive values, so
 * the band omits those rows rather than publishing a misleading zero (defect G-04).
 */
export const getPublicImpactItems = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: PublicImpactItem[]; asOf: string | null }> => {
    const { supabase } = await import("../supabase");

    async function countAnimal(
      type: "cat" | "dog",
      status: "available" | "adopted",
    ): Promise<CountResult> {
      const { count, error } = await supabase
        .from("animals")
        .select("id", { count: "exact", head: true })
        .eq("type", type)
        .eq("status", status);
      return { count: count ?? null, error: error ? { message: error.message } : null };
    }

    const [availableCats, availableDogs, adoptedCats, adoptedDogs] = await Promise.all([
      countAnimal("cat", "available"),
      countAnimal("dog", "available"),
      countAnimal("cat", "adopted"),
      countAnimal("dog", "adopted"),
    ]);

    const verified = (r: CountResult) => (r.error ? null : r.count);
    const asOf = new Date().toISOString();
    const items = buildPublicImpact({
      availableCats: verified(availableCats),
      availableDogs: verified(availableDogs),
      adoptedCats: verified(adoptedCats),
      adoptedDogs: verified(adoptedDogs),
      asOf,
    });

    return { items, asOf: items.length ? asOf : null };
  },
);
