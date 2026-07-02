import { describe, expect, mock, test } from "bun:test";

import { createSponsorshipAdminService } from "./service";
import type { PledgeDetail } from "./types";
import type { SponsorshipAdminRepository as Repo } from "./repository.server";

const pledgeId = "11111111-2222-4333-8444-555555555555";
const actorUserId = "22222222-3333-4333-8444-555555555555";

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
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    expect(await service.getPledgeDetail(pledgeId)).toBeNull();
  });

  test("recordPayment rejects when the pledge is not pending_payment or needs_followup", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
    });
    const service = createSponsorshipAdminService({
      repo,
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

  test("recordPayment calls the repository and sends the proof_recorded email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "pending_payment" })),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
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
      },
    });

    expect(repo.recordPayment).toHaveBeenCalled();
    expect(sender.sendPledgeStatusUpdateEmail).toHaveBeenCalled();
  });

  test("reviewProof rejects when the pledge is not provisional", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.reviewProof({ actorUserId, pledgeId, input: { decision: "approve" } }),
    ).rejects.toThrow("Sponsorship pledge is not awaiting review");
    expect(repo.reviewProof).not.toHaveBeenCalled();
  });

  test("reviewProof approve calls the repository and sends the active email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "provisional" })),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({ actorUserId, pledgeId, input: { decision: "approve" } });

    expect(repo.reviewProof).toHaveBeenCalledWith({
      pledgeId,
      actorUserId,
      decision: "approve",
      note: null,
    });
    const call = sender.calls[0] as [unknown, { event: string }];
    expect(call[1].event).toBe("active");
  });

  test("reviewProof reject sends the needs_followup email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "provisional" })),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({
      actorUserId,
      pledgeId,
      input: { decision: "reject", note: "Blurry" },
    });

    const call = sender.calls[0] as [unknown, { event: string }];
    expect(call[1].event).toBe("needs_followup");
  });

  test("cancelPledge rejects an already-cancelled pledge", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "cancelled" })),
    });
    const service = createSponsorshipAdminService({
      repo,
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
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.cancelPledge({ actorUserId, pledgeId, input: { note: "Sponsor left" } });

    expect(repo.cancelPledge).toHaveBeenCalledWith({
      pledgeId,
      actorUserId,
      note: "Sponsor left",
    });
    const call = sender.calls[0] as [unknown, { event: string }];
    expect(call[1].event).toBe("cancelled");
  });

  test("email failure does not throw or roll back the already-committed transition", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
    });
    const service = createSponsorshipAdminService({
      repo,
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
