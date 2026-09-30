import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
} from "node:crypto";
import { z } from "zod";

import type { MailProvider } from "../notifications/provider.server";
import { normalizeRecoveryEmail, RecoveryError } from "./recovery.server";

const purpose = "supporter-recovery-v1";
const carrierSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  tokenHash: z.string().min(32).max(256),
  type: z.enum(["magiclink", "signup"]),
});
export type RecoveryCarrier = z.infer<typeof carrierSchema>;
export type RecoverySession = { access_token: string; refresh_token: string };
export type RecoveryCarrierProvider = {
  generate(email: string): Promise<RecoveryCarrier>;
  exchange(
    carrier: RecoveryCarrier,
  ): Promise<RecoverySession & { userId: string; email: string; verified: boolean }>;
};
export type RecoveryChallengeRepository = {
  put(input: {
    id: string;
    userId: string;
    emailFingerprint: string;
    codeFingerprint: string;
    sealedCarrier: string;
  }): Promise<void>;
  consume(input: {
    id: string;
    emailFingerprint: string;
    codeFingerprint: string;
  }): Promise<{ userId: string; sealedCarrier: string } | null>;
  invalidate(id: string): Promise<void>;
};

export function parseRecoveryTokenKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new RecoveryError("unavailable");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== value)
    throw new RecoveryError("unavailable");
  return bytes;
}

export function createRecoveryBroker(deps: {
  key: Buffer;
  repository: RecoveryChallengeRepository;
  carrier: RecoveryCarrierProvider;
  mail: MailProvider;
  from: string;
  replyTo?: string;
}) {
  if (deps.key.length !== 32) throw new RecoveryError("unavailable");
  const encryptionKey = Buffer.from(
    hkdfSync("sha256", deps.key, purpose, "carrier-encryption", 32),
  );
  const fingerprintKey = Buffer.from(
    hkdfSync("sha256", deps.key, purpose, "token-fingerprint", 32),
  );
  const fingerprint = (...values: string[]) =>
    createHmac("sha256", fingerprintKey)
      .update(JSON.stringify([purpose, ...values]))
      .digest("hex");
  const context = (id: string, email: string) => Buffer.from(JSON.stringify([purpose, id, email]));
  function seal(carrier: RecoveryCarrier, id: string, email: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    cipher.setAAD(context(id, email));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(carrier), "utf8"),
      cipher.final(),
    ]);
    return "v1." + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  }
  function unseal(value: string, id: string, email: string) {
    if (!/^v1\.[A-Za-z0-9_-]+$/.test(value) || value.length > 4096)
      throw new Error("Invalid carrier");
    const bytes = Buffer.from(value.slice(3), "base64url");
    if (bytes.length <= 28) throw new Error("Invalid carrier");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, bytes.subarray(0, 12));
    decipher.setAAD(context(id, email));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return carrierSchema.parse(
      JSON.parse(
        Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"),
      ),
    );
  }
  return {
    async issue(rawEmail: string, id: string): Promise<void> {
      const email = normalizeRecoveryEmail(rawEmail);
      if (!z.string().uuid().safeParse(id).success) throw new RecoveryError("unavailable");
      const carrier = carrierSchema.parse(await deps.carrier.generate(email));
      if (normalizeRecoveryEmail(carrier.email) !== email) throw new RecoveryError("unavailable");
      const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
      await deps.repository.put({
        id,
        userId: carrier.userId,
        emailFingerprint: fingerprint("email", email),
        codeFingerprint: fingerprint("code", id, email, code),
        sealedCarrier: seal(carrier, id, email),
      });
      try {
        const result = await deps.mail.send({
          from: deps.from,
          to: email,
          replyTo: deps.replyTo,
          idempotencyKey: purpose + ":" + id,
          subject: "HKSCDA 支持者登入驗證碼",
          html: `<p>你的支持者登入驗證碼：</p><p><strong>${code}</strong></p><p>只可使用一次，15 分鐘後到期。請在剛才提出申請的頁面輸入；切勿向任何人提供驗證碼。如非你提出申請，請忽略此電郵。</p>`,
        });
        if (result.kind !== "accepted") throw new RecoveryError("unavailable");
      } catch {
        // A delivery timeout might still have sent mail: invalidate before allowing a new request.
        await deps.repository.invalidate(id);
        throw new RecoveryError("unavailable");
      }
    },
    async verify(input: {
      email: string;
      challengeId: string;
      code: string;
    }): Promise<RecoverySession> {
      const email = normalizeRecoveryEmail(input.email);
      const code = input.code.trim();
      if (!z.string().uuid().safeParse(input.challengeId).success || !/^[0-9]{8}$/.test(code))
        throw new RecoveryError("invalid_code");
      const row = await deps.repository.consume({
        id: input.challengeId,
        emailFingerprint: fingerprint("email", email),
        codeFingerprint: fingerprint("code", input.challengeId, email, code),
      });
      if (!row) throw new RecoveryError("invalid_code");
      try {
        const carrier = unseal(row.sealedCarrier, input.challengeId, email);
        if (carrier.userId !== row.userId || normalizeRecoveryEmail(carrier.email) !== email)
          throw new Error("Identity mismatch");
        // Consumption is committed before this exchange. Never retry a carrier after a timeout.
        const session = await deps.carrier.exchange(carrier);
        if (
          !session.verified ||
          session.userId !== row.userId ||
          normalizeRecoveryEmail(session.email) !== email ||
          !session.access_token ||
          !session.refresh_token
        )
          throw new Error("Invalid session");
        return { access_token: session.access_token, refresh_token: session.refresh_token };
      } catch {
        throw new RecoveryError("invalid_code");
      }
    },
  };
}
