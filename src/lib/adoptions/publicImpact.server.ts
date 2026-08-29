import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "../donations/supabase.server";
import {
  getAdoptionLifetimeTotal,
  getAdoptionMonthlyCounts,
  getAdoptionSpeciesTotals,
} from "./publicImpactRepository.server";
import { buildAdoptionImpactReport } from "./publicImpact";
import type { AdoptionImpactReport, SpeciesTotals } from "./publicImpact";

type ClientFactory = () => SupabaseClient;

export async function loadAdoptionImpactReport(
  now: Date,
  createClient: ClientFactory = createSupabaseServiceClient,
): Promise<AdoptionImpactReport> {
  const client = createClient();
  const [total, monthlyCounts] = await Promise.all([
    getAdoptionLifetimeTotal(client),
    getAdoptionMonthlyCounts(client, now),
  ]);
  return buildAdoptionImpactReport({ total, monthlyCounts, now });
}

export async function loadAdoptionSpeciesTotals(
  createClient: ClientFactory = createSupabaseServiceClient,
): Promise<SpeciesTotals> {
  return getAdoptionSpeciesTotals(createClient());
}
