import type { SupabaseClient } from "@supabase/supabase-js";

import { trailingMonths } from "./publicImpact";
import type { SpeciesTotals } from "./publicImpact";

const SPECIES_TOTALS_FETCH_LIMIT = 5000;

async function countRows(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getAdoptionLifetimeTotal(client: SupabaseClient): Promise<number> {
  return countRows(client.from("successful_adoption").select("id", { count: "exact", head: true }));
}

export async function getAdoptionSpeciesTotals(client: SupabaseClient): Promise<SpeciesTotals> {
  const { count: totalRows, error: countError } = await client
    .from("successful_adoption")
    .select("id", { count: "exact", head: true });
  if (countError) throw countError;
  if ((totalRows ?? 0) > SPECIES_TOTALS_FETCH_LIMIT) {
    throw new Error(
      `successful_adoption has ${totalRows} rows, exceeding the ${SPECIES_TOTALS_FETCH_LIMIT}-row fetch limit for species totals`,
    );
  }

  const { data, error } = await client
    .from("successful_adoption")
    .select("animal_id")
    .limit(SPECIES_TOTALS_FETCH_LIMIT);
  if (error) throw error;

  const animalIds = (data ?? []).map((row) => (row as { animal_id: string }).animal_id);
  if (animalIds.length === 0) return { cat: 0, dog: 0 };

  const uniqueIds = Array.from(new Set(animalIds));
  const { data: animalRows, error: animalError } = await client
    .from("animals")
    .select("id, type")
    .in("id", uniqueIds);
  if (animalError) throw animalError;

  const typeById = new Map(
    (animalRows ?? []).map((row) => {
      const r = row as { id: string; type: string };
      return [r.id, r.type];
    }),
  );

  const totals: SpeciesTotals = { cat: 0, dog: 0 };
  for (const animalId of animalIds) {
    const type = typeById.get(animalId);
    if (type === "cat") totals.cat += 1;
    else if (type === "dog") totals.dog += 1;
  }
  return totals;
}

export async function getAdoptionMonthlyCounts(
  client: SupabaseClient,
  now: Date,
): Promise<Record<string, number>> {
  const months = trailingMonths(now);
  const counts = await Promise.all(
    months.map((m) =>
      countRows(
        client
          .from("successful_adoption")
          .select("id", { count: "exact", head: true })
          .gte("approval_date", m.start)
          .lt("approval_date", m.end),
      ),
    ),
  );
  return Object.fromEntries(months.map((m, i) => [m.month, counts[i]]));
}
