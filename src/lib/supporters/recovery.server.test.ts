import { expect, test } from "bun:test";
import { RecoveryError, requestRecovery } from "./recovery.server";

function deps(sent: string[] = []) {
  return {
    ip: "203.0.113.8",
    rate: async () => ({ ok: true }),
    challenge: async () => true,
    sendOtp: async (email: string) => {
      sent.push(email);
    },
  };
}

test("known and unknown valid emails have the same public response and no membership probe", async () => {
  const sent: string[] = [];
  const service = deps(sent);
  expect(
    await requestRecovery({ email: " KNOWN@EXAMPLE.INVALID ", challengeToken: "ok" }, service),
  ).toEqual({ accepted: true });
  expect(
    await requestRecovery({ email: "unknown@example.invalid", challengeToken: "ok" }, service),
  ).toEqual({ accepted: true });
  expect(sent).toEqual(["known@example.invalid", "unknown@example.invalid"]);
});

test("rate limit and challenge prevent an OTP request", async () => {
  const sent: string[] = [];
  await expect(
    requestRecovery(
      { email: "a@example.invalid" },
      {
        ...deps(sent),
        rate: async () => ({ ok: false, unavailable: true }),
      },
    ),
  ).rejects.toMatchObject({ code: "unavailable" });
  await expect(
    requestRecovery(
      { email: "a@example.invalid" },
      {
        ...deps(sent),
        challenge: async () => false,
      },
    ),
  ).rejects.toMatchObject({ code: "challenge" });
  expect(sent).toEqual([]);
});

test("provider failure stays indistinguishable from absent membership", async () => {
  const result = await requestRecovery(
    { email: "a@example.invalid" },
    {
      ...deps(),
      sendOtp: async () => {
        throw new Error("provider rejected email");
      },
    },
  );
  expect(result).toEqual({ accepted: true });
});

test("invalid email does not invoke the provider", async () => {
  const sent: string[] = [];
  await expect(requestRecovery({ email: "bad" }, deps(sent))).rejects.toBeInstanceOf(RecoveryError);
  expect(sent).toEqual([]);
});
