import { expect, test } from "bun:test";

import { pickSponsorshipDraftData } from "./draft";

test("sponsorship draft excludes proof, consent, status token, and unknown fields", () => {
  expect(
    pickSponsorshipDraftData({
      monthlyTier: "300",
      customAmount: "",
      supporterName: "Ada",
      email: "ada@example.com",
      phone: "12345678",
      notes: "hello",
      proofFile: { name: "receipt.jpg" },
      termsAgreed: true,
      emailConsent: true,
      statusToken: "secret",
      otp: "123456",
    }),
  ).toEqual({
    monthlyTier: "300",
    customAmount: "",
    supporterName: "Ada",
    email: "ada@example.com",
    phone: "12345678",
    notes: "hello",
  });
});
