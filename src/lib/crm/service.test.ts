import { describe, expect, test } from "bun:test";

import { createCrmService, type CrmRepository } from "./service";
import type { DonationExportRow } from "./csv";
import type { SupporterSummary } from "./types";

function supporter(overrides: Partial<SupporterSummary> = {}): SupporterSummary {
  return {
    id: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
    name: "Ada",
    email: "ada@example.com",
    phone: null,
    language: "zh-HK",
    tags: [],
    roles: ["donor"],
    deletedAt: null,
    lastGiftAt: null,
    lastGiftAmountCents: null,
    lifetimeAmountCents: 0,
    donationCount: 0,
    receiptNeeded: false,
    emailConsent: null,
    whatsappConsent: null,
    ...overrides,
  };
}

function createFakeRepository(): CrmRepository & {
  calls: Array<{ name: string; payload: unknown }>;
} {
  const calls: Array<{ name: string; payload: unknown }> = [];

  return {
    calls,
    async listSupporters(input) {
      calls.push({ name: "listSupporters", payload: input });
      return { supporters: [], total: 0 };
    },
    async getSupporterDetail(id) {
      calls.push({ name: "getSupporterDetail", payload: id });
      return null;
    },
    async upsertSupporter(input) {
      calls.push({ name: "upsertSupporter", payload: input });
      return { id: "8bda8e40-cf39-4659-8be8-f2d74f9d2046", email: input.email };
    },
    async updateSupporter(id, input) {
      calls.push({ name: "updateSupporter", payload: { id, input } });
    },
    async ensureSupporterRole(input) {
      calls.push({ name: "ensureSupporterRole", payload: input });
    },
    async setSupporterRoles(input) {
      calls.push({ name: "setSupporterRoles", payload: input });
    },
    async insertConsentRows(rows) {
      calls.push({ name: "insertConsentRows", payload: rows });
    },
    async insertManualDonation(records) {
      calls.push({ name: "insertManualDonation", payload: records });
      return { donationId: records.donation.id, paymentId: "payment-1" };
    },
    async completeManualDonationSideEffects(paymentId) {
      calls.push({ name: "completeManualDonationSideEffects", payload: paymentId });
    },
    async listSupportersForExport(input) {
      calls.push({ name: "listSupportersForExport", payload: input });
      return [supporter()];
    },
    async listDonationsForExport(input) {
      calls.push({ name: "listDonationsForExport", payload: input });
      return [
        {
          supporterId: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
          supporterName: "Ada",
          supporterEmail: "ada@example.com",
          donationId: "donation-1",
          amountCents: 30000,
          purpose: "medical",
          customPurpose: null,
          status: "succeeded",
          method: "manual",
          receiptRequested: true,
          receiptNo: "HKSCDA-2026-000001",
          createdAt: "2026-06-24T09:00:00.000Z",
        } satisfies DonationExportRow,
      ];
    },
    async insertAuditLog(row) {
      calls.push({ name: "insertAuditLog", payload: row });
    },
  };
}

