import { describe, expect, test } from "bun:test";

import {
  SPONSORSHIP_MULTIPART_MAX_BYTES,
  parseSponsorshipMultipart,
  validateSponsorshipSubmissionRequestHeaders,
} from "./submission.server";

const animalId = "11111111-2222-4333-8444-555555555555";

function basePayloadJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    language: "zh-HK",
    monthlyTier: "300",
    animalPreferences: [
      { rank: 1, animalId, animalName: "白雪", animalType: "sponsor" },
    ],
    contact: { supporterName: "陳小姐", email: "chan@example.com", phone: "91234567" },
    consents: { email: true, whatsapp: false },
    terms: { agreed: true },
    turnstileToken: "test-token",
    ...overrides,
  });
}

function multipartRequest(fields: Record<string, string>, file?: { name: string; content: string }) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  if (file) formData.set("proof", new File([file.content], file.name, { type: "image/jpeg" }));
  return new Request("http://localhost/api/sponsorships/pledges", {
    method: "POST",
    body: formData,
  });
}

describe("validateSponsorshipSubmissionRequestHeaders", () => {
  test("rejects a missing content-type", () => {
    const request = new Request("http://localhost", { method: "POST" });
    expect(validateSponsorshipSubmissionRequestHeaders(request)).toEqual({
      ok: false,
      status: 400,
      error: "Missing content-type",
    });
  });

  test("rejects a non-multipart content-type", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(validateSponsorshipSubmissionRequestHeaders(request).ok).toBe(false);
  });

  test("rejects an oversized content-length", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(SPONSORSHIP_MULTIPART_MAX_BYTES + 1),
      },
    });
    expect(validateSponsorshipSubmissionRequestHeaders(request)).toEqual({
      ok: false,
      status: 413,
      error: "Sponsorship pledge upload is too large",
    });
  });

  test("accepts a well-formed multipart request", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
    });
    expect(validateSponsorshipSubmissionRequestHeaders(request)).toEqual({ ok: true });
  });
});

describe("parseSponsorshipMultipart", () => {
  test("parses a payload without proof", async () => {
    const request = multipartRequest({ payload: basePayloadJson() });
    const parsed = await parseSponsorshipMultipart(request);
    expect(parsed.payload.contact.supporterName).toBe("陳小姐");
    expect(parsed.payload.turnstileToken).toBe("test-token");
    expect(parsed.proof).toBeUndefined();
  });

  test("parses a payload with proof metadata and a proof file", async () => {
    const request = multipartRequest(
      {
        payload: basePayloadJson({
          proofMetadata: {
            paymentMethod: "fps",
            reference: "REF1",
            amountCents: 30000,
            paymentDate: "2026-07-01",
          },
        }),
      },
      { name: "proof.jpg", content: "fake-image-bytes" },
    );
    const parsed = await parseSponsorshipMultipart(request);
    expect(parsed.proof?.fileName).toBe("proof.jpg");
    expect(parsed.proof?.metadata.paymentMethod).toBe("fps");
  });

  test("rejects proof metadata without a file", async () => {
    const request = multipartRequest({
      payload: basePayloadJson({
        proofMetadata: {
          paymentMethod: "fps",
          amountCents: 30000,
          paymentDate: "2026-07-01",
        },
      }),
    });
    await expect(parseSponsorshipMultipart(request)).rejects.toThrow();
  });

  test("rejects a proof file without metadata", async () => {
    const request = multipartRequest(
      { payload: basePayloadJson() },
      { name: "proof.jpg", content: "fake-image-bytes" },
    );
    await expect(parseSponsorshipMultipart(request)).rejects.toThrow();
  });

  test("rejects a missing payload field", async () => {
    const request = multipartRequest({});
    await expect(parseSponsorshipMultipart(request)).rejects.toThrow();
  });
});
