import type { DocumentKind, DocumentLanguage } from "../../../lib/documents/types";
import { DocumentAdminError } from "./documentErrors";

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

type UploadMetadata = {
  kind: DocumentKind;
  title: string;
  language: DocumentLanguage;
  sortOrder: number;
};
type UploadDocumentPdfArgs = {
  file: File;
  objectPath: string;
  metadata: UploadMetadata;
  requestUploadTarget(input: {
    bucketName: "site-documents";
    objectPath: string;
    byteSize: number;
  }): Promise<{ token: string; path: string }>;
  uploadToSignedUrl(path: string, token: string, file: File): Promise<void>;
  createAsset(input: Record<string, unknown>): Promise<unknown>;
};

export async function uploadDocumentPdf({
  file,
  objectPath,
  metadata,
  requestUploadTarget,
  uploadToSignedUrl,
  createAsset,
}: UploadDocumentPdfArgs) {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    throw new DocumentAdminError("not_pdf");
  }
  if (file.size < 1 || file.size > MAX_DOCUMENT_BYTES) {
    throw new DocumentAdminError("too_large");
  }

  const checksumSha256 =
    metadata.kind === "sponsorship_terms"
      ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")
      : null;

  const target = await requestUploadTarget({
    bucketName: "site-documents",
    objectPath,
    byteSize: file.size,
  });
  await uploadToSignedUrl(target.path, target.token, file);
  return createAsset({
    ...metadata,
    bucketName: "site-documents",
    objectPath: target.path,
    mimeType: "application/pdf",
    byteSize: file.size,
    checksumSha256,
    isPublished: false,
  });
}
