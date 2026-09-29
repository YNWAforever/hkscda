import { describe, expect, test } from "bun:test";
import { uploadDocumentPdf } from "./documentUpload";

describe("approved sponsorship terms upload", () => {
  test("records the PDF content digest as the terms version", async () => {
    const saved: { current: Record<string, unknown> | null } = { current: null };
    const file = new File(["%PDF-1.7 synthetic terms"], "terms.pdf", { type: "application/pdf" });
    await uploadDocumentPdf({
      file,
      objectPath: "sponsorship_terms/terms.pdf",
      metadata: {
        kind: "sponsorship_terms",
        title: "Approved terms",
        language: "en",
        sortOrder: 0,
      },
      requestUploadTarget: async () => ({
        token: "sandbox-token",
        path: "sponsorship_terms/terms.pdf",
      }),
      uploadToSignedUrl: async () => {},
      createAsset: async (input) => {
        saved.current = input;
        return input;
      },
    });
    const expected = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
    )
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    expect(saved.current?.checksumSha256).toBe(expected);
    expect(saved.current?.isPublished).toBe(false);
  });
});
