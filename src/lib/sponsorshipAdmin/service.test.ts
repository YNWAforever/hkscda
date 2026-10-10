import { describe, expect, mock, test } from "bun:test";

import { createSponsorshipAdminService } from "./service";
import type { PaymentProofRecord, PledgeDetail } from "./types";
import type { SponsorshipAdminRepository as Repo } from "./repository.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pledgeReference } from "../sponsorship/statusSummary";

const fakeClient = {} as SupabaseClient;

function createFakeStorageClient(
  overrides: {
    createSignedUrl?: () => Promise<{ data: { signedUrl: string } | null; error: Error | null }>;
  } = {},
) {
  const createSignedUrl =
    overrides.createSignedUrl ??
    mock(async () => ({ data: { signedUrl: "https://example.com/signed" }, error: null }));

  const client = {
    storage: {
      from: mock(() => ({ createSignedUrl })),
    },
  } as unknown as SupabaseClient;

  return { client, createSignedUrl };
}

const pledgeId = "11111111-2222-4333-8444-555555555555";
const exactReview = {
  proofId: "33333333-3333-4333-8333-333333333333",
  expectedRevision: 1,
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
};
const actorUserId = "22222222-3333-4333-8444-555555555555";

function pendingProof(overrides: Partial<PaymentProofRecord> = {}): PaymentProofRecord {
  return {
    id: "proof-1",
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
    ...overrides,
  };
}

function baseDetail(overrides: Partial<PledgeDetail> = {}): PledgeDetail {
  return {
    id: pledgeId,
    supporterId: "supporter-1",
    supporterName: "陳小姐",
    supporterEmail: "chan@example.com",
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
    currentProof: null,
    periods: [],
    assignments: [],
    needsAnimal: false,
    recentAuditLog: [],
    ...overrides,
  };
}

function createFakeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    listPledges: mock(async () => ({ pledges: [], total: 0 })),
    getPledgeDetail: mock(async () => baseDetail()),
    getProofSigningInfo: mock(async () => null),
    recordPayment: mock(async () => ({ id: "proof-1" })),
    reviewProof: mock(async () => {}),
    cancelPledge: mock(async () => {}),
    assignAnimal: mock(async () => ({ id: "asg-1" })),
    endAssignment: mock(async () => {}),
    ...overrides,
  } as Repo;
}

function createFakeSender() {
  const calls: unknown[] = [];
  return {
    calls,
    sendPledgeStatusUpdateEmail: mock(async (...args: unknown[]) => {
      calls.push(args);
      return "sent" as const;
    }),
  };
}

