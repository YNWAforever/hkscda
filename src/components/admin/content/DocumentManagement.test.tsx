import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DocumentManagement } from "./DocumentManagement";
import { uploadDocumentPdf } from "./documentUpload";

const asset = {
  id: "11111111-2222-4333-8444-555555555555",
  kind: "annual_report" as const,
  title: "Annual Report 2025/26",
  language: "bilingual" as const,
  bucketName: "site-documents",
  objectPath: "annual-reports/2025-26.pdf",
  fileUrl: null,
  mimeType: "application/pdf" as const,
  byteSize: 1024,
  checksumSha256: null,
  isPublished: false,
  sortOrder: 0,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

describe("DocumentManagement", () => {
  test("renders the document workspace from initial summaries", () => {
    const markup = renderToStaticMarkup(
      <DocumentManagement initialData={{ items: [asset], total: 1 }} />,
    );

    expect(markup).toContain("文件");
    expect(markup).toContain("Annual Report 2025/26");
    expect(markup).toContain("未發佈");
  });

  test("uploads with the signed token before creating metadata", async () => {
    const calls: string[] = [];
    const file = new File([new Uint8Array(1024)], "report.pdf", {
      type: "application/pdf",
    });
    const requestUploadTarget = mock(async () => {
      calls.push("target");
      return { token: "signed-token", path: "annual-reports/report.pdf" };
    });
    const uploadToSignedUrl = mock(async () => {
      calls.push("upload");
    });
    const createAsset = mock(async (input: unknown) => {
      calls.push("metadata");
      return input;
    });

    await uploadDocumentPdf({
      file,
      objectPath: "annual-reports/report.pdf",
      metadata: {
        kind: "annual_report",
        title: "Annual Report 2025/26",
        language: "bilingual",
        sortOrder: 0,
      },
      requestUploadTarget,
      uploadToSignedUrl,
      createAsset,
    });

    expect(calls).toEqual(["target", "upload", "metadata"]);
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      "annual-reports/report.pdf",
      "signed-token",
      file,
    );
    expect(createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketName: "site-documents",
        objectPath: "annual-reports/report.pdf",
        mimeType: "application/pdf",
        byteSize: 1024,
      }),
    );
  });

  test("rejects non-PDF and oversized files before requesting a signed target", async () => {
    const requestUploadTarget = mock(async () => ({ token: "token", path: "ignored" }));
    const dependencies = {
      requestUploadTarget,
      uploadToSignedUrl: mock(async () => undefined),
      createAsset: mock(async () => asset),
    };

    await expect(
      uploadDocumentPdf({
        file: new File(["text"], "report.txt", { type: "text/plain" }),
        objectPath: "annual-reports/report.pdf",
        metadata: { kind: "annual_report", title: "Report", language: "bilingual", sortOrder: 0 },
        ...dependencies,
      }),
    ).rejects.toThrow("PDF");
    expect(requestUploadTarget).not.toHaveBeenCalled();
  });
});
