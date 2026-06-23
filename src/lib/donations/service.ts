import {
  buildConsentRows,
  createManualPaymentReference,
  donationRequestSchema,
  type DonationMethod,
  type DonationRequest,
} from "./domain";

type SupporterRow = {
  id: string;
  email: string;
};

type DonationRow = {
  id: string;
  amount_cents: number;
};

type PaymentInsert = {
  donation_id: string;
  provider: DonationMethod;
  provider_ref: string | null;
  amount_cents: number;
  status: "pending";
};

type PaymentRow = PaymentInsert & {
  id: string;
};

export type DonationRepository = {
  upsertSupporter(input: DonationRequest["donor"]): Promise<SupporterRow>;
  ensureSupporterRole(input: { supporterId: string; role: "donor" }): Promise<void>;
  replaceConsents(rows: ReturnType<typeof buildConsentRows>): Promise<void>;
  createDonation(input: {
    supporter_id: string;
    amount_cents: number;
    currency: "HKD";
    purpose: DonationRequest["purpose"];
    type: "one_time";
    status: "pending";
    method: DonationMethod;
    receipt_requested: boolean;
  }): Promise<DonationRow>;
  createPayment(input: PaymentInsert): Promise<PaymentRow>;
  updatePaymentProviderRef(paymentId: string, providerRef: string): Promise<void>;
};

export type PaymentProviders = {
  createStripeCheckout(input: CheckoutProviderInput): Promise<CheckoutProviderResult>;
  createPayPalOrder(input: CheckoutProviderInput): Promise<CheckoutProviderResult>;
};

export type CheckoutProviderInput = {
  donationId: string;
  paymentId: string;
  amountCents: number;
  donorEmail: string;
  purpose: DonationRequest["purpose"];
};

export type CheckoutProviderResult = {
  providerRef: string;
  url: string;
};

type CreateDonationArgs = {
  input: unknown;
  repository: DonationRepository;
  providers: PaymentProviders;
  now?: () => Date;
};

export type CreateDonationResult =
  | {
      kind: "redirect";
      donationId: string;
      provider: "stripe" | "paypal";
      url: string;
    }
  | {
      kind: "manual";
      donationId: string;
      reference: string;
      instructions: {
        method: "fps" | "payme";
        label: string;
        payableTo: string;
        identifier: string;
        amountCents: number;
      };
    };

export async function createDonation({
  input,
  repository,
  providers,
  now = () => new Date(),
}: CreateDonationArgs): Promise<CreateDonationResult> {
  const donationInput = donationRequestSchema.parse(input);
  const supporter = await repository.upsertSupporter(donationInput.donor);

  await repository.ensureSupporterRole({ supporterId: supporter.id, role: "donor" });
  await repository.replaceConsents(
    buildConsentRows({
      supporterId: supporter.id,
      source: "donation_form",
      timestamp: now().toISOString(),
      consents: donationInput.consents,
    }),
  );

  const donation = await repository.createDonation({
    supporter_id: supporter.id,
    amount_cents: donationInput.amountCents,
    currency: donationInput.currency,
    purpose: donationInput.purpose,
    type: "one_time",
    status: "pending",
    method: donationInput.method,
    receipt_requested: donationInput.receiptRequested,
  });

  if (donationInput.method === "fps" || donationInput.method === "payme") {
    const reference = createManualPaymentReference(donation.id);
    await repository.createPayment({
      donation_id: donation.id,
      provider: donationInput.method,
      provider_ref: reference,
      amount_cents: donationInput.amountCents,
      status: "pending",
    });

    return {
      kind: "manual",
      donationId: donation.id,
      reference,
      instructions: {
        method: donationInput.method,
        label: donationInput.method === "fps" ? "轉數快 FPS" : "PayMe Business",
        payableTo: "香港拯救貓狗協會",
        identifier:
          donationInput.method === "fps"
            ? "FPS ID 8727588"
            : "WhatsApp 9864 1089 索取 PayMe QR Code",
        amountCents: donationInput.amountCents,
      },
    };
  }

  const pendingPayment = await repository.createPayment({
    donation_id: donation.id,
    provider: donationInput.method,
    provider_ref: null,
    amount_cents: donationInput.amountCents,
    status: "pending",
  });

  const checkoutInput: CheckoutProviderInput = {
    donationId: donation.id,
    paymentId: pendingPayment.id,
    amountCents: donationInput.amountCents,
    donorEmail: donationInput.donor.email,
    purpose: donationInput.purpose,
  };
  const checkout =
    donationInput.method === "stripe"
      ? await providers.createStripeCheckout(checkoutInput)
      : await providers.createPayPalOrder(checkoutInput);

  await repository.updatePaymentProviderRef(pendingPayment.id, checkout.providerRef);

  return {
    kind: "redirect",
    donationId: donation.id,
    provider: donationInput.method,
    url: checkout.url,
  };
}
