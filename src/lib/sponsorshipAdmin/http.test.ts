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

  test("reviewProof maps a no-proof-pending domain error to 409", async () => {
    const service = createService({
      reviewProof: mock(async () => {
        throw new Error("Sponsorship pledge has no proof pending review");
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
    const body = await response.json();
    expect(body.error).toBe("Sponsorship pledge has no proof pending review");
  });

  test("reviewProof maps the normalized 42501 forbidden domain error to 403", async () => {
    const service = createService({
      reviewProof: mock(async () => {
        throw new Error("Actor is not authorized to review sponsorship pledges");
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
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Actor is not authorized to review sponsorship pledges");
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

  test("cancelPledge maps a not-found domain error to 404 via domainError", async () => {
    const service = createService({
      cancelPledge: mock(async () => {
        throw new Error("Sponsorship pledge not found");
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
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Sponsorship pledge not found");
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
