import { describe, expect, test } from "bun:test";
import * as module from "./pledges";
import { ZodError } from "zod";

const pledgeId = "cccccccc-dddd-4eee-8fff-000000000000";
const statusToken = "A".repeat(43);
const statusUrl = `https://example.test/sponsors/status/${statusToken}`;

function request() {
  return new Request("https://example.test/api/sponsorships/pledges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

function setup(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const parsed = {
    pledgeId,
    statusToken,
    payload: {
      turnstileToken: "turnstile",
      animalPreferences: [{ animalId: "animal-1", animalType: "cat" }],
      terms: { agreed: true, version: "current-version" },
    },
  };
  const dependencies = {
    rateLimit: async () => ({ ok: true }),
    parse: () => parsed,
    createClient: () => ({}),
    lookupRetry: async () => ({ kind: "new" }),
    verify: async () => {
      calls.push("verify");
      return true;
    },
    readEligible: async () => [{ id: "animal-1", type: "cat" }],
    loadCurrentTerms: async () => ({ version: "current-version" }),
    persist: async () => {
      calls.push("persist");
      return { pledgeId, reference: "SP-CCCCCCCC", statusUrl };
    },
    sendEmail: async () => {
      calls.push("sendEmail");
      return "sent";
    },
    logger: { error: () => {} },
    ...overrides,
  };
  return { calls, dependencies };
}

async function invoke(dependencies: Record<string, unknown>) {
  const factory = (module as Record<string, unknown>).createSponsorshipPledgesHandler;
  expect(factory).toBeFunction();
  if (typeof factory !== "function") throw new Error("missing sponsorship handler");
  return factory(dependencies)(request()) as Promise<Response>;
}

describe("sponsorship pledge submission retry", () => {
  test("returns field reasons for a malformed submission without echoing its data", async () => {
    const { dependencies } = setup({
      parse: () => {
        throw new ZodError([
          { code: "custom", path: ["contact", "email"], message: "Invalid email" },
        ]);
      },
    });
    const response = await invoke(dependencies);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid sponsorship pledge request",
      fields: [{ field: "contact.email", reason: "Invalid email" }],
    });
  });

  test("keeps new submissions closed without a published approved terms document", async () => {
    const { calls, dependencies } = setup({ loadCurrentTerms: async () => null });
    const response = await invoke(dependencies);
    expect(response.status).toBe(503);
    expect(calls).toEqual([]);
  });

  test("rejects a stale terms version before verification or persistence", async () => {
    const { calls, dependencies } = setup({
      loadCurrentTerms: async () => ({ version: "new-version" }),
      parse: () => ({
        pledgeId,
        statusToken,
        payload: {
          terms: { agreed: true, version: "old-version" },
          animalPreferences: [{ animalId: "animal-1", animalType: "cat" }],
        },
      }),
    });
    const response = await invoke(dependencies);
    expect(response.status).toBe(409);
    expect(calls).toEqual([]);
  });

  test("a verified proof intent permits persistence without reusing the Turnstile token", async () => {
    const { calls, dependencies } = setup({
      parse: () => ({
        pledgeId,
        statusToken,
        payload: {
          terms: { agreed: true, version: "current-version" },
          animalPreferences: [{ animalId: "animal-1", animalType: "cat" }],
        },
        proof: { storagePath: pledgeId + "/proof/receipt.jpg", proofIntent: "signed" },
      }),
      verify: async () => {
        throw new Error("Turnstile must not be reused");
      },
      verifyProofIntent: () => {
        calls.push("verifyProofIntent");
        return true;
      },
    });
    const response = await invoke(dependencies);
    expect(response.status).toBe(201);
    expect(calls).toEqual(["verifyProofIntent", "persist", "sendEmail"]);
  });

  test("a proof submission requires its signed upload intent before persistence", async () => {
    const { calls, dependencies } = setup({
      parse: () => ({
        pledgeId,
        statusToken,
        payload: {
          terms: { agreed: true, version: "current-version" },
          animalPreferences: [{ animalId: "animal-1", animalType: "cat" }],
        },
        proof: { storagePath: pledgeId + "/proof/receipt.jpg", proofIntent: "invalid" },
      }),
      verifyProofIntent: () => false,
    });
    const response = await invoke(dependencies);
    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  test("an already-submitted proof intent cannot create a second pledge for another bearer", async () => {
    const { calls, dependencies } = setup({
      parse: () => ({
        pledgeId,
        statusToken: "B".repeat(43),
        payload: {
          terms: { agreed: true, version: "current-version" },
          animalPreferences: [{ animalId: "animal-1", animalType: "cat" }],
        },
        proof: { storagePath: pledgeId + "/proof/receipt.jpg", proofIntent: "signed" },
      }),
      lookupRetry: async () => ({ kind: "forbidden" }),
      verifyProofIntent: () => {
        throw new Error("must stop before reusing intent");
      },
    });
    const response = await invoke(dependencies);
    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  test("rejects an oversized JSON body before submission work", async () => {
    const { calls, dependencies } = setup();
    const factory = (module as Record<string, unknown>).createSponsorshipPledgesHandler;
    expect(factory).toBeFunction();
    if (typeof factory !== "function") throw new Error("missing sponsorship handler");
    const oversized = new Request("https://example.test/api/sponsorships/pledges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(2 * 1024 * 1024) }),
    });
    expect(oversized.headers.has("content-length")).toBe(false);

    const response = (await factory(dependencies)(oversized)) as Response;
    expect(response.status).toBe(413);
    expect(calls).toEqual([]);
  });
  test("returns the original status link for a matching completed attempt without re-verifying or resending", async () => {
    const { calls, dependencies } = setup({
      lookupRetry: async () => ({
        kind: "recovered",
        pledgeId,
        reference: "SP-CCCCCCCC",
        statusUrl,
      }),
    });
    const response = await invoke(dependencies);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pledgeId, reference: "SP-CCCCCCCC", statusUrl });
    expect(calls).toEqual([]);
  });

  test("returns conflict without persisting a changed completed attempt", async () => {
    const { calls, dependencies } = setup({ lookupRetry: async () => ({ kind: "conflict" }) });
    const response = await invoke(dependencies);
    expect(response.status).toBe(409);
    expect(calls).toEqual([]);
  });

  test("never reveals a status link when the token does not belong to the pledge", async () => {
    const { calls, dependencies } = setup({ lookupRetry: async () => ({ kind: "forbidden" }) });
    const response = await invoke(dependencies);
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain(statusUrl);
    expect(calls).toEqual([]);
  });

  test("still returns created status after a post-save email exception", async () => {
    const { calls, dependencies } = setup({
      sendEmail: async () => {
        calls.push("sendEmail");
        throw new Error("email config unavailable");
      },
    });
    const response = await invoke(dependencies);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ pledgeId, reference: "SP-CCCCCCCC", statusUrl });
    expect(calls).toEqual(["verify", "persist", "sendEmail"]);
  });

  test("recovers a concurrent completed request after a duplicate insert failure", async () => {
    let lookups = 0;
    const { calls, dependencies } = setup({
      lookupRetry: async () =>
        ++lookups === 1
          ? { kind: "new" }
          : { kind: "recovered", pledgeId, reference: "SP-CCCCCCCC", statusUrl },
      persist: async () => {
        calls.push("persist");
        throw new Error("duplicate pledge id");
      },
    });
    const response = await invoke(dependencies);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pledgeId, reference: "SP-CCCCCCCC", statusUrl });
    expect(calls).toEqual(["verify", "persist"]);
  });
});
