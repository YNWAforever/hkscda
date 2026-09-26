import { describe, expect, mock, test } from "bun:test";

import { MAX_PROOF_BYTES } from "../../../../../lib/sponsorship/schemas";
import { handleRecordPaymentUpload, safeFileName } from "./-recordPaymentUpload";

const pledgeId = "11111111-2222-4333-8444-555555555555";
const admin = {
  id: "admin-1",
  authUserId: "auth-1",
  email: "a@b.com",
  role: "staff" as const,
  status: "active" as const,
};

function createService(overrides: Record<string, unknown> = {}) {
  return {
    assertRecordPaymentEligible: mock(async () => {}),
    recordPayment: mock(async () => ({ id: "proof-1" })),
    ...overrides,
  };
}

function createClient(overrides: { upload?: unknown; remove?: unknown; reserve?: unknown } = {}) {
  const upload =
    overrides.upload ?? mock(async () => ({ data: { path: "uploaded/path.png" }, error: null }));
  const remove = overrides.remove ?? mock(async () => ({ data: null, error: null }));
  const reserve = overrides.reserve ?? mock(async () => ({ data: null, error: null }));

  const client = {
    rpc: reserve,
    storage: {
      from: mock(() => ({ upload, remove })),
    },
  };

  return { client, upload, remove, reserve };
}

function requireCoordinator() {
  return mock(async () => admin);
}

function multipartRequest(options: {
  payload?: Record<string, unknown> | string | null;
  file?: File | null;
  includePayload?: boolean;
}) {
  const formData = new FormData();
  if (options.includePayload !== false) {
    const payloadValue =
      typeof options.payload === "string"
        ? options.payload
        : JSON.stringify({
            idempotencyKey: "55555555-5555-4555-8555-555555555555",
            ...options.payload,
          });
    formData.set("payload", payloadValue);
  }
  if (options.file) {
    formData.set("file", options.file);
  }
  return new Request("http://localhost/x", { method: "POST", body: formData });
}

function proofFile(overrides: Partial<{ name: string; type: string; content: string }> = {}) {
  return new File([overrides.content ?? "fake-bytes"], overrides.name ?? "receipt.png", {
    type: overrides.type ?? "image/png",
  });
}

describe("safeFileName", () => {
  test("strips path separators and unsafe characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("my receipt (1).png")).toBe("my_receipt__1_.png");
  });

  test("falls back to 'proof' for an empty name", () => {
    expect(safeFileName("   ")).toBe("proof");
  });

  test("falls back to 'proof' for a dot-only name", () => {
    expect(safeFileName(".")).toBe("proof");
    expect(safeFileName("..")).toBe("proof");
  });
});

