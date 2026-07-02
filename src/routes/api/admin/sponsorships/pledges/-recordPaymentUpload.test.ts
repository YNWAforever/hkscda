import { describe, expect, mock, test } from "bun:test";

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

function createClient(overrides: { upload?: unknown; remove?: unknown } = {}) {
  const upload =
    overrides.upload ?? mock(async () => ({ data: { path: "uploaded/path.png" }, error: null }));
  const remove = overrides.remove ?? mock(async () => ({ data: null, error: null }));

  const client = {
    storage: {
      from: mock(() => ({ upload, remove })),
    },
  };

  return { client, upload, remove };
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
      typeof options.payload === "string" ? options.payload : JSON.stringify(options.payload ?? {});
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
});

describe("handleRecordPaymentUpload", () => {
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

  test("maps the missing-file domain error from service.recordPayment to 400", async () => {
    const service = createService({
      recordPayment: mock(async () => {
        throw new Error("A proof file is required to record a payment");
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

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("A proof file is required to record a payment");
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

  test("sanitizes the file name and uploads before recording the payment", async () => {
    const service = createService();
    const { client, upload } = createClient();

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
    // The final `storagePath` on the recorded file uses the path Supabase
    // storage reports back (`upload.data.path`), not the requested path.
    expect(call.input.file?.storagePath).toBe("uploaded/path.png");
  });

  test("removes the uploaded file when recordPayment fails after a successful upload", async () => {
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
    expect(remove).toHaveBeenCalledWith(["uploaded/path.png"]);
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
