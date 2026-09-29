import { expect, test } from "bun:test";
import { createSponsorshipPledgesHandler } from "./pledges";
import {
  fingerprintSponsorshipSubmission,
  parseSponsorshipSubmission,
} from "../../../lib/sponsorship/submission.server";

const pledgeId = "cccccccc-dddd-4eee-8fff-000000000000";
const statusToken = "A".repeat(43);
const legacyVersion = "sponsorship-terms-2026-07";
function body(version?: string) {
  return {
    pledgeId,
    statusToken,
    payload: {
      language: "zh-HK",
      monthlyTier: "300",
      animalPreferences: [
        {
          rank: 1,
          animalId: "11111111-2222-4333-8444-555555555555",
          animalName: "Synthetic",
          animalType: "sponsor",
        },
      ],
      contact: { supporterName: "Synthetic", email: "test@example.test", phone: "91234567" },
      consents: { email: false, whatsapp: false },
      terms: { agreed: true, ...(version ? { version } : {}) },
    },
  };
}
for (const version of [legacyVersion, undefined]) {
  test(`recovers completed legacy retry with ${version ? "explicit" : "historically defaulted"} terms`, async () => {
    const normalized = parseSponsorshipSubmission(body("a".repeat(64)));
    normalized.payload.terms.version = legacyVersion;
    const expectedFingerprint = fingerprintSponsorshipSubmission(normalized);
    let lookups = 0;
    const handler = createSponsorshipPledgesHandler({
      rateLimit: async () => ({ ok: true }),
      createClient: () =>
        ({}) as ReturnType<
          typeof import("../../../lib/donations/supabase.server").createSupabaseServiceClient
        >,
      lookupRetry: async (_client, id, token, fingerprint) => {
        lookups++;
        expect([id, token, fingerprint]).toEqual([pledgeId, statusToken, expectedFingerprint]);
        return {
          kind: "recovered",
          pledgeId,
          reference: "SP-CCCCCCCC",
          statusUrl: "https://example.test/status/original",
        };
      },
      loadCurrentTerms: async () => {
        throw new Error("completed retry must not reload terms");
      },
      persist: async () => {
        throw new Error("completed retry must not write");
      },
      sendEmail: async () => {
        throw new Error("completed retry must not resend");
      },
      logger: { error: () => {} },
    });
    const response = await handler(
      new Request("https://example.test/api/sponsorships/pledges", {
        method: "POST",
        body: JSON.stringify(body(version)),
      }),
    );
    expect(response.status).toBe(200);
    expect(lookups).toBe(1);
  });
}

test("legacy terms cannot authorize a new pledge", async () => {
  let writes = 0;
  const handler = createSponsorshipPledgesHandler({
    rateLimit: async () => ({ ok: true }),
    createClient: () =>
      ({}) as ReturnType<
        typeof import("../../../lib/donations/supabase.server").createSupabaseServiceClient
      >,
    lookupRetry: async () => ({ kind: "new" }),
    loadCurrentTerms: async () => ({
      version: "a".repeat(64),
      title: "Synthetic",
      documentUrl: "https://example.invalid/terms.pdf",
      documentDate: "2026-09-29",
    }),
    persist: async () => {
      writes++;
      throw new Error("must not write");
    },
    logger: { error: () => {} },
  });
  const response = await handler(
    new Request("https://example.test/api/sponsorships/pledges", {
      method: "POST",
      body: JSON.stringify(body(legacyVersion)),
    }),
  );
  expect(response.status).toBe(409);
  expect(writes).toBe(0);
});
