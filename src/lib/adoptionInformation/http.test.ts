import { describe, expect, mock, test } from "bun:test";

import { createAdoptionInformationHandlers } from "./http";

const actorId = "11111111-1111-4111-8111-111111111111";
const admin = { authUserId: actorId };

function createService(overrides: Record<string, unknown> = {}) {
  return {
    listAdmin: mock(async () => ({ items: [], total: 0 })),
    upsertFee: mock(async () => ({ id: "fee-1" })),
    updateFeeContent: mock(async () => ({ id: "fee-1", version: 2 })),
    reorderFees: mock(async () => [
      { id: "fee-1", version: 3 },
      { id: "fee-2", version: 2 },
    ]),
    createEstate: mock(async () => ({ id: "estate-1", version: 1, isPublished: false })),
    updateEstate: mock(async () => ({ id: "estate-1", version: 2, isPublished: true })),
    setEstatePublication: mock(async () => ({ id: "estate-1", version: 2, isPublished: true })),
    deleteEstate: mock(async () => undefined),
    upsertRule: mock(async () => ({ id: "rule-1" })),
    upsertCareTopic: mock(async () => ({ id: "topic-1" })),
    ...overrides,
  };
}

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("createAdoptionInformationHandlers.upsert", () => {
  test("missing estate deletion returns 404", async () => {
    const service = createService({
      deleteEstate: async () => {
        throw { code: "P0002", message: "missing" };
      },
    });
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin: async () => admin,
      service,
    });
    const response = await handlers.deleteEstate({
      request: request("http://localhost/x", {
        method: "DELETE",
        body: JSON.stringify({ id: "22222222-2222-4222-8222-222222222222" }),
      }),
    });
    expect(response.status).toBe(404);
  });

  test("resource=fee returns 201 with { fee } and calls service.upsertFee", async () => {
    const service = createService();
    const requireAdoptionInformationAdmin = mock(async () => admin);
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin,
      service,
    });

    const input = {
      animalType: "dog",
      itemName: "Vaccination",
      priceHkd: "$500",
      sortOrder: 1,
      isPublished: true,
    };
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ resource: "fee", input }),
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ fee: { id: "fee-1" } });
    expect(service.upsertFee).toHaveBeenCalledWith({ actorUserId: actorId, input });
    expect(service.createEstate).not.toHaveBeenCalled();
    expect(service.upsertRule).not.toHaveBeenCalled();
    expect(service.upsertCareTopic).not.toHaveBeenCalled();
  });

  test("estate create returns canonical unpublished row with 201", async () => {
    const service = createService();
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin: async () => admin,
      service,
    });
    const input = {
      id: "22222222-2222-4222-8222-222222222222",
      estateName: "Harbourview Estate",
      district: "Kowloon",
      notes: null,
      sortOrder: 1,
    };
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ resource: "estate", command: "create", input }),
      }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      estate: { id: "estate-1", version: 1, isPublished: false },
    });
    expect(service.createEstate).toHaveBeenCalledWith({ actorUserId: actorId, input });
  });

  test("estate publication invokes only the publication command", async () => {
    const service = createService();
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin: async () => admin,
      service,
    });
    const input = {
      id: "22222222-2222-4222-8222-222222222222",
      expectedVersion: 1,
      isPublished: true,
    };
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ resource: "estate", command: "publication", input }),
      }),
    });
    expect(response.status).toBe(200);
    expect(service.setEstatePublication).toHaveBeenCalledWith({ actorUserId: actorId, input });
    expect(service.updateEstate).not.toHaveBeenCalled();
  });

  test("old estate upsert cannot bypass the versioned commands", async () => {
    const service = createService();
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin: async () => admin,
      service,
    });
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({
          resource: "estate",
          input: {
            estateName: "Old",
            district: "Kowloon",
            notes: null,
            sortOrder: 0,
            isPublished: true,
          },
        }),
      }),
    });
    expect(response.status).toBe(400);
    expect(service.createEstate).not.toHaveBeenCalled();
  });

  test("resource=rule returns 201 with { rule } and calls service.upsertRule", async () => {
    const service = createService();
    const requireAdoptionInformationAdmin = mock(async () => admin);
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin,
      service,
    });

    const input = {
      content: { "zh-HK": "領養前請詳閱守則", en: "Please read the rules before adopting" },
      sortOrder: 1,
      isPublished: true,
    };
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ resource: "rule", input }),
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ rule: { id: "rule-1" } });
    expect(service.upsertRule).toHaveBeenCalledWith({ actorUserId: actorId, input });
    expect(service.upsertCareTopic).not.toHaveBeenCalled();
  });

  test("resource=careTopic returns 201 with { careTopic } and calls service.upsertCareTopic", async () => {
    const service = createService();
    const requireAdoptionInformationAdmin = mock(async () => admin);
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin,
      service,
    });

    const input = {
      animalType: "cat",
      label: { "zh-HK": "餵飼", en: "Feeding" },
      content: { "zh-HK": "每日餵飼兩次", en: "Feed twice a day" },
      sortOrder: 1,
      isPublished: true,
    };
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ resource: "careTopic", input }),
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ careTopic: { id: "topic-1" } });
    expect(service.upsertCareTopic).toHaveBeenCalledWith({ actorUserId: actorId, input });
    expect(service.upsertRule).not.toHaveBeenCalled();
  });

  test("returns 400 with an issues array when a rule is missing its required content", async () => {
    const service = createService();
    const requireAdoptionInformationAdmin = mock(async () => admin);
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin,
      service,
    });

    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({
          resource: "rule",
          input: { sortOrder: 1, isPublished: true },
        }),
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(service.upsertRule).not.toHaveBeenCalled();
  });

  test("returns 400 with an issues array when a care topic is missing its required content", async () => {
    const service = createService();
    const requireAdoptionInformationAdmin = mock(async () => admin);
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin,
      service,
    });

    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({
          resource: "careTopic",
          input: {
            animalType: "dog",
            label: { "zh-HK": "標籤", en: "Label" },
            sortOrder: 1,
            isPublished: true,
          },
        }),
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(service.upsertCareTopic).not.toHaveBeenCalled();
  });

  test("propagates a Response thrown by requireAdoptionInformationAdmin (auth failure)", async () => {
    const service = createService();
    const requireAdoptionInformationAdmin = mock(async () => {
      throw new Response("Forbidden", { status: 403 });
    });
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin,
      service,
    });

    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ resource: "rule", input: {} }),
      }),
    });

    expect(response.status).toBe(403);
    expect(service.upsertRule).not.toHaveBeenCalled();
  });
  test("fee reorder is one authenticated command and rejects injected sort fields", async () => {
    const service = createService();
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin: async () => admin,
      service,
    });
    const input = {
      firstId: "22222222-2222-4222-8222-222222222222",
      secondId: "33333333-3333-4333-8333-333333333333",
      expectedVersions: { first: 1, second: 1 },
    };
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ resource: "fee", command: "reorder", input }),
      }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).fees).toHaveLength(2);
    expect(service.reorderFees).toHaveBeenCalledTimes(1);
    expect(service.reorderFees).toHaveBeenCalledWith({ actorUserId: actorId, input });
    expect(service.upsertFee).not.toHaveBeenCalled();

    const invalid = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({
          resource: "fee",
          command: "reorder",
          input: { ...input, sortOrder: 999 },
        }),
      }),
    });
    expect(invalid.status).toBe(400);
    expect(service.reorderFees).toHaveBeenCalledTimes(1);
  });

  test("fee content command rejects publication and order fields", async () => {
    const service = createService();
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin: async () => admin,
      service,
    });
    const input = {
      id: "22222222-2222-4222-8222-222222222222",
      expectedVersion: 3,
      itemName: "Edited",
      priceHkd: "HK$100",
    };
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ resource: "fee", command: "content", input }),
      }),
    });
    expect(response.status).toBe(200);
    expect(service.updateFeeContent).toHaveBeenCalledWith({ actorUserId: actorId, input });
    const invalid = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({
          resource: "fee",
          command: "content",
          input: { ...input, isPublished: false, sortOrder: 7 },
        }),
      }),
    });
    expect(invalid.status).toBe(400);
    expect(service.updateFeeContent).toHaveBeenCalledTimes(1);
  });
});
