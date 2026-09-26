import type { SupabaseClient } from "@supabase/supabase-js";

const DRAFT_BUCKET = "animal-draft-images";
const PUBLIC_BUCKET = "animal-images";

export type AnimalPublicationMediaCopy = {
  sourcePath: string;
  publicPath: string;
};

export async function copyPublishedAnimalMedia(
  client: SupabaseClient,
  copy: AnimalPublicationMediaCopy,
  claimedAt: string | null = null,
): Promise<void> {
  const downloaded = await client.storage.from(DRAFT_BUCKET).download(copy.sourcePath);
  if (downloaded.error) throw downloaded.error;

  const uploaded = await client.storage
    .from(PUBLIC_BUCKET)
    .upload(copy.publicPath, downloaded.data, { upsert: false });
  if (uploaded.error && uploaded.error.message !== "The resource already exists")
    throw uploaded.error;

  const { data, error } = await client.rpc("mark_animal_publication_media_copied", {
    p_public_path: copy.publicPath,
    p_claimed_at: claimedAt,
  });
  if (error) throw error;
  if (data !== true) throw new Error("Publication media copy was not queued");
}
