import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { expectNoChineseText } from "../../components/admin/i18n/testing";

mock.module("../supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "session-token", user: { id: "auth-1" } } },
      }),
    },
  },
}));

const { fetchAdminJson } = await import("../admin/session");
const { createSponsorshipAdminHandlers } = await import("./http.server");
const { createSupabaseSponsorshipAdminRepository } = await import("./repository.server");
const { createSponsorshipAdminService } = await import("./service");
const { sponsorshipServerErrorCode, sponsorshipServerErrorText } = await import("./serverErrors");

const pledgeId = "11111111-2222-4333-8444-555555555555";
const proofId = "33333333-4444-4333-8444-555555555555";
const admin = {
  id: "admin-1",
  authUserId: "auth-1",
  email: "a@b.com",
  role: "treasurer" as const,
  status: "active" as const,
};

/** The pledge as the service reads it before a review; only what a review looks at. */
const pledge = {
  id: pledgeId,
  supporterEmail: null,
  assignments: [],
  preferences: [],
} as never;

/**
 * A review sent through the real chain: the handler, the service and the repository, with only the
 * database's answer to `review_exact_sponsorship_payment_proof` faked. The reply is read the way the
 * browser reads it, by `fetchAdminJson`, so what is checked is the error the admin screen gets.
 */
async function reviewAnswering(rpcData: unknown) {
  const client = { rpc: async () => ({ data: rpcData, error: null }) } as unknown as SupabaseClient;
  const repo = {
    ...createSupabaseSponsorshipAdminRepository(client),
    getPledgeDetail: async () => pledge,
  };
  const service = createSponsorshipAdminService({
    repo,
    client,
    sendPledgeStatusUpdateEmail: async () => undefined,
  });
  const asAdmin = async () => admin;
  const handlers = createSponsorshipAdminHandlers({
    requireReader: asAdmin,
    requireFinance: asAdmin,
    requireCoordinator: asAdmin,
    service,
  });
  globalThis.fetch = (async (_url: string, init: RequestInit) =>
    handlers.reviewProof({
      request: new Request("http://localhost/api/admin/sponsorships/pledges/x/review", init),
      params: { id: pledgeId },
    })) as unknown as typeof fetch;
  const failure = await fetchAdminJson(`/api/admin/sponsorships/pledges/${pledgeId}/review`, {
    method: "POST",
    body: JSON.stringify({
      decision: "approve",
      proofId,
      expectedRevision: 1,
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
    }),
  }).catch((error: unknown) => error);
  return failure;
}

describe("the one sponsorship server message that is not English", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("a review of a proof that changed reaches the browser as the zh-HK text, and has a code", async () => {
    for (const kind of ["conflict", "not_found"]) {
      const failure = await reviewAnswering({ kind });
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe("付款證明或審批資料已更新，請重新載入。");
      expect((failure as Error).message).toBe(sponsorshipServerErrorText("proofReviewChanged"));
      expect(sponsorshipServerErrorCode(failure)).toBe("proofReviewChanged");
    }
  });

  test("a review that works is not an error", async () => {
    const result = await reviewAnswering({
      kind: "reviewed",
      proofId,
      revision: 2,
      decision: "approve",
      allocations: [],
    });
    expect(result).toMatchObject({ kind: "reviewed" });
  });

  test("the English message says what to do next, and has no Chinese", () => {
    const english = sponsorshipServerErrorText("proofReviewChanged", "en");
    expectNoChineseText(english);
    expect(english).toBe(
      "The payment proof or review changed. Reload the pledge and review it again.",
    );
  });

  test("only that exact text has a code; any other error is shown as it came", () => {
    expect(
      sponsorshipServerErrorCode(new Error("Sponsorship pledge is already cancelled")),
    ).toBeNull();
    expect(sponsorshipServerErrorCode(new Error("付款證明或審批資料已更新"))).toBeNull();
    expect(sponsorshipServerErrorCode("付款證明或審批資料已更新，請重新載入。")).toBeNull();
    expect(sponsorshipServerErrorCode(undefined)).toBeNull();
  });
});
