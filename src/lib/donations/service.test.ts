import { describe, expect, test } from "bun:test";

import { createDonation } from "./service";
import type { DonationRepository, PaymentProviders } from "./service";

function createFakeRepository(): DonationRepository & {
  supporterConsents: unknown[];
  payments: unknown[];
} {
  const supporter = { id: "supporter-1", email: "donor@example.com" };
  const donation = { id: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a", amount_cents: 30000 };
  const payments: unknown[] = [];
  const supporterConsents: unknown[] = [];

  return {
    supporterConsents,
    payments,
    async upsertSupporter() {
      return supporter;
    },
    async ensureSupporterRole() {},
    async replaceConsents(rows) {
      supporterConsents.push(...rows);
    },
    async createDonation() {
      return donation;
    },
    async createPayment(payment) {
      payments.push(payment);
      return { id: "payment-1", ...payment };
    },
    async updatePaymentProviderRef(paymentId, providerRef) {
      payments.push({ id: paymentId, provider_ref: providerRef });
    },
  };
}

const providers: PaymentProviders = {
  async createStripeCheckout() {
    return { providerRef: "cs_test_123", url: "https://checkout.stripe.test/session" };
  },
  async createPayPalOrder() {
    return { providerRef: "paypal_order_123", url: "https://paypal.test/checkout" };
  },
};

const baseInput = {
  amountCents: 30000,
  currency: "HKD" as const,
  purpose: "medical" as const,
  receiptRequested: true,
  donor: {
    name: "Ada",
    email: "DONOR@example.com",
    phone: "9123 4567",
    language: "zh-HK" as const,
  },
  consents: { email: true, whatsapp: false },
};

describe("createDonation", () => {
  test("creates pending manual FPS donations with a unique reference", async () => {
    const repository = createFakeRepository();

    const result = await createDonation({
      input: { ...baseInput, method: "fps" as const },
      repository,
      providers,
      now: () => new Date("2026-06-24T10:00:00.000Z"),
    });

    expect(result).toEqual({
      kind: "manual",
      donationId: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      reference: "HKSCDA-F8DCE8FA",
      instructions: {
        method: "fps",
        label: "轉數快 FPS",
        payableTo: "香港拯救貓狗協會",
        identifier: "FPS ID 8727588",
        amountCents: 30000,
      },
    });
    expect(repository.payments).toContainEqual({
      donation_id: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      provider: "fps",
      provider_ref: "HKSCDA-F8DCE8FA",
      amount_cents: 30000,
      status: "pending",
    });
    expect(repository.supporterConsents).toHaveLength(2);
  });

  test("creates Stripe checkout donations and stores the checkout session id", async () => {
    const repository = createFakeRepository();

    const result = await createDonation({
      input: { ...baseInput, method: "stripe" as const },
      repository,
      providers,
      now: () => new Date("2026-06-24T10:00:00.000Z"),
    });

    expect(result).toEqual({
      kind: "redirect",
      donationId: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      provider: "stripe",
      url: "https://checkout.stripe.test/session",
    });
    expect(repository.payments).toContainEqual({ id: "payment-1", provider_ref: "cs_test_123" });
  });
});