describe("handleRecordPaymentUpload", () => {
  test("rejects an oversized multipart body without Content-Length before recording", async () => {
    const service = createService();
    const { client, upload } = createClient();
    const formData = new FormData();
    formData.set(
      "payload",
      JSON.stringify({ idempotencyKey: "55555555-5555-4555-8555-555555555555" }),
    );
    formData.set("padding", "x".repeat(10 * 1024 * 1024));
    const request = new Request("http://localhost/x", { method: "POST", body: formData });
    expect(request.headers.has("content-length")).toBe(false);

    const response = await handleRecordPaymentUpload({
      request,
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBe(413);
    expect(service.recordPayment).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  test("returns 400 when the payload part is missing", async () => {
    const service = createService();
    const { client } = createClient();

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({ includePayload: false }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing payment payload");
  });

  test("returns 400 when the payload is not valid JSON", async () => {
    const service = createService();
    const { client } = createClient();

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({ payload: "{not-json" }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid payment payload");
  });

  test("records a payment with no file part and passes file: undefined through", async () => {
    const service = createService();
    const { client, upload } = createClient();

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({
        payload: { paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" },
      }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBe(201);
    expect(upload).not.toHaveBeenCalled();
    expect(service.recordPayment).toHaveBeenCalled();
    const call = (service.recordPayment as ReturnType<typeof mock>).mock.calls[0][0] as {
      input: { file?: unknown };
    };
    expect(call.input.file).toBeUndefined();
  });

  test("checks eligibility before uploading and never touches storage when ineligible", async () => {
    const service = createService({
      assertRecordPaymentEligible: mock(async () => {
        throw new Error("Sponsorship pledge is not eligible for a recorded payment");
      }),
    });
    const { client, upload } = createClient();

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({
        payload: { paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" },
        file: proofFile(),
      }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBe(409);
    expect(upload).not.toHaveBeenCalled();
  });

  test("reserves the deterministic path before uploading and recording", async () => {
    const service = createService();
    let reserved = false;
    const reserve = mock(async () => {
      reserved = true;
      return { data: null, error: null };
    });
    const upload = mock(async () => {
      expect(reserved).toBe(true);
      return { data: { path: "uploaded/path.png" }, error: null };
    });
    const { client } = createClient({ reserve, upload });

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({
        payload: { paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" },
        file: proofFile({ name: "../../my receipt.png" }),
      }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBe(201);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalled();
    const [requestedPath] = (upload as ReturnType<typeof mock>).mock.calls[0] as [
      string,
      ...unknown[],
    ];
    expect(requestedPath.startsWith(`${pledgeId}/staff-`)).toBe(true);
    expect(requestedPath.endsWith("my_receipt.png")).toBe(true);
    expect(requestedPath).not.toContain("..");

    expect(service.recordPayment).toHaveBeenCalled();
    const call = (service.recordPayment as ReturnType<typeof mock>).mock.calls[0][0] as {
      input: { file?: { storagePath: string } };
    };
    // Retry identity uses the deterministic content-addressed path.
    expect(call.input.file?.storagePath).toBe(requestedPath);
  });

  test("does not upload when reserving the cleanup intent fails", async () => {
    const service = createService();
    const { client, upload, reserve } = createClient({
      reserve: mock(async () => ({ data: null, error: new Error("intent unavailable") })),
    });

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({
        payload: { paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" },
        file: proofFile(),
      }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBe(500);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
    expect(service.recordPayment).not.toHaveBeenCalled();
  });

  test("rejects a wrong-MIME-type file with 400 and never touches storage", async () => {
    const service = createService();
    const { client, upload } = createClient();

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({
        payload: { paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" },
        // Bun's multipart/form-data serializer infers the Content-Type of a
        // recognized image/document extension from the file name rather than
        // the `File.type` passed in, so a mismatched-but-still-image
        // extension like ".png" would silently "fix itself" on the wire.
        // Naming it like an executable keeps the wrong MIME type intact
        // through the request/response round trip.
        file: proofFile({ name: "receipt.exe", type: "application/x-msdownload" }),
      }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid payment proof request");
    expect(upload).not.toHaveBeenCalled();
  });

  test("rejects an oversized file with 400 and never touches storage", async () => {
    const service = createService();
    const { client, upload } = createClient();

    const oversizedFile = new File([new Uint8Array(MAX_PROOF_BYTES + 1)], "receipt.png", {
      type: "image/png",
    });

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({
        payload: { paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" },
        file: oversizedFile,
      }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid payment proof request");
    expect(upload).not.toHaveBeenCalled();
  });

  test("does not delete a file committed by a competing request with the same key", async () => {
    let competingProofCommitted = false;
    const service = createService({
      recordPayment: mock(async () => {
        competingProofCommitted = true;
        throw new Error("Submission key reused for different facts");
      }),
    });
    const { client, upload, remove } = createClient();

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({
        payload: { paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" },
        file: proofFile(),
      }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(upload).toHaveBeenCalled();
    expect(competingProofCommitted).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  test("leaves a failed upload for deferred cleanup when recordPayment fails", async () => {
    const service = createService({
      recordPayment: mock(async () => {
        throw new Error("Sponsorship pledge not found");
      }),
    });
    const { client, upload, remove } = createClient();

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({
        payload: { paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" },
        file: proofFile(),
      }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBe(404);
    expect(upload).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  test("does not attempt cleanup when no file was uploaded", async () => {
    const service = createService({
      recordPayment: mock(async () => {
        throw new Error("Sponsorship pledge not found");
      }),
    });
    const { client, remove } = createClient();

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({
        payload: { paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" },
      }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: requireCoordinator(),
    });

    expect(response.status).toBe(404);
    expect(remove).not.toHaveBeenCalled();
  });

  test("returns the requireCoordinator failure status", async () => {
    const service = createService();
    const { client } = createClient();

    const response = await handleRecordPaymentUpload({
      request: multipartRequest({ payload: {} }),
      pledgeId,
      client: client as never,
      service: service as never,
      requireCoordinator: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
    });

    expect(response.status).toBe(403);
  });

  test("an unmapped domain error falls through to a 500 with the route-specific message", async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const service = createService({
        recordPayment: mock(async () => {
          throw new Error("Some unmapped domain failure");
        }),
      });
      const { client } = createClient();

      const response = await handleRecordPaymentUpload({
        request: multipartRequest({
          payload: { paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" },
        }),
        pledgeId,
        client: client as never,
        service: service as never,
        requireCoordinator: requireCoordinator(),
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("Could not record sponsorship payment");
    } finally {
      console.error = originalConsoleError;
    }
  });
});
