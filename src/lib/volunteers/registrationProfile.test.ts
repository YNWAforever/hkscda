import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseVolunteerRepository } from "./repository.server";
function repository(profileId: string | null) {
  const row = {
    id: "registration",
    activity_id: "activity",
    profile_id: profileId,
    supporter_id: "different-supporter",
    contact_name: "Same Name",
    contact_email: "same@example.test",
  };
  const client = {
    from(table: string) {
      if (table === "volunteer_registration")
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
        };
      return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
    },
  } as unknown as SupabaseClient;
  return createSupabaseVolunteerRepository(client);
}
describe("canonical registration profile", () => {
  test("maps only the stored profile_id", async () => {
    expect(
      (await repository("canonical-profile").getRegistrationDetail("registration"))?.profileId,
    ).toBe("canonical-profile");
  });
  test("keeps legacy identity unlinked despite contact and supporter fields", async () => {
    expect((await repository(null).getRegistrationDetail("registration"))?.profileId).toBeNull();
  });
});
