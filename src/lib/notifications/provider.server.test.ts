import { describe, expect, test } from "bun:test";
import { createResendMailProvider } from "./provider.server";

const input = {
  from: "audit@example.invalid",
  to: "fixture@example.invalid",
  subject: "Fixture",
  html: "<p>Fixture</p>",
  idempotencyKey: "fixture-1",
};

describe("Resend mail provider", () => {
  test("resolved Resend rejection never becomes accepted", async () => {
    const provider = createResendMailProvider(async () => ({
      data: null,
      error: { name: "rate_limit_exceeded" },
    }));
    expect(await provider.send(input)).toEqual({
      kind: "rejected",
      code: "rate_limit_exceeded",
      retryable: true,
    });
  });

  test("transport failures remain retryable rejections", async () => {
    const provider = createResendMailProvider(async () => {
      throw new Error("synthetic outage");
    });
    expect(await provider.send(input)).toEqual({
      kind: "rejected",
      code: "transport_error",
      retryable: true,
    });
  });

  test("missing acceptance id is rejected", async () => {
    const provider = createResendMailProvider(async () => ({ data: null, error: null }));
    expect(await provider.send(input)).toEqual({
      kind: "rejected",
      code: "missing_provider_message_id",
      retryable: true,
    });
  });

  test("returns only the accepted provider id", async () => {
    const provider = createResendMailProvider(async () => ({
      data: { id: "provider-1" },
      error: null,
    }));
    expect(await provider.send(input)).toEqual({
      kind: "accepted",
      providerMessageId: "provider-1",
    });
  });
});
