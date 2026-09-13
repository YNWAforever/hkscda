/** Explicit public allowlist; never widen to SELECT * during schema compatibility. */
export const PUBLIC_ANIMAL_BASE_COLUMNS =
  "id,type,name,name_en,gender,age,age_en,description,description_en,status,adoption_eligible,sponsorship_eligible,retired_at,publication_state,image_url,created_at,updated_at,public_profile";
export const PUBLIC_ANIMAL_COLUMNS = `${PUBLIC_ANIMAL_BASE_COLUMNS},gallery`;

/** Retry only the optional gallery column during the additive migration rollout. */
export async function readWithOptionalGallery<
  T extends { error: { code: string; message: string } | null },
>(
  read: (
    columns: typeof PUBLIC_ANIMAL_COLUMNS | typeof PUBLIC_ANIMAL_BASE_COLUMNS,
  ) => PromiseLike<T>,
): Promise<T> {
  const result = await read(PUBLIC_ANIMAL_COLUMNS);
  if (
    result.error?.code === "42703" &&
    /^column (?:animals\.)?gallery does not exist$/.test(result.error.message)
  ) {
    return await read(PUBLIC_ANIMAL_BASE_COLUMNS);
  }
  return result;
}
