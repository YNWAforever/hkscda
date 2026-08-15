import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomBytes,
  type KeyObject,
} from "node:crypto";

export type CodCipherSuite =
  | "aes-128-cbc-pkcs7-with-rsa-sha256"
  | "aes-256-cbc-pkcs7-with-rsa-sha256";

type RsaKey = KeyObject | string | Buffer;

export interface CodRequestEnvelope {
  merchant_id: string;
  message: string;
  nonce: string;
  tag: string;
  cipher_suite: CodCipherSuite;
}

export function decodeBase64Strict(value: string, label: string): Buffer {
  const isCanonicalBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
    value,
  );
  if (!isCanonicalBase64) throw new Error(`${label} must be valid base64`);

  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error(`${label} must be canonical base64`);
  }
  return decoded;
}

export function encodeBase64(value: Buffer): string {
  return value.toString("base64");
}

export function getCodCipherSuite(aesKey: Buffer): CodCipherSuite {
  if (aesKey.length === 16) return "aes-128-cbc-pkcs7-with-rsa-sha256";
  if (aesKey.length === 32) return "aes-256-cbc-pkcs7-with-rsa-sha256";
  throw new Error("COD AES key must be exactly 16 or 32 bytes");
}

function assertIv(iv: Buffer) {
  if (iv.length !== 16) throw new Error("COD AES IV must be exactly 16 bytes");
}

function getAesAlgorithm(aesKey: Buffer) {
  return getCodCipherSuite(aesKey).startsWith("aes-128") ? "aes-128-cbc" : "aes-256-cbc";
}

export function aesCbcEncrypt(plaintext: Buffer, aesKey: Buffer, iv = randomBytes(16)) {
  assertIv(iv);
  const cipher = createCipheriv(getAesAlgorithm(aesKey), aesKey, iv);

  return {
    iv,
    ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]),
  };
}

export function aesCbcDecrypt(ciphertext: Buffer, aesKey: Buffer, iv: Buffer): Buffer {
  assertIv(iv);
  const decipher = createDecipheriv(getAesAlgorithm(aesKey), aesKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function parseRsaPrivateKey(pem: string): KeyObject {
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== "rsa") throw new Error("not RSA");
    return key;
  } catch {
    throw new Error("COD private key must be a valid RSA PEM");
  }
}

export function parseRsaPublicKey(pem: string): KeyObject {
  try {
    if (/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(pem)) throw new Error("private PEM");
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "rsa") throw new Error("not RSA");
    return key;
  } catch {
    throw new Error("COD notification public key must be a valid RSA PEM");
  }
}

export function signRsaSha256(data: Buffer, privateKey: RsaKey): Buffer {
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  return signer.sign(privateKey);
}

export function verifyRsaSha256(data: Buffer, signature: Buffer, publicKey: RsaKey): boolean {
  const verifier = createVerify("RSA-SHA256");
  verifier.update(data);
  verifier.end();
  return verifier.verify(publicKey, signature);
}

export function verifyCodNotification(
  data: string,
  tag: string,
  notificationPublicKey: RsaKey,
): boolean {
  try {
    return verifyRsaSha256(
      Buffer.from(data, "utf8"),
      decodeBase64Strict(tag, "COD notification tag"),
      notificationPublicKey,
    );
  } catch {
    return false;
  }
}

export function createCodRequestEnvelope({
  merchantId,
  plaintext,
  aesKey,
  privateKey,
}: {
  merchantId: string;
  plaintext: Buffer;
  aesKey: Buffer;
  privateKey: RsaKey;
}): CodRequestEnvelope {
  const { iv, ciphertext } = aesCbcEncrypt(plaintext, aesKey);
  const signature = signRsaSha256(Buffer.concat([iv, ciphertext]), privateKey);

  return {
    merchant_id: merchantId,
    message: encodeBase64(ciphertext),
    nonce: encodeBase64(iv),
    tag: encodeBase64(signature),
    cipher_suite: getCodCipherSuite(aesKey),
  };
}
