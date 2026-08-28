import type { SupabaseClient } from "@supabase/supabase-js";

import { trailingMonths } from "./publicImpact";
import type { SpeciesTotals } from "./publicImpact";

async function countRows(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getAdoptionLifetimeTotal(client: SupabaseClient): Promise<number> {
  return countRows(client.from("successful_adoption").select("id", { count: "exact", head: true }));
}

export async function getAdoptionSpeciesTotals(client: SupabaseClient): Promise<SpeciesTotals> {
  const { data, error } = await client.from("successful_adoption").select("animal_id");
  if (error) throw new Error(error.message);

  const animalIds = Array.from(
    new Set((data ?? []).map((row) => (row as { animal_id: string }).animal_id)),
  );
  if (animalIds.length === 0) return { cat: 0, dog: 0 };

  const { data: animalRows, error: animalError } = await client
    .from("animals")
    .select("id, type")
    .in("id", animalIds);
  if (animalError) throw new Error(animalError.message);

  const totals: SpeciesTotals = { cat: 0, dog: 0 };
  for (const row of (animalRows ?? []) as Array<{ id: string; type: string }>) {
    if (row.type === "cat") totals.cat += 1;
    else if (row.type === "dog") totals.dog += 1;
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
