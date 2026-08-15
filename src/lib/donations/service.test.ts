import { describe, expect, test } from "bun:test";

import { createDonation } from "./service";
import type { DonationRepository, PaymentProviders } from "./service";

function createFakeRepository(): DonationRepository & {
  supporterConsents: unknown[];
  donations: unknown[];
  payments: unknown[];
} {
  const supporter = { id: "supporter-1", email: "donor@example.com" };
  const donation = { id: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a", amount_cents: 30000 };
  const payments: unknown[] = [];
  const donations: unknown[] = [];
  const supporterConsents: unknown[] = [];

  return {
    supporterConsents,
    donations,
    payments,
    async upsertSupporter() {
      return supporter;
    },
    async ensureSupporterRole() {},
    async replaceConsents(rows) {
      supporterConsents.push(...rows);
    },
    async createDonation(input) {
      donations.push(input);
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
  async createCodAlipayHkCheckout() {
    return { providerRef: "cod_order_123", url: "https://cod.test/checkout" };
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
    expect(repository.donations[0]).toMatchObject({
      acquisition_source: null,
      acquisition_context: null,
      acquisition_placement: null,
      acquisition_trigger: null,
    });
  });
  test("stores a custom purpose without exposing it to checkout providers", async () => {
    const repository = createFakeRepository();
    let checkoutInput: Parameters<PaymentProviders["createStripeCheckout"]>[0] | undefined;
    const capturingProviders: PaymentProviders = {
      async createStripeCheckout(input) {
        checkoutInput = input;
        return { providerRef: "cs_test_123", url: "https://checkout.stripe.test/session" };
      },
      async createPayPalOrder() {
        return { providerRef: "paypal_order_123", url: "https://paypal.test/checkout" };
      },
      async createCodAlipayHkCheckout() {
        return { providerRef: "cod_order_123", url: "https://cod.test/checkout" };
      },
    };

    await createDonation({
      input: {
        ...baseInput,
        method: "stripe" as const,
        customPurpose: "  個案 A  ",
      },
      repository,
      providers: capturingProviders,
      now: () => new Date("2026-06-24T10:00:00.000Z"),
    });

    expect(repository.donations[0]).toMatchObject({
      purpose: "medical",
      custom_purpose: "個案 A",
    });
    expect(checkoutInput).toMatchObject({ purpose: "medical" });
    expect(checkoutInput).not.toHaveProperty("customPurpose");
  });

  test("compensates by deleting the donation and payment when checkout fails", async () => {
    const repository = createFakeRepository();
    const deleted = { payments: [] as string[], donations: [] as string[] };
    repository.deletePayment = async (id) => {
      deleted.payments.push(id);
    };
    repository.deleteDonation = async (id) => {
      deleted.donations.push(id);
    };

    const failingProviders: PaymentProviders = {
      async createStripeCheckout() {
        throw new Error("stripe unavailable");
      },
      async createPayPalOrder() {
        throw new Error("paypal unavailable");
      },
      async createCodAlipayHkCheckout() {
        throw new Error("cod unavailable");
      },
    };

    await expect(
      createDonation({
        input: { ...baseInput, method: "stripe" as const },
        repository,
        providers: failingProviders,
        now: () => new Date("2026-06-24T10:00:00.000Z"),
      }),
    ).rejects.toThrow("stripe unavailable");

    expect(deleted.payments).toEqual(["payment-1"]);
    expect(deleted.donations).toEqual(["f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a"]);
  });

  test("creates Stripe checkout donations and stores the checkout session id", async () => {
    const repository = createFakeRepository();

    const result = await createDonation({
      input: {
        ...baseInput,
        method: "stripe" as const,
        attribution: {
          source: "contextual-cta" as const,
          context: "animal" as const,
          purpose: "medical" as const,
          placement: "mobile-bottom" as const,
          trigger: "scroll" as const,
        },
      },
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
    expect(repository.donations[0]).toMatchObject({
      acquisition_source: "contextual-cta",
      acquisition_context: "animal",
      acquisition_placement: "mobile-bottom",
      acquisition_trigger: "scroll",
    });
  });

  test("maps AlipayHK to COD and passes the validated checkout experience only to COD", async () => {
    const repository = createFakeRepository();
    const calls = { stripe: 0, paypal: 0, cod: [] as unknown[] };
    const instrumentedProviders = {
      async createStripeCheckout() {
        calls.stripe += 1;
        return { providerRef: "cs_test_123", url: "https://checkout.stripe.test/session" };
      },
      async createPayPalOrder() {
        calls.paypal += 1;
        return { providerRef: "paypal_order_123", url: "https://paypal.test/checkout" };
      },
      async createCodAlipayHkCheckout(input: unknown) {
        calls.cod.push(input);
        return { providerRef: "cod_order_123", url: "https://cod.test/checkout" };
      },
    } satisfies PaymentProviders;

    const result = await createDonation({
      input: { ...baseInput, method: "alipayhk", checkoutExperience: "wap" },
      repository,
      providers: instrumentedProviders,
      now: () => new Date("2026-06-24T10:00:00.000Z"),
    });

    expect(repository.payments).toContainEqual({
      donation_id: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      provider: "cod",
      provider_ref: null,
      amount_cents: 30000,
      status: "pending",
    });
    expect(calls).toEqual({
      stripe: 0,
      paypal: 0,
      cod: [
        {
          donationId: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
          paymentId: "payment-1",
          amountCents: 30000,
          donorEmail: "donor@example.com",
          purpose: "medical",
          checkoutExperience: "wap",
        },
      ],
    });
    expect(result).toEqual({
      kind: "redirect",
      donationId: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      provider: "cod",
      url: "https://cod.test/checkout",
    });
  });
});
