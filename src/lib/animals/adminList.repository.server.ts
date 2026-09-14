import type { SupabaseClient } from "@supabase/supabase-js";
import { adminListSearchSchema } from "./adminListState";
import { adminAnimalFilter } from "./adminCatalogue";
import type { Animal } from "../../types/animal";
export const ANIMAL_ADMIN_SUMMARY_COLUMNS =
  "id,type,name,name_en,gender,age,age_en,status,adoption_eligible,sponsorship_eligible,retired_at,publication_state,image_url,created_at,updated_at,code:public_profile->>code";
export function createAnimalAdminList(client: SupabaseClient) {
  return async (raw: unknown, missingPhoto = false) => {
    const input = adminListSearchSchema.parse(raw);
    if (!["cat", "dog", "sponsor"].includes(input.section))
      throw new Error("Invalid animal section");
    const filter = adminAnimalFilter(input.section as "cat" | "dog" | "sponsor");
    let query = client
      .from("animals")
      .select(ANIMAL_ADMIN_SUMMARY_COLUMNS, { count: "exact" })
      .eq(filter.column, filter.value)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (!input.archived) query = query.is("retired_at", null);
    if (input.status !== "all") query = query.eq("status", input.status);
    if (missingPhoto) query = query.or("image_url.is.null,image_url.eq.");
    const term = input.q.trim();
    const escaped = term
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
    const operand = `"%${escaped}%"`;
    if (term)
      query = query.or(
        `name.ilike.${operand},name_en.ilike.${operand},public_profile->>code.ilike.${operand}`,
      );
    const result = await query.range((input.page - 1) * 20, input.page * 20 - 1);
    if (result.error) throw result.error;
    const rows = (result.data ?? []) as unknown as Array<
      Omit<Animal, "description" | "description_en" | "notes" | "notes_en"> & {
        code: string | null;
      }
    >;
    return {
      animals: rows.map(({ code, ...animal }) => ({
        ...animal,
        description: null,
        description_en: null,
        notes: null,
        notes_en: null,
        public_profile: {
          code,
          birthday: null,
          neutered: null,
          suitability: null,
          personality: null,
          health: null,
          story: null,
          recordDate: null,
        },
      })),
      total: result.count ?? 0,
      page: input.page,
    };
  };
}
