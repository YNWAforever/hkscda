import { describe, expect, mock, test } from "bun:test";

import { createSponsorshipAdminHandlers } from "./http.server";

const pledgeId = "11111111-2222-4333-8444-555555555555";
const assignmentId = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const animalId = "11111111-2222-4333-8444-555555555555";
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
    assignAnimal: mock(async () => ({ id: assignmentId })),
    endAssignment: mock(async () => {}),
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

  // The message is raised verbatim by the RPCs with the actor uuid interpolated
  // in, so it is asserted here exactly as the database produces it.
  test("reviewProof maps the normalized 42501 forbidden domain error to 403", async () => {
    const actorMessage = `Actor ${admin.authUserId} is not an active staff/admin user`;
    const service = createService({
      reviewProof: mock(async () => {
        throw new Error(actorMessage);
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
    expect(body.error).toBe(actorMessage);
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

  test("assignAnimal returns 201 with the created assignment", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.assignAnimal({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ animalId }),
      }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe(assignmentId);
  });

  // The RPC interpolates the animal id into this message, so it cannot be
  // matched by an exact-match set. Staff hit it when the animal was adopted or
  // died between loading the page and confirming -- a retryable race, so it has
  // to surface as 409 rather than the generic 500 fallback.
  test("assignAnimal maps the interpolated animal-ineligible error to 409", async () => {
    const message = `Animal ${animalId} cannot be sponsored`;
    const service = createService({
      assignAnimal: mock(async () => {
        throw new Error(message);
      }),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.assignAnimal({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ animalId }),
      }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe(message);
  });

  test("assignAnimal maps a missing animal to 404", async () => {
    const service = createService({
      assignAnimal: mock(async () => {
        throw new Error("Animal not found");
      }),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.assignAnimal({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ animalId }),
      }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(404);
  });

  test("endAssignment returns 200 ok on success", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.endAssignment({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ reason: "adopted" }),
      }),
      params: { id: pledgeId, assignmentId },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  test("endAssignment maps a missing assignment to 404", async () => {
    const service = createService({
      endAssignment: mock(async () => {
        throw new Error("Sponsorship assignment not found");
      }),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.endAssignment({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ reason: "adopted" }),
      }),
      params: { id: pledgeId, assignmentId },
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Sponsorship assignment not found");
  });

  test("endAssignment maps an already-ended assignment to 409", async () => {
    const service = createService({
      endAssignment: mock(async () => {
        throw new Error("Sponsorship assignment is already ended");
      }),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.endAssignment({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ reason: "adopted" }),
      }),
      params: { id: pledgeId, assignmentId },
    });
    expect(response.status).toBe(409);
  });

  test("endAssignment returns 400 for a non-uuid assignmentId", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.endAssignment({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ reason: "adopted" }),
      }),
      params: { id: pledgeId, assignmentId: "not-a-uuid" },
    });
    expect(response.status).toBe(400);
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
