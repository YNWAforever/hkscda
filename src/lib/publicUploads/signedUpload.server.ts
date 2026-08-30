import type { SupabaseClient } from "@supabase/supabase-js";

export type SignedUploadDescriptor = {
  category: string;
  fileName: string;
};

export type SignedUploadResult = {
  category: string;
  path: string;
  signedUrl: string;
  token: string;
};

export type ExpectedUploadedObject = {
  category: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
};

export type VerifyUploadResult = { ok: true } | { ok: false; missing: string[] };

function safeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "file";
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function createSignedUploadUrls(
  client: SupabaseClient,
  bucket: string,
  draftId: string,
  descriptors: SignedUploadDescriptor[],
): Promise<SignedUploadResult[]> {
  const results: SignedUploadResult[] = [];
  for (const descriptor of descriptors) {
    const path = `${draftId}/${descriptor.category}/${safeFileName(descriptor.fileName)}`;
    const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
    if (error) throw error;
    if (!data) throw new Error(`Missing signed upload data for ${path}`);
    results.push({
      category: descriptor.category,
      path: data.path,
      signedUrl: data.signedUrl,
      token: data.token,
    });
  }
  return results;
}

export async function verifyUploadedObjects(
  client: SupabaseClient,
  bucket: string,
  expected: ExpectedUploadedObject[],
): Promise<VerifyUploadResult> {
  const missing: string[] = [];
  for (const item of expected) {
    const lastSlash = item.path.lastIndexOf("/");
    const folder = lastSlash === -1 ? "" : item.path.slice(0, lastSlash);
    const fileName = lastSlash === -1 ? item.path : item.path.slice(lastSlash + 1);

    const { data, error } = await client.storage.from(bucket).list(folder, { search: fileName });
    if (error) {
      missing.push(item.path);
      continue;
    }

    const match = (data ?? []).find((entry) => entry.name === fileName);
    if (!match) {
      missing.push(item.path);
      continue;
    }

    const metadata = match.metadata as { size?: number; mimetype?: string } | null;
    if (metadata?.size !== item.sizeBytes || metadata?.mimetype !== item.mimeType) {
      missing.push(item.path);
    }
  }

  return missing.length > 0 ? { ok: false, missing } : { ok: true };
}
