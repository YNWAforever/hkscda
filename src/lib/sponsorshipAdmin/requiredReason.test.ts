import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSponsorshipAdminHandlers } from "./http.server";
import type { SponsorshipAdminRepository } from "./repository.server";
import { createSponsorshipAdminService } from "./service";
import type { PaymentProofRecord, PledgeDetail } from "./types";

const pledgeId = "11111111-2222-4333-8444-555555555555";
const review = {
  proofId: "33333333-3333-4333-8333-333333333333",
  expectedRevision: 1,
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
};
const admin = {
  id: "admin-1",
  authUserId: "auth-1",
  email: "a@b.com",
  role: "staff" as const,
  status: "active" as const,
};

const proof: PaymentProofRecord = {
  id: review.proofId,
  revision: 1,
  pledgeId,
  storagePath: "sponsorship-payment-proof/pledge-1/proof.jpg",
  fileName: "proof.jpg",
  fileType: "image/jpeg",
  fileSize: 1024,
  paymentMethod: "fps",
  reference: null,
  amountCents: 30000,
  paymentDate: "2026-07-01",
  reviewStatus: "pending",
  source: "staff",
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: "2026-07-01T00:00:00.000Z",
};

function detail(overrides: Partial<PledgeDetail> = {}): PledgeDetail {
  return {
    id: pledgeId,
    supporterId: "supporter-1",
    supporterName: "Chan",
    supporterEmail: null,
    monthlyTier: "300",
    amountCents: 30000,
    currency: "HKD",
    language: "zh-HK",
    status: "provisional",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    notes: null,
    supporterPhone: null,
    preferences: [],
    proofHistory: [],
    currentProof: proof,
    periods: [],
    assignments: [],
    needsAnimal: false,
    recentAuditLog: [],
    ...overrides,
  };
}

/** The real service and handlers over a fake repository, so a 400 comes from the real schemas. */
function setup() {
  const repo = {
    getPledgeDetail: mock(async () => detail()),
    reviewProof: mock(async () => ({ replayed: false })),
    cancelPledge: mock(async () => {}),
  } as unknown as SponsorshipAdminRepository;
  const service = createSponsorshipAdminService({
    repo,
    client: {} as SupabaseClient,
    sendPledgeStatusUpdateEmail: async () => "sent",
  });
  const as = async () => admin;
  const handlers = createSponsorshipAdminHandlers({
    requireReader: as,
    requireFinance: as,
    requireCoordinator: as,
    service,
  });
  return { repo, handlers };
}

function post(body: unknown) {
  return new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
}

const BLANK_AND_LONG = [
  ["no note", undefined],
  ["a blank note", "   "],
  ["a 501-character note", "x".repeat(501)],
] as const;

describe("cancelling a sponsorship pledge needs a reason", () => {
  for (const [label, note] of BLANK_AND_LONG) {
    // required-reason: sponsorship_pledge.cancel
    test(`${label} returns 400 before the repository is called`, async () => {
      const { repo, handlers } = setup();
      const response = await handlers.cancelPledge({
        request: post(note === undefined ? {} : { note }),
        params: { id: pledgeId },
      });
      expect(response.status).toBe(400);
      expect(repo.getPledgeDetail).not.toHaveBeenCalled();
      expect(repo.cancelPledge).not.toHaveBeenCalled();
    });
  }

  // required-reason: sponsorship_pledge.cancel
  test("the trimmed note reaches the repository", async () => {
    const { repo, handlers } = setup();
    const response = await handlers.cancelPledge({
      request: post({ note: "  Sponsor asked to stop  " }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(200);
    expect(repo.cancelPledge).toHaveBeenCalledWith({
      pledgeId,
      actorUserId: admin.authUserId,
      note: "Sponsor asked to stop",
    });
  });

  // required-reason: sponsorship_pledge.cancel
  test("a 500-character note passes", async () => {
    const { handlers } = setup();
    const response = await handlers.cancelPledge({
      request: post({ note: "x".repeat(500) }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(200);
  });
});

describe("rejecting a payment proof needs a reason; approving does not", () => {
  const command = (decision: "approve" | "reject", note?: string) => ({
    ...review,
    decision,
    ...(note === undefined ? {} : { note }),
  });

  for (const [label, note] of BLANK_AND_LONG) {
    // required-reason: sponsorship_proof.reject
    test(`rejecting with ${label} returns 400 before the repository is called`, async () => {
      const { repo, handlers } = setup();
      const response = await handlers.reviewProof({
        request: post(command("reject", note)),
        params: { id: pledgeId },
      });
      expect(response.status).toBe(400);
      expect(repo.getPledgeDetail).not.toHaveBeenCalled();
      expect(repo.reviewProof).not.toHaveBeenCalled();
    });
  }

  // required-reason: sponsorship_proof.reject
  test("the trimmed reject note reaches the repository", async () => {
    const { repo, handlers } = setup();
    const response = await handlers.reviewProof({
      request: post(command("reject", "  Blurry receipt  ")),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(200);
    expect(repo.reviewProof).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "reject", note: "Blurry receipt" }),
    );
  });

  // required-reason: sponsorship_proof.reject
  test("approving with no note, or with a blank one, still passes", async () => {
    for (const note of [undefined, "   "]) {
      const { repo, handlers } = setup();
      const response = await handlers.reviewProof({
        request: post(command("approve", note)),
        params: { id: pledgeId },
      });
      expect(response.status).toBe(200);
      expect(repo.reviewProof).toHaveBeenCalledWith(
        expect.objectContaining({ decision: "approve", note: null }),
      );
    }
  });
});
