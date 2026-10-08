import { describe, expect, test } from "bun:test";

import type { AdminUser } from "../../donations/supabase.server";
import type { AnimalPositionRecord, ArrivalSourceRecord, MatchableAnimalOption } from "../types";
import {
  createAnimalLookupHandlers,
  type AnimalLookupService,
} from "./animalLookupHandlers.server";

const staff: AdminUser = {
  id: "staff-row",
  authUserId: "22222222-3333-4333-8444-555555555555",
  email: "staff@example.com",
  role: "staff",
  status: "active",
};

const animal: MatchableAnimalOption = {
  id: "aaaaaaaa-bbbb-4333-8444-555555555555",
  name: "麻糬",
  name_en: "Mochi",
  type: "cat",
  status: "available",
};

const position: AnimalPositionRecord = {
  id: "bbbbbbbb-cccc-4333-8444-555555555555",
  name: "Foster home",
  type: "foster",
  for_cat: true,
  for_dog: false,
  address: null,
  contact_person: "Ada",
  phone: null,
  email: null,
  is_active: true,
};

const source: ArrivalSourceRecord = {
  id: "cccccccc-dddd-4333-8444-555555555555",
  name_zh: "街頭救援",
  name_en: "Street rescue",
  is_active: true,
};

function createService() {
  const calls: string[] = [];
  const service = {
    async listMatchableAnimals() {
      calls.push("listMatchableAnimals");
      return [animal];
    },
    async listAnimalPositions() {
      calls.push("listAnimalPositions");
      return [position];
    },
    async listArrivalSources() {
      calls.push("listArrivalSources");
      return [source];
    },
  } satisfies AnimalLookupService;

  return { calls, service };
}

function getRequest(path: string) {
  return new Request(`https://example.test/api/admin/adoptions/${path}`);
}

describe("createAnimalLookupHandlers", () => {
  test("lists matchable animals after authorization", async () => {
    const { calls, service } = createService();
    const authCalls: string[] = [];
    const handlers = createAnimalLookupHandlers({
      requireCoordinator: async () => {
        authCalls.push("coordinator");
        return staff;
      },
      service,
    });

    const response = await handlers.listMatchableAnimals({
      request: getRequest("animals/match-options"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ animals: [animal] });
    expect(authCalls).toEqual(["coordinator"]);
    expect(calls).toEqual(["listMatchableAnimals"]);
  });

  test("lists positions after authorization", async () => {
    const { calls, service } = createService();
    const authCalls: string[] = [];
    const handlers = createAnimalLookupHandlers({
      requireCoordinator: async () => {
        authCalls.push("coordinator");
        return staff;
      },
      service,
    });

    const response = await handlers.listAnimalPositions({ request: getRequest("positions") });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ positions: [position] });
    expect(authCalls).toEqual(["coordinator"]);
    expect(calls).toEqual(["listAnimalPositions"]);
  });

  test("lists arrival sources after authorization", async () => {
    const { calls, service } = createService();
    const authCalls: string[] = [];
    const handlers = createAnimalLookupHandlers({
      requireCoordinator: async () => {
        authCalls.push("coordinator");
        return staff;
      },
      service,
    });

    const response = await handlers.listArrivalSources({
      request: getRequest("arrival-sources"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ arrivalSources: [source] });
    expect(authCalls).toEqual(["coordinator"]);
    expect(calls).toEqual(["listArrivalSources"]);
  });

  for (const [label, refusal] of [
    ["403", Response.json({ error: "Forbidden" }, { status: 403 })],
    ["401", Response.json({ error: "Unauthorized" }, { status: 401 })],
  ] as const) {
    test(`refuses before reading when the coordinator check fails with ${label}`, async () => {
      const { calls, service } = createService();
      const handlers = createAnimalLookupHandlers({
        requireCoordinator: async () => {
          throw refusal.clone();
        },
        service,
      });

      const responses = [
        await handlers.listMatchableAnimals({ request: getRequest("animals/match-options") }),
        await handlers.listAnimalPositions({ request: getRequest("positions") }),
        await handlers.listArrivalSources({ request: getRequest("arrival-sources") }),
      ];

      for (const response of responses) {
        expect(response.status).toBe(refusal.status);
        expect(await response.json()).toEqual(await refusal.clone().json());
      }
      expect(calls).toEqual([]);
    });
  }
});
