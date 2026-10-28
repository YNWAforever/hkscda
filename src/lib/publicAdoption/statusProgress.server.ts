import type { SupabaseClient } from "@supabase/supabase-js";
import { publicAdoptionProgress, type PublicAdoptionProgress } from "./statusProgress";

/** Called only after the application's bearer token has been authorized. */
export async function loadPublicAdoptionProgress(
  client: SupabaseClient,
  applicationId: string,
): Promise<PublicAdoptionProgress> {
  const { data: adoptionCase, error: caseError } = await client
    .from("adoption_case")
    .select("id,status_id,closed_at")
    .eq("public_application_id", applicationId)
    .maybeSingle<{ id: string; status_id: string; closed_at: string | null }>();
  if (caseError) throw caseError;
  if (!adoptionCase) return "received";

  const [statusResult, successResult] = await Promise.all([
    client
      .from("coordinator_status")
      .select("key,is_closing")
      .eq("id", adoptionCase.status_id)
      .eq("category", "adoption_case")
      .maybeSingle<{ key: string; is_closing: boolean }>(),
    client
      .from("successful_adoption")
      .select("id")
      .eq("adoption_case_id", adoptionCase.id)
      .limit(1)
      .maybeSingle<{ id: string }>(),
  ]);
  if (statusResult.error) throw statusResult.error;
  if (successResult.error) throw successResult.error;
  if (!statusResult.data) throw new Error("Adoption case status unavailable");
  return publicAdoptionProgress({
    statusKey: statusResult.data.key,
    isClosing: statusResult.data.is_closing,
    closedAt: adoptionCase.closed_at,
    hasSuccessfulAdoption: Boolean(successResult.data),
  });
}