describe("createCrmService", () => {
  test("normalizes email when creating a supporter, stores selected roles, and audits", async () => {
    const repo = createFakeRepository();
    const service = createCrmService({
      repo,
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    });

    const created = await service.createSupporter({
      actorUserId: "11111111-2222-4333-8444-555555555555",
      input: {
        name: " Ada ",
        email: "ADA@EXAMPLE.COM",
        phone: " 9123 4567 ",
        language: "zh-HK",
        tags: [" donor ", "donor"],
        roles: [" volunteer ", "donor", "volunteer"],
      },
    });

    expect(created.email).toBe("ada@example.com");
    expect(repo.calls.map((call) => call.name)).toEqual([
      "upsertSupporter",
      "setSupporterRoles",
      "insertAuditLog",
    ]);
    expect(repo.calls[0].payload).toMatchObject({
      email: "ada@example.com",
      name: "Ada",
      phone: "9123 4567",
      tags: ["donor"],
    });
    expect(repo.calls[1].payload).toEqual({
      supporterId: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
      roles: ["volunteer", "donor"],
    });
    expect(repo.calls[2].payload).toMatchObject({
      actor_user_id: "11111111-2222-4333-8444-555555555555",
      action: "supporter.create_or_update",
      entity: "supporter",
      entity_id: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
      timestamp: "2026-06-24T09:00:00.000Z",
    });
  });

  test("updates supporter profile fields and roles together", async () => {
    const repo = createFakeRepository();
    const service = createCrmService({
      repo,
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    });

    await service.updateSupporter({
      actorUserId: "11111111-2222-4333-8444-555555555555",
      supporterId: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
      input: {
        name: "Ada Wong",
        roles: ["volunteer", "foster"],
        deleted: false,
      },
    });

    expect(repo.calls.map((call) => call.name)).toEqual([
      "updateSupporter",
      "setSupporterRoles",
      "insertAuditLog",
    ]);
    expect(repo.calls[0].payload).toEqual({
      id: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
      input: {
        name: "Ada Wong",
        deletedAt: null,
      },
    });
    expect(repo.calls[1].payload).toEqual({
      supporterId: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
      roles: ["volunteer", "foster"],
    });
    expect(repo.calls[2].payload).toMatchObject({
      action: "supporter.update",
      detail: {
        name: "Ada Wong",
        roles: ["volunteer", "foster"],
        deleted: false,
      },
    });
  });

  test("appends only provided consent channels and audits", async () => {
    const repo = createFakeRepository();
    const service = createCrmService({
      repo,
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    });

    await service.appendConsents({
      actorUserId: "11111111-2222-4333-8444-555555555555",
      supporterId: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
      input: { source: "phone_call", email: false },
    });

    expect(repo.calls.map((call) => call.name)).toEqual(["insertConsentRows", "insertAuditLog"]);
    expect(repo.calls[0].payload).toEqual([
      {
        supporter_id: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
        channel: "email",
        status: "opt_out",
        source: "phone_call",
        timestamp: "2026-06-24T09:00:00.000Z",
      },
    ]);
    expect(repo.calls[1].payload).toMatchObject({
      action: "consent.append",
      entity: "supporter",
      entity_id: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
    });
  });

  test("validates manual donation before writes", async () => {
    const repo = createFakeRepository();
    const service = createCrmService({ repo });

    await expect(
      service.createManualDonation({
        actorUserId: "11111111-2222-4333-8444-555555555555",
        input: {
          supporterId: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
          amountCents: 30000,
          currency: "HKD",
          purpose: "medical",
          method: "manual",
          paymentStatus: "succeeded",
          receiptRequested: true,
        },
      }),
    ).rejects.toThrow();

    expect(repo.calls).toHaveLength(0);
  });

  test("creates manual donation records, ensures donor role, appends inline consents, and returns ids", async () => {
    const repo = createFakeRepository();
    const service = createCrmService({
      repo,
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    });

    const result = await service.createManualDonation({
      actorUserId: "11111111-2222-4333-8444-555555555555",
      input: {
        supporter: {
          name: "Ada",
          email: "ADA@EXAMPLE.COM",
          language: "zh-HK",
        },
        amountCents: 30000,
        currency: "HKD",
        purpose: "medical",
        method: "manual",
        paymentStatus: "succeeded",
        bankReference: "CASH-2026-001",
        receiptRequested: true,
        consents: { whatsapp: true },
      },
    });

    expect(result.paymentId).toBe("payment-1");
    expect(result.donationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(repo.calls.map((call) => call.name)).toEqual([
      "upsertSupporter",
      "ensureSupporterRole",
      "insertConsentRows",
      "insertManualDonation",
      // succeeded manual gift triggers receipt + acknowledgement side effects
      "completeManualDonationSideEffects",
    ]);
    expect(repo.calls[2].payload).toMatchObject([
      {
        channel: "whatsapp",
        status: "opt_in",
        source: "admin_manual",
      },
    ]);
    expect(repo.calls[3].payload).toMatchObject({
      donation: {
        supporter_id: "8bda8e40-cf39-4659-8be8-f2d74f9d2046",
        amount_cents: 30000,
        status: "succeeded",
        method: "manual",
      },
      payment: {
        status: "succeeded",
        bank_reference: "CASH-2026-001",
        reconciled_by: "11111111-2222-4333-8444-555555555555",
      },
      audit: {
        action: "donation.manual_create",
        entity: "donation",
      },
    });
  });

  test("audits supporter export row count and returns CSV", async () => {
    const repo = createFakeRepository();
    const service = createCrmService({
      repo,
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    });

    const csv = await service.exportSupporters({
      actorUserId: "11111111-2222-4333-8444-555555555555",
      rawSearch: { q: "ada@example.com", includeDeleted: "false" },
    });

    expect(csv).toContain("supporter_id,name,email");
    expect(repo.calls.map((call) => call.name)).toEqual([
      "listSupportersForExport",
      "insertAuditLog",
    ]);
    expect(repo.calls[1].payload).toMatchObject({
      action: "export.supporters",
      detail: {
        filters: { q: "ada@example.com", includeDeleted: false },
        rowCount: 1,
      },
    });
  });
});
