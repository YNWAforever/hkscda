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
const actorUserId = "22222222-3333-4333-8444-555555555555";

function pendingProof(overrides: Partial<PaymentProofRecord> = {}): PaymentProofRecord {
  return {
    id: "proof-1",
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

  test("getPledgeDetail returns null when the repository returns null", async () => {
    const repo = createFakeRepo({ getPledgeDetail: mock(async () => null) });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    expect(await service.getPledgeDetail(pledgeId)).toBeNull();
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

    const result = await service.getProofSigningInfo(pledgeId);

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

    expect(await service.getProofSigningInfo(pledgeId)).toBeNull();
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

    await expect(service.getProofSigningInfo(pledgeId)).rejects.toThrow("storage unavailable");
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

  test("assertRecordPaymentEligible rejects when the pledge is not eligible", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
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

  test("recordPayment rejects when the pledge is not pending_payment or needs_followup", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
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

  test("reviewProof rejects when the pledge is not provisional", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.reviewProof({ actorUserId, pledgeId, input: { decision: "approve" } }),
    ).rejects.toThrow("Sponsorship pledge is not awaiting review");
    expect(repo.reviewProof).not.toHaveBeenCalled();
  });

  test("reviewProof rejects when there is no current proof", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "provisional", currentProof: null })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.reviewProof({ actorUserId, pledgeId, input: { decision: "approve" } }),
    ).rejects.toThrow("Sponsorship pledge has no proof pending review");
    expect(repo.reviewProof).not.toHaveBeenCalled();
  });

  test("reviewProof rejects when the current proof is not pending", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "provisional",
          currentProof: pendingProof({ reviewStatus: "approved" }),
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.reviewProof({ actorUserId, pledgeId, input: { decision: "approve" } }),
    ).rejects.toThrow("Sponsorship pledge has no proof pending review");
    expect(repo.reviewProof).not.toHaveBeenCalled();
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

    await service.reviewProof({ actorUserId, pledgeId, input: { decision: "approve" } });

    expect(repo.reviewProof).toHaveBeenCalledWith({
      pledgeId,
      actorUserId,
      decision: "approve",
      note: null,
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
      input: { decision: "reject", note: "Blurry" },
    });

    const call = sender.calls[0] as [unknown, { event: string; reference: string }];
    expect(call[1].event).toBe("needs_followup");
    expect(call[1].reference).toBe(pledgeReference(pledgeId));
    expect(call[1].reference).not.toBe(pledgeId);
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

    await expect(service.cancelPledge({ actorUserId, pledgeId, input: {} })).rejects.toThrow(
      "Sponsorship pledge is already cancelled",
    );
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
      service.cancelPledge({ actorUserId, pledgeId, input: {} }),
    ).resolves.toBeUndefined();
    expect(repo.cancelPledge).toHaveBeenCalled();
  });
});
