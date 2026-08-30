import { describe, expect, mock, test } from "bun:test";

import { createAdoptionInformationHandlers } from "./http";

const actorId = "11111111-1111-4111-8111-111111111111";
const admin = { authUserId: actorId };

function createService(overrides: Record<string, unknown> = {}) {
  return {
    listAdmin: mock(async () => ({ items: [], total: 0 })),
    upsertFee: mock(async () => ({ id: "fee-1" })),
    upsertEstate: mock(async () => ({ id: "estate-1" })),
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
    expect(service.upsertEstate).not.toHaveBeenCalled();
    expect(service.upsertRule).not.toHaveBeenCalled();
    expect(service.upsertCareTopic).not.toHaveBeenCalled();
  });

  test("resource=estate returns 201 with { estate } and calls service.upsertEstate", async () => {
    const service = createService();
    const requireAdoptionInformationAdmin = mock(async () => admin);
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin,
      service,
    });

    const input = {
      estateName: "Harbourview Estate",
      district: "Kowloon",
      notes: null,
      sortOrder: 1,
      isPublished: false,
    };
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ resource: "estate", input }),
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ estate: { id: "estate-1" } });
    expect(service.upsertEstate).toHaveBeenCalledWith({ actorUserId: actorId, input });
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
});