describe("createSponsorshipAdminService", () => {
  const eligibleState = {
    sponsorshipEligible: true,
    status: "available" as const,
    retiredAt: null,
    publicationState: "published" as const,
    deceasedAt: null,
    adoptedAt: null,
  };

  test("listPledges parses search input and delegates to the repository", async () => {
    const repo = createFakeRepo();
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.listPledges({ status: "active", page: "2", pageSize: "10" });

    expect(repo.listPledges).toHaveBeenCalledWith({
      status: "active",
      q: undefined,
      page: 2,
      pageSize: 10,
    });
  });

  test("pending proof filter survives schema parsing and reaches the repository", async () => {
    const repo = createFakeRepo();
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.listPledges({ proof: "pending", page: "2" });

    expect(repo.listPledges).toHaveBeenCalledWith(
      expect.objectContaining({ proof: "pending", page: 2, pageSize: 25 }),
    );
  });

  test("getPledgeDetail returns null when the repository returns null", async () => {
    const repo = createFakeRepo({ getPledgeDetail: mock(async () => null) });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    expect(await service.getPledgeDetail(pledgeId)).toBeNull();
  });

  test("getPledgeDetail flags an open assignment whose animal has left", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "active",
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: null,
              endReason: null,
              note: null,
              endNote: null,
              animalState: { ...eligibleState, status: "adopted" },
              reviewReason: null,
            },
          ],
          preferences: [
            {
              id: "pref-1",
              rank: 1,
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              animalState: { ...eligibleState, status: "adopted" },
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    // Flagging is not ending. The money keeps arriving and the assignment
    // stays open; a person decides what to do about it.
    expect(detail?.assignments[0].reviewReason).toBe("adopted");
  });

  test("getPledgeDetail flags an open assignment whose animal was adopted on its internal profile", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "active",
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: null,
              endReason: null,
              note: null,
              endNote: null,
              // The internal-profile adoption path: the adoptions
              // internal-profile form writes animal_profile_internal.adopted_at
              // and NEVER writes animals.status, so a real adopted animal
              // reaches here still reading status: "available".
              animalState: { ...eligibleState, status: "available", adoptedAt: "2026-08-01" },
              reviewReason: null,
            },
          ],
          preferences: [],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    // Reading only animals.status left this animal unflagged while the
    // supporter kept paying for an animal that had gone home.
    expect(detail?.assignments[0].reviewReason).toBe("adopted");
  });

  test("getPledgeDetail keeps deceased ahead of an internal-profile adoption", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "active",
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: null,
              endReason: null,
              note: null,
              endNote: null,
              animalState: {
                ...eligibleState,
                adoptedAt: "2026-08-01",
                deceasedAt: "2026-08-02",
              },
              reviewReason: null,
            },
          ],
          preferences: [],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    // Precedence is unchanged: death is the reason a person must lead with.
    expect(detail?.assignments[0].reviewReason).toBe("deceased");
  });

  test("getPledgeDetail does not flag an assignment whose animal is fine", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "active",
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: null,
              endReason: null,
              note: null,
              endNote: null,
              animalState: eligibleState,
              reviewReason: null,
            },
          ],
          preferences: [
            {
              id: "pref-1",
              rank: 1,
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              animalState: eligibleState,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    expect(detail?.assignments[0].reviewReason).toBeNull();
  });

  test("getPledgeDetail flags an assignment for an animal that was never shortlisted", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "active",
          // A pledge can hold several concurrent assignments. Only the FIRST is
          // auto-confirmed from the shortlist; every animal a staff member adds
          // by hand afterwards is absent from `preferences` by definition.
          preferences: [],
          assignments: [
            {
              id: "asg-hand-added",
              animalId: "animal-hand-added",
              animalNameSnapshot: "阿花",
              startedOn: "2026-08-01",
              endedOn: null,
              endReason: null,
              note: "added by staff",
              endNote: null,
              animalState: { ...eligibleState, status: "adopted" },
              reviewReason: null,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    // Deriving the flag from the supporter's ranked preferences could never
    // flag this animal: it is on no shortlist, so the lookup missed and the
    // reason came back null. Nobody would be told the animal had been adopted
    // while the supporter kept paying.
    expect(detail?.assignments[0].reviewReason).toBe("adopted");
  });

  test("getPledgeDetail reports a running sponsorship that backs no animal", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "active",
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: "2026-08-01",
              endReason: "adopted",
              note: null,
              endNote: null,
              animalState: null,
              reviewReason: null,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    // The animal was adopted and staff ended the assignment, but the pledge
    // keeps taking payments — so somebody must talk to the supporter.
    expect(detail?.needsAnimal).toBe(true);
  });

  test("getPledgeDetail does not report needsAnimal for a cancelled pledge", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "cancelled", assignments: [] })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    // A cancelled sponsorship takes no more payments, so there is nothing to
    // resolve — flagging it would only add noise to the staff queue.
    expect(detail?.needsAnimal).toBe(false);
  });

  test("getPledgeDetail does not report needsAnimal for a pledge with no payment yet", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "pending_payment", assignments: [] })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    // Nothing has been paid yet, so having no animal is simply what a
    // brand-new pledge looks like — not something staff need to resolve.
    expect(detail?.needsAnimal).toBe(false);
  });

  test("getPledgeDetail reports needsAnimal for an active pledge with no assignment at all", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active", assignments: [] })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    // Auto-assign found nothing eligible: the supporter is paying and has no
    // animal at all — the most urgent case for this signal.
    expect(detail?.needsAnimal).toBe(true);
  });

  test("getProofSigningInfo returns a signed url and file name when a proof exists", async () => {
    const repo = createFakeRepo({
      getProofSigningInfo: mock(async () => ({
        storagePath: `${pledgeId}/proof.jpg`,
        fileName: "proof.jpg",
      })),
    });
    const { client, createSignedUrl } = createFakeStorageClient();
    const service = createSponsorshipAdminService({
      repo,
      client,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const result = await service.getProofSigningInfo(pledgeId, exactReview.proofId, 1);

    expect(result).toEqual({ url: "https://example.com/signed", fileName: "proof.jpg" });
    expect(createSignedUrl).toHaveBeenCalledWith(
      `${pledgeId}/proof.jpg`,
      60,
      expect.objectContaining({ download: "proof.jpg" }),
    );
  });

  test("getProofSigningInfo returns null when there is no proof", async () => {
    const repo = createFakeRepo({ getProofSigningInfo: mock(async () => null) });
    const { client } = createFakeStorageClient();
    const service = createSponsorshipAdminService({
      repo,
      client,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    expect(await service.getProofSigningInfo(pledgeId, exactReview.proofId, 1)).toBeNull();
  });

  test("getProofSigningInfo throws when signing fails", async () => {
    const repo = createFakeRepo({
      getProofSigningInfo: mock(async () => ({
        storagePath: `${pledgeId}/proof.jpg`,
        fileName: "proof.jpg",
      })),
    });
    const signingError = new Error("storage unavailable");
    const { client } = createFakeStorageClient({
      createSignedUrl: mock(async () => ({ data: null, error: signingError })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(service.getProofSigningInfo(pledgeId, exactReview.proofId, 1)).rejects.toThrow(
      "storage unavailable",
    );
  });

  test("assertRecordPaymentEligible returns the pledge detail when eligible", async () => {
    const detail = baseDetail({ status: "pending_payment" });
    const repo = createFakeRepo({ getPledgeDetail: mock(async () => detail) });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    expect(await service.assertRecordPaymentEligible(pledgeId)).toEqual(detail);
  });

  test("assertRecordPaymentEligible accepts an active pledge (the second month)", async () => {
    // A running sponsorship is exactly where month two's payment is recorded.
    // This used to throw, which is what made the second month impossible.
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.assertRecordPaymentEligible(pledgeId);
    expect(detail.status).toBe("active");
  });

  test("assertRecordPaymentEligible rejects when the pledge is not eligible", async () => {
    // `cancelled` is the real ineligible case: no file should reach the bucket
    // for a sponsorship that has been ended.
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "cancelled" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(service.assertRecordPaymentEligible(pledgeId)).rejects.toThrow(
      "Sponsorship pledge is not eligible for a recorded payment",
    );
  });

  test("assertRecordPaymentEligible rejects when the pledge does not exist", async () => {
    const repo = createFakeRepo({ getPledgeDetail: mock(async () => null) });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(service.assertRecordPaymentEligible(pledgeId)).rejects.toThrow(
      "Sponsorship pledge not found",
    );
  });

  test("recordPayment rejects a pledge whose status is not eligible", async () => {
    // Eligible is pending_payment, needs_followup or active; `cancelled` is
    // not, and must not quietly accept money for an ended sponsorship.
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "cancelled" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.recordPayment({
        actorUserId,
        pledgeId,
        input: {
          idempotencyKey: "55555555-5555-4555-8555-555555555555",
          paymentMethod: "fps",
          amountCents: 30000,
          paymentDate: "2026-07-01",
        },
      }),
    ).rejects.toThrow("Sponsorship pledge is not eligible for a recorded payment");
    expect(repo.recordPayment).not.toHaveBeenCalled();
  });

  test("recordPayment succeeds without a file and persists null file fields", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "pending_payment" })),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.recordPayment({
      actorUserId,
      pledgeId,
      input: {
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
        paymentMethod: "fps",
        amountCents: 30000,
        paymentDate: "2026-07-01",
      },
    });

    expect(repo.recordPayment).toHaveBeenCalled();
    const call = (repo.recordPayment as ReturnType<typeof mock>).mock.calls[0][0] as {
      storagePath: string | null;
      fileName: string | null;
      fileType: string | null;
      fileSize: number | null;
    };
    expect(call.storagePath).toBeNull();
    expect(call.fileName).toBeNull();
    expect(call.fileType).toBeNull();
    expect(call.fileSize).toBeNull();
    expect(sender.sendPledgeStatusUpdateEmail).toHaveBeenCalled();
  });

  test("recordPayment calls the repository and sends the proof_recorded email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "pending_payment" })),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.recordPayment({
      actorUserId,
      pledgeId,
      input: {
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
        paymentMethod: "fps",
        reference: "REF1",
        amountCents: 30000,
        paymentDate: "2026-07-01",
        note: "Recorded manually",
        file: {
          storagePath: "sponsorship-payment-proof/pledge-1/proof.jpg",
          fileName: "proof.jpg",
          fileType: "image/jpeg",
          fileSize: 1024,
        },
      },
    });

    expect(repo.recordPayment).toHaveBeenCalled();
    expect(sender.sendPledgeStatusUpdateEmail).toHaveBeenCalled();
    const call = sender.calls[0] as [unknown, { reference: string }];
    expect(call[1].reference).toBe(pledgeReference(pledgeId));
    expect(call[1].reference).not.toBe(pledgeId);
    expect(call[1].reference).toMatch(/^SP-[0-9A-F]{8}$/);
  });

  test("reviewProof reviews an active pledge's queued proof (the second month)", async () => {
    // The status gate this replaces required 'provisional'. Approving month one
    // leaves the pledge 'active' permanently, so that gate made every later
    // month unreviewable: the payment could be recorded but never decided.
    // What is being reviewed is a proof, so a queued proof is the precondition.
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({ status: "active", currentProof: pendingProof({ id: "proof-month-2" }) }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({
      actorUserId,
      pledgeId,
      input: { ...exactReview, decision: "approve" },
    });
    expect(repo.reviewProof).toHaveBeenCalledTimes(1);
  });

  test("reviewProof propagates atomic rejection without sending a confirmation", async () => {
    const sender = createFakeSender();
    const repo = createFakeRepo({
      reviewProof: mock(async () => {
        throw new Error("Stale proof revision");
      }),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });
    await expect(
      service.reviewProof({
        actorUserId,
        pledgeId,
        input: { ...exactReview, decision: "approve" },
      }),
    ).rejects.toThrow("Stale proof revision");
    expect(sender.sendPledgeStatusUpdateEmail).not.toHaveBeenCalled();
  });
  test("reviewProof never sends browser ledger calculations to the transaction", async () => {
    const repo = createFakeRepo();
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });
    await service.reviewProof({
      actorUserId,
      pledgeId,
      input: { ...exactReview, decision: "approve" },
    });
    expect(repo.reviewProof).toHaveBeenCalledWith({
      ...exactReview,
      actorUserId,
      pledgeId,
      decision: "approve",
      note: null,
      assignAnimalId: null,
    });
  });

  test("reviewProof approve calls the repository and sends the active email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({ status: "provisional", currentProof: pendingProof() }),
      ),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({
      actorUserId,
      pledgeId,
      input: { ...exactReview, decision: "approve" },
    });

    expect(repo.reviewProof).toHaveBeenCalledWith({
      pledgeId,
      actorUserId,
      decision: "approve",
      note: null,
      ...exactReview,
      // No preferences on the base pledge, so there is nothing to confirm.
      assignAnimalId: null,
    });
    const call = sender.calls[0] as [unknown, { event: string; reference: string }];
    expect(call[1].event).toBe("active");
    expect(call[1].reference).toBe(pledgeReference(pledgeId));
    expect(call[1].reference).not.toBe(pledgeId);
  });

  test("reviewProof reject sends the needs_followup email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({ status: "provisional", currentProof: pendingProof() }),
      ),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({
      actorUserId,
      pledgeId,
      input: { ...exactReview, decision: "reject", note: "Blurry" },
    });

    const call = sender.calls[0] as [unknown, { event: string; reference: string }];
    expect(call[1].event).toBe("needs_followup");
    expect(call[1].reference).toBe(pledgeReference(pledgeId));
    expect(call[1].reference).not.toBe(pledgeId);
  });

  test("approving the first payment confirms the top-ranked eligible animal", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "provisional",
          currentProof: pendingProof(),
          preferences: [
            {
              id: "pref-1",
              rank: 1,
              animalId: "animal-adopted",
              animalNameSnapshot: "小黑",
              animalState: { ...eligibleState, status: "adopted" },
            },
            {
              id: "pref-2",
              rank: 2,
              animalId: "animal-ok",
              animalNameSnapshot: "小白",
              animalState: eligibleState,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({
      actorUserId,
      pledgeId,
      input: { ...exactReview, decision: "approve" },
    });

    // Rank 1 has been adopted, so the supporter's next choice wins. Skipping
    // straight past an unavailable first choice is the whole point of ranking.
    expect(repo.reviewProof).toHaveBeenCalledWith(
      expect.objectContaining({ assignAnimalId: "animal-ok" }),
    );
  });

  test("approving assigns nothing when the pledge already has an assignment", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "active",
          currentProof: pendingProof(),
          preferences: [
            {
              id: "pref-1",
              rank: 1,
              animalId: "animal-ok",
              animalNameSnapshot: "小白",
              animalState: eligibleState,
            },
          ],
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-ok",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: null,
              endReason: null,
              note: null,
              endNote: null,
              animalState: eligibleState,
              reviewReason: null,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({
      actorUserId,
      pledgeId,
      input: { ...exactReview, decision: "approve" },
    });

    // Month two of a running sponsorship. Auto-assign belongs to the FIRST
    // approval only; every later payment must leave the animal alone.
    expect(repo.reviewProof).toHaveBeenCalledWith(
      expect.objectContaining({ assignAnimalId: null }),
    );
  });

  test("rejecting a payment confirms no animal", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "provisional",
          currentProof: pendingProof(),
          preferences: [
            {
              id: "pref-1",
              rank: 1,
              animalId: "animal-ok",
              animalNameSnapshot: "小白",
              animalState: eligibleState,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({
      actorUserId,
      pledgeId,
      input: { ...exactReview, decision: "reject", note: "Blurry" },
    });

    // A rejected payment pays for nothing, so it confirms nothing.
    expect(repo.reviewProof).toHaveBeenCalledWith(
      expect.objectContaining({ assignAnimalId: null }),
    );
  });

  test("cancelPledge rejects an already-cancelled pledge", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "cancelled" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.cancelPledge({ actorUserId, pledgeId, input: { note: "Sponsor left" } }),
    ).rejects.toThrow("Sponsorship pledge is already cancelled");
    expect(repo.cancelPledge).not.toHaveBeenCalled();
  });

  test("cancelPledge calls the repository and sends the cancelled email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.cancelPledge({ actorUserId, pledgeId, input: { note: "Sponsor left" } });

    expect(repo.cancelPledge).toHaveBeenCalledWith({
      pledgeId,
      actorUserId,
      note: "Sponsor left",
    });
    const call = sender.calls[0] as [unknown, { event: string; reference: string }];
    expect(call[1].event).toBe("cancelled");
    expect(call[1].reference).toBe(pledgeReference(pledgeId));
    expect(call[1].reference).not.toBe(pledgeId);
  });

  test("cancelPledge skips sending an email when the pledge has no supporter email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active", supporterEmail: null })),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.cancelPledge({ actorUserId, pledgeId, input: { note: "Sponsor left" } }),
    ).resolves.toBeUndefined();

    expect(repo.cancelPledge).toHaveBeenCalledWith({
      pledgeId,
      actorUserId,
      note: "Sponsor left",
    });
    expect(sender.sendPledgeStatusUpdateEmail).not.toHaveBeenCalled();
  });

  test("email failure does not throw or roll back the already-committed transition", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: mock(async () => {
        throw new Error("email provider down");
      }),
    });

    await expect(
      service.cancelPledge({ actorUserId, pledgeId, input: { note: "Sponsor left" } }),
    ).resolves.toBeUndefined();
    expect(repo.cancelPledge).toHaveBeenCalled();
  });

  test("assignAnimal passes the animal through to the repository", async () => {
    const repo = createFakeRepo();
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.assignAnimal({
      actorUserId,
      pledgeId,
      input: { animalId: "11111111-2222-4333-8444-555555555555" },
    });

    expect(repo.assignAnimal).toHaveBeenCalledWith({
      pledgeId,
      animalId: "11111111-2222-4333-8444-555555555555",
      actorUserId,
      note: null,
    });
  });

  test("assignAnimal refuses a cancelled pledge before touching the database", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "cancelled" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.assignAnimal({
        actorUserId,
        pledgeId,
        input: { animalId: "11111111-2222-4333-8444-555555555555" },
      }),
    ).rejects.toThrow("Sponsorship pledge is already cancelled");
    expect(repo.assignAnimal).not.toHaveBeenCalled();
  });

  test("endAssignment passes the reason through", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: null,
              endReason: null,
              note: null,
              endNote: null,
              animalState: null,
              reviewReason: null,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.endAssignment({
      actorUserId,
      pledgeId,
      assignmentId: "asg-1",
      input: { reason: "adopted", note: "rehomed" },
    });

    expect(repo.endAssignment).toHaveBeenCalledWith({
      assignmentId: "asg-1",
      actorUserId,
      reason: "adopted",
      note: "rehomed",
    });
  });

  test("endAssignment refuses one that is already ended", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: "2026-08-01",
              endReason: "adopted",
              note: null,
              endNote: null,
              animalState: null,
              reviewReason: null,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.endAssignment({
        actorUserId,
        pledgeId,
        assignmentId: "asg-1",
        input: { reason: "adopted" },
      }),
    ).rejects.toThrow("Sponsorship assignment is already ended");
    expect(repo.endAssignment).not.toHaveBeenCalled();
  });
});

test("review command binds the proof the reviewer saw even when the queue advances", async () => {
  const reviewedProofId = "33333333-3333-4333-8333-333333333333";
  const repo = createFakeRepo({
    getPledgeDetail: mock(async () =>
      baseDetail({ currentProof: pendingProof({ id: "44444444-4444-4444-8444-444444444444" }) }),
    ),
  });
  const service = createSponsorshipAdminService({
    repo,
    client: fakeClient,
    sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
  });
  await service.reviewProof({
    actorUserId,
    pledgeId,
    input: {
      proofId: reviewedProofId,
      expectedRevision: 1,
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
      decision: "approve",
    },
  });
  expect(repo.reviewProof).toHaveBeenCalledWith(
    expect.objectContaining({
      proofId: reviewedProofId,
      expectedRevision: 1,
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
    }),
  );
});
