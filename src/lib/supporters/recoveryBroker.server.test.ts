import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import {
  createRecoveryBroker,
  parseRecoveryTokenKey,
  type RecoveryChallengeRepository,
} from "./recoveryBroker.server";

function fixture(
  options: {
    exchange?: "wrong_user" | "wrong_email" | "unverified" | "timeout";
    delivery?: "rejected" | "timeout";
  } = {},
) {
  const rows = new Map<string, Parameters<RecoveryChallengeRepository["put"]>[0]>();
  const sent: { html: string }[] = [];
  let exchanges = 0;
  const repository: RecoveryChallengeRepository = {
    async put(input) {
      rows.set(input.id, input);
    },
    async consume(input) {
      const row = rows.get(input.id);
      if (
        !row ||
        row.emailFingerprint !== input.emailFingerprint ||
        row.codeFingerprint !== input.codeFingerprint
      )
        return null;
      rows.delete(input.id);
      return { userId: row.userId, sealedCarrier: row.sealedCarrier };
    },
    async invalidate(id) {
      rows.delete(id);
    },
  };
  const userId = "12345678-1234-4234-8234-123456789012";
  const broker = createRecoveryBroker({
    key: Buffer.alloc(32, 7),
    repository,
    carrier: {
      async generate(email) {
        return {
          userId,
          email,
          tokenHash: "hidden-provider-carrier".repeat(3),
          type: "magiclink" as const,
        };
      },
      async exchange() {
        exchanges++;
        if (options.exchange === "timeout") throw new Error("Synthetic timeout");
        return {
          access_token: "synthetic-access",
          refresh_token: "synthetic-refresh",
          userId:
            options.exchange === "wrong_user" ? "87654321-1234-4234-8234-123456789012" : userId,
          email: options.exchange === "wrong_email" ? "other@example.invalid" : "a@example.invalid",
          verified: options.exchange !== "unverified",
        };
      },
    },
    mail: {
      async send(input) {
        sent.push(input);
        if (options.delivery === "timeout") throw new Error("Synthetic send timeout");
        return options.delivery === "rejected"
          ? { kind: "rejected", code: "synthetic", retryable: true }
          : { kind: "accepted", providerMessageId: "sink-only" };
      },
    },
    from: "HKSCDA <test@example.invalid>",
  });
  return { broker, rows, sent, repository, exchanges: () => exchanges };
}

test("only the application code reaches email; stored ciphertext and fingerprints reveal no carrier or email", async () => {
  const f = fixture();
  const id = randomUUID();
  await f.broker.issue("a@example.invalid", id);
  const row = f.rows.get(id)!;
  expect(f.sent[0].html).toMatch(/\b[0-9]{8}\b/);
  expect(f.sent[0].html).not.toContain("hidden-provider-carrier");
  expect(JSON.stringify(row)).not.toContain("a@example.invalid");
  expect(JSON.stringify(row)).not.toContain("hidden-provider-carrier");
  expect(JSON.stringify(row)).not.toContain(f.sent[0].html.match(/\b[0-9]{8}\b/)![0]);
});

test("wrong email or code cannot consume a challenge; replay cannot produce another session", async () => {
  const f = fixture();
  const id = randomUUID();
  await f.broker.issue("a@example.invalid", id);
  const code = f.sent[0].html.match(/\b[0-9]{8}\b/)![0];
  await expect(
    f.broker.verify({ email: "wrong@example.invalid", challengeId: id, code }),
  ).rejects.toMatchObject({ code: "invalid_code" });
  await expect(
    f.broker.verify({
      email: "a@example.invalid",
      challengeId: id,
      code: code === "00000000" ? "11111111" : "00000000",
    }),
  ).rejects.toMatchObject({ code: "invalid_code" });
  expect(await f.broker.verify({ email: " A@example.invalid ", challengeId: id, code })).toEqual({
    access_token: "synthetic-access",
    refresh_token: "synthetic-refresh",
  });
  await expect(
    f.broker.verify({ email: "a@example.invalid", challengeId: id, code }),
  ).rejects.toMatchObject({ code: "invalid_code" });
  expect(f.exchanges()).toBe(1);
});

test("a swapped encrypted carrier fails closed after consumption", async () => {
  const f = fixture();
  const a = randomUUID();
  const b = randomUUID();
  await f.broker.issue("a@example.invalid", a);
  await f.broker.issue("a@example.invalid", b);
  f.rows.get(a)!.sealedCarrier = f.rows.get(b)!.sealedCarrier;
  const code = f.sent[0].html.match(/\b[0-9]{8}\b/)![0];
  await expect(
    f.broker.verify({ email: "a@example.invalid", challengeId: a, code }),
  ).rejects.toMatchObject({ code: "invalid_code" });
  expect(f.exchanges()).toBe(0);
  expect(f.rows.has(a)).toBe(false);
});

test("invalid or missing recovery key is refused before a broker can call providers", () => {
  for (const value of [undefined, "", "not-base64", Buffer.alloc(16).toString("base64")]) {
    expect(() => parseRecoveryTokenKey(value)).toThrow();
  }
  expect(parseRecoveryTokenKey(Buffer.alloc(32, 7).toString("base64"))).toEqual(
    Buffer.alloc(32, 7),
  );
});

for (const exchange of ["wrong_user", "wrong_email", "unverified", "timeout"] as const) {
  test(`provider ${exchange} cannot release tokens or revive the consumed challenge`, async () => {
    const f = fixture({ exchange });
    const id = randomUUID();
    await f.broker.issue("a@example.invalid", id);
    const input = {
      email: "a@example.invalid",
      challengeId: id,
      code: f.sent[0].html.match(/\b[0-9]{8}\b/)![0],
    };
    await expect(f.broker.verify(input)).rejects.toMatchObject({ code: "invalid_code" });
    await expect(f.broker.verify(input)).rejects.toMatchObject({ code: "invalid_code" });
    expect(f.exchanges()).toBe(1);
    expect(f.rows.has(id)).toBe(false);
  });
}
for (const delivery of ["rejected", "timeout"] as const) {
  test(`delivery ${delivery} invalidates the code before a possible retry`, async () => {
    const f = fixture({ delivery });
    const id = randomUUID();
    await expect(f.broker.issue("a@example.invalid", id)).rejects.toMatchObject({
      code: "unavailable",
    });
    const input = {
      email: "a@example.invalid",
      challengeId: id,
      code: f.sent[0].html.match(/\b[0-9]{8}\b/)![0],
    };
    await expect(f.broker.verify(input)).rejects.toMatchObject({ code: "invalid_code" });
    expect(f.exchanges()).toBe(0);
    expect(f.rows.has(id)).toBe(false);
  });
}
