import { describe, expect, mock, test } from "bun:test";

import { createSponsorshipAdminHandlers } from "./http.server";

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
    listPledges: mock(async () => ({ pledges: [], total: 0 })),
    getPledgeDetail: mock(async () => null),
    getProofSigningInfo: mock(async () => null),
    recordPayment: mock(async () => ({ id: "proof-1" })),
    reviewProof: mock(async () => {}),
    cancelPledge: mock(async () => {}),
    ...overrides,
  };
}

function requireCoordinator() {
  return async () => admin;
}

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("createSponsorshipAdminHandlers", () => {
  test("listPledges returns 200 with the service payload", async () => {
    const service = createService({
      listPledges: mock(async () => ({ pledges: [{ id: pledgeId }], total: 1 })),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.listPledges({
      request: request("http://localhost/api/admin/sponsorships/pledges?status=active"),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("getPledge returns 404 when the service returns null", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.getPledge({
      request: request("http://localhost/api/admin/sponsorships/pledges/" + pledgeId),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(404);
  });

  test("getPledge returns 400 for a non-uuid id", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.getPledge({
      request: request("http://localhost/api/admin/sponsorships/pledges/not-a-uuid"),
      params: { id: "not-a-uuid" },
    });
    expect(response.status).toBe(400);
  });

  test("getProofUrl returns 200 with the signing info when present", async () => {
    const service = createService({
      getProofSigningInfo: mock(async () => ({
        storagePath: "proofs/1.png",
        fileName: "receipt.png",
      })),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.getProofUrl({
      request: request("http://localhost/api/admin/sponsorships/pledges/" + pledgeId + "/proof"),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.fileName).toBe("receipt.png");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("getProofUrl returns 404 when the service returns null", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.getProofUrl({
      request: request("http://localhost/api/admin/sponsorships/pledges/" + pledgeId + "/proof"),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Payment proof not found");
  });

  test("getProofUrl returns 400 for a non-uuid id", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.getProofUrl({
      request: request("http://localhost/api/admin/sponsorships/pledges/not-a-uuid/proof"),
      params: { id: "not-a-uuid" },
    });
    expect(response.status).toBe(400);
  });

  test("recordPayment returns 400 for an invalid JSON body", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.recordPayment({
      request: request("http://localhost/x", {
        method: "POST",
        body: "{not-json",
      }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  test("recordPayment returns 201 without a file (manual proof entry is optional)", async () => {
    const service = createService({
      recordPayment: mock(async () => ({ id: "proof-1" })),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.recordPayment({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" }),
      }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.proof.id).toBe("proof-1");
  });

  test("recordPayment returns 201 with the proof payload on success", async () => {
    const service = createService({
      recordPayment: mock(async () => ({ id: "proof-1" })),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.recordPayment({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "fps",
          amountCents: 1,
          paymentDate: "2026-07-01",
          file: {
            storagePath: "proofs/1.png",
            fileName: "receipt.png",
            fileType: "image/png",
            fileSize: 100,
          },
        }),
      }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.proof.id).toBe("proof-1");
  });

  test("an unmapped domain error falls through to a generic 500", async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const service = createService({
        recordPayment: mock(async () => {
          throw new Error("Some unmapped domain failure");
        }),
      });
      const handlers = createSponsorshipAdminHandlers({
        requireCoordinator: requireCoordinator(),
        service: service as never,
      });

      const response = await handlers.recordPayment({
        request: request("http://localhost/x", {
          method: "POST",
          body: JSON.stringify({
            paymentMethod: "fps",
            amountCents: 1,
            paymentDate: "2026-07-01",
          }),
        }),
        params: { id: pledgeId },
      });
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("Could not process sponsorship review request");
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("reviewProof maps a conflict domain error to 409", async () => {
    const service = createService({
      reviewProof: mock(async () => {
        throw new Error("Sponsorship pledge is not awaiting review");
      }),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.reviewProof({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(409);
  });

  test("recordPayment maps an ineligible-state domain error to 409", async () => {
    const service = createService({
      recordPayment: mock(async () => {
        throw new Error("Sponsorship pledge is not eligible for a recorded payment");
      }),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.recordPayment({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" }),
      }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(409);
  });

  test("cancelPledge returns 200 ok on success", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.cancelPledge({
      request: request("http://localhost/x", { method: "POST", body: JSON.stringify({}) }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  test("cancelPledge maps an already-cancelled domain error to 409", async () => {
    const service = createService({
      cancelPledge: mock(async () => {
        throw new Error("Sponsorship pledge is already cancelled");
      }),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.cancelPledge({
      request: request("http://localhost/x", { method: "POST", body: JSON.stringify({}) }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(409);
  });

  test("requireCoordinator failure propagates its Response status", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
      service: service as never,
    });

    const response = await handlers.listPledges({
      request: request("http://localhost/api/admin/sponsorships/pledges"),
    });
    expect(response.status).toBe(403);
  });
});
