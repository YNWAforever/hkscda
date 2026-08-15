import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, test } from "bun:test";

import { getCodConfig } from "./config.server";
import {
  aesCbcDecrypt,
  aesCbcEncrypt,
  createCodRequestEnvelope,
  decodeBase64Strict,
  encodeBase64,
  getCodCipherSuite,
  signRsaSha256,
  verifyCodNotification,
  verifyRsaSha256,
} from "./cod-crypto.server";

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = keyPair.publicKey.export({ type: "spki", format: "pem" }).toString();
const otherPublicKeyPem = otherKeyPair.publicKey.export({ type: "spki", format: "pem" }).toString();

const codEnvironmentNames = [
  "COD_ENV",
  "COD_MERCHANT_ID",
  "COD_SEGMENT_ID",
  "COD_AES_SECRET_BASE64",
  "COD_PRIVATE_KEY_BASE64",
  "COD_NOTIFICATION_PUBLIC_KEY_BASE64",
] as const;

const originalCodEnvironment = new Map(
  codEnvironmentNames.map((name) => [name, process.env[name]]),
);

afterEach(() => {
  for (const name of codEnvironmentNames) {
    const value = originalCodEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function setValidCodEnvironment(
  overrides: Partial<Record<(typeof codEnvironmentNames)[number], string>> = {},
) {
  const values: Record<(typeof codEnvironmentNames)[number], string> = {
    COD_ENV: "sandbox",
    COD_MERCHANT_ID: "merchant-test",
    COD_SEGMENT_ID: "segment-test",
    COD_AES_SECRET_BASE64: Buffer.alloc(16, 7).toString("base64"),
    COD_PRIVATE_KEY_BASE64: Buffer.from(privateKeyPem, "utf8").toString("base64"),
    COD_NOTIFICATION_PUBLIC_KEY_BASE64: Buffer.from(publicKeyPem, "utf8").toString("base64"),
  };

  for (const name of codEnvironmentNames) process.env[name] = overrides[name] ?? values[name];
}

describe("COD configuration", () => {
  test("strictly decodes base64 AES material and accepts 16-byte and 32-byte keys", () => {
    expect(decodeBase64Strict(Buffer.alloc(16, 1).toString("base64"), "AES secret")).toEqual(
      Buffer.alloc(16, 1),
    );
    expect(getCodCipherSuite(Buffer.alloc(16))).toBe("aes-128-cbc-pkcs7-with-rsa-sha256");
    expect(getCodCipherSuite(Buffer.alloc(32))).toBe("aes-256-cbc-pkcs7-with-rsa-sha256");
  });

  test("rejects malformed base64 and unsupported AES key lengths", () => {
    expect(() => decodeBase64Strict("not base64!", "AES secret")).toThrow("valid base64");
    expect(() => decodeBase64Strict("AB==", "AES secret")).toThrow("canonical base64");
    expect(() => getCodCipherSuite(Buffer.alloc(24))).toThrow("16 or 32 bytes");
  });

  test("reads COD configuration lazily and derives the sandbox API base", () => {
    setValidCodEnvironment();

    expect(getCodConfig()).toMatchObject({
      environment: "sandbox",
      merchantId: "merchant-test",
      segmentId: "segment-test",
      apiBase: "https://aqs-api.sandbox-codpayment.com",
      cipherSuite: "aes-128-cbc-pkcs7-with-rsa-sha256",
    });
  });

  test("rejects malformed PEM key material", () => {
    setValidCodEnvironment({
      COD_PRIVATE_KEY_BASE64: Buffer.from("not a PEM", "utf8").toString("base64"),
    });

    expect(() => getCodConfig()).toThrow("private key");
  });

  test("rejects unsupported COD environments", () => {
    setValidCodEnvironment({ COD_ENV: "development" });

    expect(() => getCodConfig()).toThrow("COD_ENV must be sandbox or production");
  });
});

describe("COD request cryptography", () => {
  test.each([
    ["AES-128", Buffer.alloc(16, 9)],
    ["AES-256", Buffer.alloc(32, 10)],
  ])("round-trips %s AES-CBC PKCS#7 payloads", (_name, key) => {
    const plaintext = Buffer.from('{"amount":"100.00","currency":"HKD"}', "utf8");
    const encrypted = aesCbcEncrypt(plaintext, key);

    expect(encrypted.iv).toHaveLength(16);
    expect(encrypted.ciphertext).not.toEqual(plaintext);
    expect(aesCbcDecrypt(encrypted.ciphertext, key, encrypted.iv)).toEqual(plaintext);
  });

  test("uses a fresh random IV for each encryption", () => {
    const plaintext = Buffer.from("same payload", "utf8");
    const key = Buffer.alloc(16, 3);

    const first = aesCbcEncrypt(plaintext, key);
    const second = aesCbcEncrypt(plaintext, key);

    expect(first.iv).toHaveLength(16);
    expect(second.iv).toHaveLength(16);
    expect(first.iv.equals(second.iv)).toBeFalse();
    expect(first.ciphertext.equals(second.ciphertext)).toBeFalse();
  });

  test("rejects IVs that are not exactly 16 bytes", () => {
    expect(() => aesCbcEncrypt(Buffer.from("payload"), Buffer.alloc(16), Buffer.alloc(15))).toThrow(
      "exactly 16 bytes",
    );
    expect(() => aesCbcDecrypt(Buffer.from("payload"), Buffer.alloc(16), Buffer.alloc(17))).toThrow(
      "exactly 16 bytes",
    );
  });

  test("signs and verifies the exact nonce and ciphertext byte sequence", () => {
    const nonce = Buffer.alloc(16, 4);
    const ciphertext = Buffer.from([1, 2, 3, 4, 5]);
    const signedBytes = Buffer.concat([nonce, ciphertext]);
    const signature = signRsaSha256(signedBytes, privateKeyPem);

    expect(verifyRsaSha256(signedBytes, signature, publicKeyPem)).toBeTrue();
    expect(
      verifyRsaSha256(
        Buffer.concat([nonce, Buffer.from([1, 2, 3, 4, 6])]),
        signature,
        publicKeyPem,
      ),
    ).toBeFalse();
    expect(
      verifyRsaSha256(Buffer.concat([Buffer.alloc(16, 5), ciphertext]), signature, publicKeyPem),
    ).toBeFalse();
    expect(
      verifyRsaSha256(
        signedBytes,
        Buffer.from(signature.map((byte, index) => (index === 0 ? byte ^ 1 : byte))),
        publicKeyPem,
      ),
    ).toBeFalse();
    expect(verifyRsaSha256(signedBytes, signature, otherPublicKeyPem)).toBeFalse();
  });

  test("builds an envelope with a signature over raw nonce and ciphertext bytes", () => {
    const aesKey = Buffer.alloc(16, 11);
    const plaintext = Buffer.from('{"service":"create_transaction"}', "utf8");
    const envelope = createCodRequestEnvelope({
      merchantId: "merchant-test",
      plaintext,
      aesKey,
      privateKey: privateKeyPem,
    });
    const nonce = decodeBase64Strict(envelope.nonce, "nonce");
    const ciphertext = decodeBase64Strict(envelope.message, "message");
    const tag = decodeBase64Strict(envelope.tag, "tag");

    expect(envelope.merchant_id).toBe("merchant-test");
    expect(envelope.cipher_suite).toBe("aes-128-cbc-pkcs7-with-rsa-sha256");
    expect(verifyRsaSha256(Buffer.concat([nonce, ciphertext]), tag, publicKeyPem)).toBeTrue();
    expect(aesCbcDecrypt(ciphertext, aesKey, nonce)).toEqual(plaintext);
  });

  test("verifies notification signatures against the original data string bytes", () => {
    const originalData = '{ "status": "SUCCESS", "message": "\\u55ae\\u64da" }';
    const tag = encodeBase64(signRsaSha256(Buffer.from(originalData, "utf8"), privateKeyPem));

    expect(verifyCodNotification(originalData, tag, publicKeyPem)).toBeTrue();
    expect(
      verifyCodNotification('{"status":"SUCCESS","message":"單據"}', tag, publicKeyPem),
    ).toBeFalse();
  });
});
