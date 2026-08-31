import { describe, expect, mock, test } from "bun:test";

import { createPaymentPublicConfigService, PaymentPublicConfigError } from "./service";
import type { PaymentPublicConfigRepository } from "./repository.server";
import type { PaymentPublicConfig } from "./types";

const STAFF_ACTOR = { adminUserId: "admin-1", authUserId: "auth-1", role: "staff" as const };
const TREASURER_ACTOR = {
  adminUserId: "admin-2",
  authUserId: "auth-2",
  role: "treasurer" as const,
};

const DRAFT_CONFIG: PaymentPublicConfig = {
  id: "11111111-1111-1111-1111-111111111111",
  method: "fps",
  isPubliclyVisible: true,
  displayLabelZh: "轉數快 FPS",
  displayLabelEn: "FPS",
  sortOrder: 2,
  details: {},
  state: "draft",
  version: 1,
  createdBy: "auth-1",
  updatedBy: "auth-1",
  submittedBy: null,
  submittedAt: null,
  publishedBy: null,
  publishedAt: null,
  archivedBy: null,
  archivedAt: null,
  createdAt: "2026-08-31T00:00:00Z",
  updatedAt: "2026-08-31T00:00:00Z",
};

function fakeRepository(
  overrides: Partial<PaymentPublicConfigRepository> = {},
): PaymentPublicConfigRepository {
  return {
    list: mock(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    getById: mock(async () => DRAFT_CONFIG),
    create: mock(async () => DRAFT_CONFIG),
    update: mock(async () => DRAFT_CONFIG),
    transition: mock(async () => DRAFT_CONFIG),
    publish: mock(async () => ({
      configId: DRAFT_CONFIG.id,
      configVersion: 2,
      method: "fps" as const,
    })),
    ...overrides,
  };
}

describe("createPaymentPublicConfigService", () => {
  test("a staff actor can submit a draft", async () => {
    const repository = fakeRepository();
    const service = createPaymentPublicConfigService(repository);
    await service.submit({ actor: STAFF_ACTOR, id: DRAFT_CONFIG.id, expectedVersion: 1 });
    expect(repository.transition).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "submit", actorUserId: "auth-1" }),
    );
  });

  test("a staff actor cannot publish", async () => {
    const repository = fakeRepository();
    const service = createPaymentPublicConfigService(repository);
    try {
      await service.publish({
        actor: STAFF_ACTOR,
        id: DRAFT_CONFIG.id,
        expectedVersion: 1,
        idempotencyKey: "a".repeat(32),
      });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentPublicConfigError);
      expect((error as PaymentPublicConfigError).code).toBe("forbidden");
      expect((error as PaymentPublicConfigError).status).toBe(403);
    }
    expect(repository.publish).not.toHaveBeenCalled();
  });

  test("a treasurer actor can publish", async () => {
    const repository = fakeRepository();
    const service = createPaymentPublicConfigService(repository);
    const result = await service.publish({
      actor: TREASURER_ACTOR,
      id: DRAFT_CONFIG.id,
      expectedVersion: 1,
      idempotencyKey: "a".repeat(32),
    });
    expect(result.method).toBe("fps");
  });

  test("a staff actor cannot return a submission to draft", async () => {
    const repository = fakeRepository();
    const service = createPaymentPublicConfigService(repository);
    try {
      await service.returnToDraft({ actor: STAFF_ACTOR, id: DRAFT_CONFIG.id, expectedVersion: 1 });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentPublicConfigError);
      expect((error as PaymentPublicConfigError).code).toBe("forbidden");
      expect((error as PaymentPublicConfigError).status).toBe(403);
    }
    expect(repository.transition).not.toHaveBeenCalled();
  });

  test("submit rejects a version mismatch before calling the repository transition", async () => {
    const repository = fakeRepository();
    const service = createPaymentPublicConfigService(repository);
    try {
      await service.submit({ actor: STAFF_ACTOR, id: DRAFT_CONFIG.id, expectedVersion: 99 });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentPublicConfigError);
      expect((error as PaymentPublicConfigError).code).toBe("conflict");
      expect((error as PaymentPublicConfigError).status).toBe(409);
    }
    expect(repository.transition).not.toHaveBeenCalled();
  });

  test("submit rejects a config that is not in draft state", async () => {
    const repository = fakeRepository({
      getById: mock(async () => ({ ...DRAFT_CONFIG, state: "in_review" as const })),
    });
    const service = createPaymentPublicConfigService(repository);
    try {
      await service.submit({ actor: STAFF_ACTOR, id: DRAFT_CONFIG.id, expectedVersion: 1 });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentPublicConfigError);
      expect((error as PaymentPublicConfigError).code).toBe("conflict");
      expect((error as PaymentPublicConfigError).status).toBe(409);
    }
  });
});
