import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// `mock.module` mocks are process-global in Bun's test runner and outlive this
// file: they aren't undone by `mock.restore()`, so an unmocked-back specifier
// here would leak into every other test file (in the same `bun test` run)
// that imports "../../../lib/supabase" after this one. Capture the real
// module first so `afterAll` can put it back.
// Spread into a plain object: `mock.module` mutates the shared
// module-registry exports object in place, so a bare reference captured here
// would be mutated out from under us the moment the mock below is installed.
const realSupabaseModule = { ...(await import("../../../lib/supabase")) };

const uploadToSignedUrl = mock(
  async (
    _path: string,
    _token: string,
    _file: File,
    _options: { contentType: string },
  ): Promise<{ data: unknown; error: unknown }> => ({ data: { path: _path }, error: null }),
);
const storageFrom = mock((_bucket: string) => ({ uploadToSignedUrl }));
const getSupabaseClient = mock(() => ({ storage: { from: storageFrom } }));

mock.module("../../../lib/supabase", () => ({ getSupabaseClient }));

const { uploadProofDirectly, resolvePledgeSubmissionIds } = await import("./pledgeProofUpload");

afterAll(() => {
  mock.module("../../../lib/supabase", () => realSupabaseModule);
});

function makeProofFile(fileName = "receipt.jpg") {
  return new File(["bytes"], fileName, { type: "image/jpeg" });
}

describe("uploadProofDirectly", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    uploadToSignedUrl.mockClear();
    storageFrom.mockClear();
    getSupabaseClient.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("requests a signed URL with no turnstileToken, uploads the file, and returns the pledge id and storage path", async () => {
    const fetchSpy = mock(async () =>
      Response.json(
        {
          pledgeId: "pledge-1",
          upload: { path: "pledge-1/proof/receipt.jpg", signedUrl: "https://x", token: "tok" },
        },
        { status: 201 },
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const file = makeProofFile();

    const result = await uploadProofDirectly(file);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/sponsorships/pledges/proof-upload-url",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proof: { fileName: "receipt.jpg", mimeType: "image/jpeg", sizeBytes: 5 },
        }),
      }),
    );
    // The exact-body assertion above already proves no turnstileToken field
    // is sent to this endpoint -- the token is single-use and verified only
    // at final submission.

    expect(storageFrom).toHaveBeenCalledWith("sponsorship-payment-proof");
    expect(uploadToSignedUrl).toHaveBeenCalledWith("pledge-1/proof/receipt.jpg", "tok", file, {
      contentType: "image/jpeg",
    });
    expect(result).toEqual({ pledgeId: "pledge-1", storagePath: "pledge-1/proof/receipt.jpg" });
  });

  test("throws using the server's error message when the upload-url request fails", async () => {
    const fetchSpy = mock(async () => Response.json({ error: "驗證已過期" }, { status: 403 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(uploadProofDirectly(makeProofFile())).rejects.toThrow("驗證已過期");
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });

  test("falls back to a generic message when the upload-url error response has no usable body", async () => {
    const fetchSpy = mock(async () => new Response("not json", { status: 500 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(uploadProofDirectly(makeProofFile())).rejects.toThrow("無法準備付款證明上傳。");
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });

  test("logs and throws a friendly message when the direct Storage upload fails", async () => {
    const fetchSpy = mock(async () =>
      Response.json(
        {
          pledgeId: "pledge-1",
          upload: { path: "pledge-1/proof/receipt.jpg", signedUrl: "https://x", token: "tok" },
        },
        { status: 201 },
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    uploadToSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("storage boom") });
    const consoleErrorSpy = mock((..._args: unknown[]) => {});
    const originalConsoleError = console.error;
    console.error = consoleErrorSpy;

    try {
      await expect(uploadProofDirectly(makeProofFile())).rejects.toThrow(
        "付款證明上傳失敗，請重試。",
      );
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

describe("resolvePledgeSubmissionIds", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    uploadToSignedUrl.mockClear();
    storageFrom.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("generates a fresh pledgeId and no proof reference when there is no proof file", async () => {
    const fetchSpy = mock(async () => {
      throw new Error("fetch should not be called for a no-proof submission");
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await resolvePledgeSubmissionIds(false, null);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.proof).toBeUndefined();
    expect(typeof result.pledgeId).toBe("string");
    expect(result.pledgeId.length).toBeGreaterThan(0);
    // Confirms a *fresh* id is minted each time, not a constant placeholder.
    const second = await resolvePledgeSubmissionIds(false, null);
    expect(second.pledgeId).not.toBe(result.pledgeId);
  });

  test("generates a fresh pledgeId when includeProof is true but no file was selected", async () => {
    const fetchSpy = mock(async () => {
      throw new Error("fetch should not be called when there is no proof file");
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await resolvePledgeSubmissionIds(true, null);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.proof).toBeUndefined();
    expect(typeof result.pledgeId).toBe("string");
  });

  test("uploads the proof and reuses the upload-url endpoint's pledgeId when a proof file is attached", async () => {
    const fetchSpy = mock(async () =>
      Response.json(
        {
          pledgeId: "pledge-from-server",
          upload: {
            path: "pledge-from-server/proof/receipt.jpg",
            signedUrl: "https://x",
            token: "tok",
          },
        },
        { status: 201 },
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const file = makeProofFile();

    const result = await resolvePledgeSubmissionIds(true, file);

    expect(result).toEqual({
      pledgeId: "pledge-from-server",
      proof: {
        fileName: "receipt.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 5,
        storagePath: "pledge-from-server/proof/receipt.jpg",
      },
    });
  });
});
