import { describe, expect, mock, test } from "bun:test";

import {
  createPublicDocumentDownloadHandler,
  PUBLIC_DOCUMENT_SIGNED_URL_TTL_SECONDS,
  type PublicDocumentDeps,
} from "../../../lib/documents/download.server";

const assetId = "11111111-2222-4333-8444-555555555555";
const url = `https://example.test/api/documents/${assetId}`;
const eligible = {
  bucketName: "site-documents",
  objectPath: "annual-reports/2025-26.pdf",
  mimeType: "application/pdf" as const,
};

function setup(overrides: Partial<PublicDocumentDeps> = {}) {
  const findEligibleAsset = mock(async (_id: string) => eligible as typeof eligible | null);
  const sign = mock(async (_bucket: string, _path: string) => "https://storage.test/signed");
  const handle = createPublicDocumentDownloadHandler({
    findEligibleAsset,
    sign,
    ...overrides,
  });
  return { handle, findEligibleAsset, sign };
}

describe("public document download route", () => {
  test("redirects an eligible published asset to a short-lived signed URL", async () => {
    const { handle, findEligibleAsset, sign } = setup();

    const response = await handle({ request: new Request(url), params: { assetId } });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://storage.test/signed");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(findEligibleAsset).toHaveBeenCalledWith(assetId);
    expect(sign).toHaveBeenCalledWith("site-documents", "annual-reports/2025-26.pdf");
    // The signed URL is a header only: no body echoes a Storage URL.
    expect(await response.text()).toBe("");
  });

  test("a malformed asset id is a 404 and never reaches the database", async () => {
    const { handle, findEligibleAsset } = setup();

    const response = await handle({
      request: new Request("https://example.test/api/documents/not-a-uuid"),
      params: { assetId: "not-a-uuid" },
    });

    expect(response.status).toBe(404);
    expect(findEligibleAsset).not.toHaveBeenCalled();
  });

  test("an unpublished, unreferenced or missing asset is a 404 without a signature", async () => {
    const { handle, sign } = setup({ findEligibleAsset: async () => null });

    const response = await handle({ request: new Request(url), params: { assetId } });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Document not found" });
    expect(sign).not.toHaveBeenCalled();
  });

  test.each([
    ["another bucket", { ...eligible, bucketName: "receipts" }],
    ["a non-PDF", { ...eligible, mimeType: "text/html" }],
    ["a leading slash", { ...eligible, objectPath: "/annual-reports/2025-26.pdf" }],
    ["parent traversal", { ...eligible, objectPath: "annual-reports/../secret.pdf" }],
    ["a backslash", { ...eligible, objectPath: "annual-reports\\2025-26.pdf" }],
    ["a non-PDF path", { ...eligible, objectPath: "annual-reports/2025-26.docx" }],
  ])("never signs %s, even if the lookup returned one", async (_name, asset) => {
    const { handle, sign } = setup({ findEligibleAsset: async () => asset as typeof eligible });

    const response = await handle({ request: new Request(url), params: { assetId } });

    expect(response.status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });

  test("a signing failure is a sanitized 503 with no storage details", async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      const { handle } = setup({
        sign: async () => {
          throw new Error("storage.objects row level security denied select secret");
        },
      });

      const response = await handle({ request: new Request(url), params: { assetId } });

      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text).not.toContain("storage.objects");
      expect(text).not.toContain("denied");
      expect(response.headers.get("cache-control")).toBe("no-store");
    } finally {
      console.error = originalError;
    }
  });

  test("only GET is served", async () => {
    const { handle, findEligibleAsset } = setup();

    const response = await handle({
      request: new Request(url, { method: "POST" }),
      params: { assetId },
    });

    expect(response.status).toBe(405);
    expect(findEligibleAsset).not.toHaveBeenCalled();
  });

  test("the signed URL lifetime is short enough to be a redirect, not a link", () => {
    expect(PUBLIC_DOCUMENT_SIGNED_URL_TTL_SECONDS).toBeGreaterThan(0);
    expect(PUBLIC_DOCUMENT_SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(120);
  });
});
