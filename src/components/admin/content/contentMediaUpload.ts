import { CONTENT_MEDIA_MIME_TYPES, MAX_CONTENT_MEDIA_BYTES } from "../../../lib/content/schemas";

type UploadContentMediaImageArgs = {
  file: File;
  contentId: string;
  requestUploadTarget(input: {
    objectPath: string;
    mimeType: string;
    byteSize: number;
  }): Promise<{ token: string; path: string }>;
  uploadToSignedUrl(path: string, token: string, file: File): Promise<void>;
};

// Mirrors the safeFileName() helper duplicated in
// src/lib/sponsorship/submission.server.ts and
// src/lib/publicAdoption/submission.server.ts, kept as a separate copy here
// rather than imported: both are .server.ts files and this helper runs in
// the browser, so it cannot be imported from client code (this repo's
// *.server.ts files never reach the client bundle).
function safeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "file";
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function uploadContentMediaImage({
  file,
  contentId,
  requestUploadTarget,
  uploadToSignedUrl,
}: UploadContentMediaImageArgs): Promise<string> {
  // CONTENT_MEDIA_MIME_TYPES is declared `as const` in schemas.ts, so
  // .includes() only accepts its exact literal union -- cast file.type the
  // same way src/components/site/adoption/photoUploaderLogic.ts's
  // validateSelectedFile() already does for the equivalent PHOTO_MIME_TYPES
  // check.
  if (!CONTENT_MEDIA_MIME_TYPES.includes(file.type as (typeof CONTENT_MEDIA_MIME_TYPES)[number])) {
    throw new Error("請選擇 JPG、PNG 或 WEBP 圖片");
  }
  if (file.size < 1 || file.size > MAX_CONTENT_MEDIA_BYTES) {
    throw new Error("圖片不可超過 8 MiB");
  }

  const objectPath = `${contentId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const target = await requestUploadTarget({
    objectPath,
    mimeType: file.type,
    byteSize: file.size,
  });
  await uploadToSignedUrl(target.path, target.token, file);
  return target.path;
}
