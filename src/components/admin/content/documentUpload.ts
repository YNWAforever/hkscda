import type { DocumentKind, DocumentLanguage } from "../../../lib/documents/types";

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
    throw new Error("請選擇 PDF 檔案");
  }
  if (file.size < 1 || file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("PDF 檔案不可超過 50 MiB");
  }

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
    checksumSha256: null,
    isPublished: false,
  });
}
