import { describe, expect, test } from "bun:test";
import * as module from "./pledges";

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
