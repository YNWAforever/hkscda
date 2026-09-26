import { describe, expect, test } from "bun:test";
import { hashStatusToken } from "../publicAdoption/statusToken.server";
import {
  fingerprintSponsorshipSubmission,
  lookupSponsorshipPledgeRetry,
} from "./submission.server";

const pledgeId = "cccccccc-dddd-4eee-8fff-000000000000";
const statusToken = "A".repeat(43);
const now = new Date("2026-09-25T00:00:00.000Z");

function clientFor(
  options: {
    storedToken?: string;
    entityId?: string;
    pledgeExists?: boolean;
    revokedAt?: string | null;
    expiresAt?: string;
    fingerprint?: string | null;
  } = {},
) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const client = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return query;
        },
        async maybeSingle() {
          calls.push({ table, filters });
          if (table === "public_status_token") {
            if (
              !options.storedToken ||
              filters.find(([key]) => key === "token_hash")?.[1] !==
                hashStatusToken(options.storedToken)
            ) {
              return { data: null, error: null };
            }
            return {
              data: {
                entity_type: "sponsorship_pledge",
                entity_id: options.entityId ?? pledgeId,
                expires_at: options.expiresAt ?? "2099-01-01T00:00:00.000Z",
                revoked_at: options.revokedAt ?? null,
                submission_fingerprint: options.fingerprint ?? "a".repeat(64),
              },
              error: null,
            };
          }
          return { data: options.pledgeExists ? { id: pledgeId } : null, error: null };
        },
      };
      return query;
    },
  };
  return { client: client as never, calls };
}

describe("lookupSponsorshipPledgeRetry", () => {
  test("returns the same status link only for an active token bound to an existing pledge", async () => {
    const { client, calls } = clientFor({ storedToken: statusToken, pledgeExists: true });
    expect(
      await lookupSponsorshipPledgeRetry(
        client,
        pledgeId,
        statusToken,
        "a".repeat(64),
        "https://example.test",
        now,
      ),
    ).toEqual({
      kind: "recovered",
      pledgeId,
      reference: "SP-CCCCCCCC",
      statusUrl: `https://example.test/sponsors/status/${statusToken}`,
    });
    expect(calls[0]?.filters).toContainEqual(["token_hash", hashStatusToken(statusToken)]);
    expect(JSON.stringify(calls)).not.toContain(statusToken);
  });

  test("rejects a changed payload even when the original status token matches", async () => {
    const { client } = clientFor({ storedToken: statusToken, pledgeExists: true });
    expect(
      await lookupSponsorshipPledgeRetry(
        client,
        pledgeId,
        statusToken,
        "b".repeat(64),
        "https://example.test",
        now,
      ),
    ).toEqual({ kind: "conflict" });
  });

  test("rejects a different token for an existing pledge without revealing its link", async () => {
    const { client } = clientFor({ storedToken: statusToken, pledgeExists: true });
    expect(
      await lookupSponsorshipPledgeRetry(
        client,
        pledgeId,
        "B".repeat(43),
        "a".repeat(64),
        "https://example.test",
        now,
      ),
    ).toEqual({ kind: "forbidden" });
  });

  test("does not claim completion for a pledge row missing its status token", async () => {
    const { client } = clientFor({ pledgeExists: true });
    expect(
      await lookupSponsorshipPledgeRetry(
        client,
        pledgeId,
        statusToken,
        "a".repeat(64),
        "https://example.test",
        now,
      ),
    ).toEqual({ kind: "forbidden" });
  });

  test("rejects a token bound to another pledge and an expired token", async () => {
    const other = clientFor({
      storedToken: statusToken,
      entityId: "other-pledge",
      pledgeExists: true,
    });
    expect(
      await lookupSponsorshipPledgeRetry(
        other.client,
        pledgeId,
        statusToken,
        "a".repeat(64),
        "https://example.test",
        now,
      ),
    ).toEqual({ kind: "forbidden" });
    const expired = clientFor({
      storedToken: statusToken,
      pledgeExists: true,
      expiresAt: "2026-09-24T00:00:00.000Z",
    });
    expect(
      await lookupSponsorshipPledgeRetry(
        expired.client,
        pledgeId,
        statusToken,
        "a".repeat(64),
        "https://example.test",
        now,
      ),
    ).toEqual({ kind: "expired" });
  });
});

test("sponsorship fingerprint survives server-derived animal type but detects changed amount", () => {
  const parsed = {
    statusToken,
    payload: {
      monthlyTier: "custom",
      customAmountCents: 10000,
      turnstileToken: "one",
      animalPreferences: [{ animalId: "animal-1", animalType: "cat" }],
    },
  };
  const original = fingerprintSponsorshipSubmission(parsed as never);
  expect(
    fingerprintSponsorshipSubmission({
      ...parsed,
      payload: {
        ...parsed.payload,
        turnstileToken: "two",
        animalPreferences: [{ animalId: "animal-1", animalType: "dog" }],
      },
    } as never),
  ).toBe(original);
  expect(
    fingerprintSponsorshipSubmission({
      ...parsed,
      payload: { ...parsed.payload, customAmountCents: 20000 },
    } as never),
  ).not.toBe(original);
});
