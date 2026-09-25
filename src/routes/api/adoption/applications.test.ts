import { describe, expect, test } from "bun:test";

import { hashStatusToken } from "../../../lib/publicAdoption/statusToken.server";
import { createAdoptionApplicationsHandler } from "./applications";

const applicationId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const storagePath = `${applicationId}/home/home.jpg`;
const statusToken = "raw-status-token";
const parsed = {
  applicationId,
  statusToken,
  photos: [
    { category: "home", fileName: "home.jpg", mimeType: "image/jpeg", sizeBytes: 10, storagePath },
  ],
  payload: { animalPreferences: [{ animalId: "animal-1", animalType: "cat" }] },
};

function request() {
  return new Request("https://example.test/api/adoption/applications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

function deps(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const base = {
    rateLimit: async () => ({ ok: true }),
    parse: () => parsed as never,
    createClient: () => ({}) as never,
    loadIntent: async () => ({
      applicationId,
      photoPaths: [storagePath],
      statusTokenHash: hashStatusToken(statusToken),
      expiresAt: "2099-01-01T00:00:00.000Z",
      submittedAt: null,
    }),
    hasCompleted: async () => "new" as const,
    markSubmitted: async () => {
      calls.push("markSubmitted");
    },
    readEligible: async () => [{ id: "animal-1", type: "cat" } as never],
    createCoordinatorService: () => ({}) as never,
    persist: async () => {
      calls.push("persist");
      return {
        applicationId,
        caseId: "case-1",
        reference: "APP-AAAAAAAA",
        statusToken,
        statusUrl: `https://example.test/adoption/status/${statusToken}`,
        expiresAt: "2099-02-01T00:00:00.000Z",
      };
    },
    sendEmail: async () => {
      calls.push("sendEmail");
      return "sent" as const;
    },
    appUrl: () => "https://example.test",
    logger: { error: () => {} },
    ...overrides,
  };
  return { dependencies: base, calls };
}

describe("public adoption submission authorization and retry", () => {
  test("rejects an upload token that does not match the stored intent", async () => {
    const { dependencies, calls } = deps({
      loadIntent: async () => ({
        applicationId,
        photoPaths: [storagePath],
        statusTokenHash: hashStatusToken("other"),
        expiresAt: "2099-01-01T00:00:00.000Z",
        submittedAt: null,
      }),
    });
    const response = await createAdoptionApplicationsHandler(dependencies)(request());
    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  test("returns a saved application's status URL on same-ID retry", async () => {
    const { dependencies, calls } = deps({ hasCompleted: async () => "recovered" as const });
    const response = await createAdoptionApplicationsHandler(dependencies)(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      applicationId,
      reference: "APP-AAAAAAAA",
      statusUrl: `https://example.test/adoption/status/${statusToken}`,
    });
    expect(calls).toEqual(["markSubmitted"]);
  });

  test("does not report a changed completed application as accepted", async () => {
    const { dependencies, calls } = deps({ hasCompleted: async () => "conflict" as const });
    const response = await createAdoptionApplicationsHandler(dependencies)(request());
    expect(response.status).toBe(409);
    expect(calls).toEqual([]);
  });

  test("does not return an expired status link as successful recovery", async () => {
    const { dependencies, calls } = deps({ hasCompleted: async () => "expired" as const });
    const response = await createAdoptionApplicationsHandler(dependencies)(request());
    expect(response.status).toBe(410);
    expect(calls).toEqual([]);
  });

  test("recovers a concurrent submission that commits after the first completion check", async () => {
    let completionChecks = 0;
    const { dependencies, calls } = deps({
      hasCompleted: async () => (++completionChecks === 1 ? "new" : "recovered"),
      persist: async () => {
        calls.push("persist");
        throw new Error("duplicate application id");
      },
    });

    const response = await createAdoptionApplicationsHandler(dependencies)(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      applicationId,
      reference: "APP-AAAAAAAA",
      statusUrl: "https://example.test/adoption/status/" + statusToken,
    });
    expect(completionChecks).toBe(2);
    expect(calls).toEqual(["persist", "markSubmitted"]);
  });

  test("does not recover a failed concurrent submission with different saved details", async () => {
    let completionChecks = 0;
    const { dependencies, calls } = deps({
      hasCompleted: async () => (++completionChecks === 1 ? "new" : "conflict"),
      persist: async () => {
        calls.push("persist");
        throw new Error("duplicate application id");
      },
    });

    const response = await createAdoptionApplicationsHandler(dependencies)(request());

    expect(response.status).toBe(409);
    expect(completionChecks).toBe(2);
    expect(calls).toEqual(["persist"]);
  });

  test("asks a concurrent retry to wait while another request is still saving", async () => {
    let completionChecks = 0;
    const { dependencies, calls } = deps({
      hasCompleted: async () => (++completionChecks === 1 ? "new" : "processing"),
      persist: async () => {
        calls.push("persist");
        throw new Error("duplicate application id");
      },
    });

    const response = await createAdoptionApplicationsHandler(dependencies)(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(completionChecks).toBe(2);
    expect(calls).toEqual(["persist"]);
  });

  test("returns success after persistence even if confirmation email throws", async () => {
    const { dependencies, calls } = deps({
      sendEmail: async () => {
        throw new Error("email transport unavailable");
      },
    });
    const response = await createAdoptionApplicationsHandler(dependencies)(request());
    expect(response.status).toBe(201);
    expect(calls).toEqual(["persist", "markSubmitted"]);
  });
});
