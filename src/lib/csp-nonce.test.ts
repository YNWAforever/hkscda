import { describe, expect, test } from "bun:test";

import { createCspNonce, currentCspNonce, runWithCspNonce } from "./csp-nonce";

describe("createCspNonce", () => {
  test("returns 16 random bytes as base64, valid in a nonce-source", () => {
    const nonce = createCspNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(atob(nonce)).toHaveLength(16);
  });

  test("is different for every request", () => {
    const nonces = new Set(Array.from({ length: 100 }, () => createCspNonce()));
    expect(nonces.size).toBe(100);
  });

  test("uses the injected byte source (deterministic in tests)", () => {
    const nonce = createCspNonce((bytes) => bytes.fill(7));
    expect(atob(nonce)).toBe(String.fromCharCode(...new Array(16).fill(7)));
  });
});

describe("without an installed request store (the browser build)", () => {
  test("running with a nonce still calls the function and leaves the context empty", () => {
    expect(currentCspNonce()).toBeUndefined();
    expect(runWithCspNonce("browser-nonce", () => currentCspNonce())).toBeUndefined();
    expect(runWithCspNonce("browser-nonce", () => 42)).toBe(42);
  });
});
