import { createHash, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getCodConfig, getCodConfigurationErrorField } from "../src/lib/donations/config.server";
import {
  aesCbcDecrypt,
  createCodRequestEnvelope,
  verifyRsaSha256,
} from "../src/lib/donations/cod-crypto.server";

// Offline only: no network requests, business writes, provider activation or secret output.
try {
  const config = getCodConfig();
  const fingerprint = (key: ReturnType<typeof createPublicKey>) =>
    createHash("sha256")
      .update(key.export({ type: "spki", format: "der" }))
      .digest("hex");
  const expectedKey = createPublicKey(
    await readFile(
      new URL(
        "../docs/evidence/cod-credential-20260906/cod-aqs-production-public.pem",
        import.meta.url,
      ),
    ),
  );
  const notificationFingerprint = fingerprint(config.notificationPublicKey);
  const sample = Buffer.from('{"purpose":"offline-credential-validation"}');
  const envelope = createCodRequestEnvelope({
    merchantId: config.merchantId,
    plaintext: sample,
    aesKey: config.aesKey,
    privateKey: config.privateKey,
  });
  const nonce = Buffer.from(envelope.nonce, "base64");
  const message = Buffer.from(envelope.message, "base64");
  const roundTrip = aesCbcDecrypt(message, config.aesKey, nonce).equals(sample);
  const signature = verifyRsaSha256(
    Buffer.concat([nonce, message]),
    Buffer.from(envelope.tag, "base64"),
    createPublicKey(config.privateKey),
  );
  const productionNotificationKeyMatches = notificationFingerprint === fingerprint(expectedKey);
  const passed =
    roundTrip &&
    signature &&
    (config.environment !== "production" || productionNotificationKeyMatches);
  console.log(
    JSON.stringify({
      passed,
      environment: config.environment,
      aesBits: config.aesKey.length * 8,
      merchantRsaBits: config.privateKey.asymmetricKeyDetails?.modulusLength,
      notificationFingerprint,
      productionNotificationKeyMatches,
      roundTrip,
      signature,
      providerAcceptance: "not_tested",
    }),
  );
  if (!passed) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({
      passed: false,
      configurationField: getCodConfigurationErrorField(error),
      error: "Offline COD credential validation failed",
    }),
  );
  process.exitCode = 1;
}
