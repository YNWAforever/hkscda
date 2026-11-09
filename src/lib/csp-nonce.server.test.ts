import { describe, expect, test } from "bun:test";

import { currentCspNonce, runWithCspNonce } from "./csp-nonce.server";

// Importing csp-nonce.server installs the AsyncLocalStorage-backed store on globalThis.
describe("request-scoped CSP nonce", () => {
  test("is undefined outside a request and set inside one", () => {
    expect(currentCspNonce()).toBeUndefined();
    expect(runWithCspNonce("nonce-one", () => currentCspNonce())).toBe("nonce-one");
    expect(currentCspNonce()).toBeUndefined();
  });

  test("keeps concurrent requests isolated across awaits", async () => {
    const seen: Array<[string, string | undefined]> = [];
    const request = (nonce: string, delayMs: number) =>
      runWithCspNonce(nonce, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        seen.push([nonce, currentCspNonce()]);
        await Promise.resolve();
        seen.push([nonce, currentCspNonce()]);
      });

    await Promise.all([request("request-a", 10), request("request-b", 1)]);
    expect(seen).toHaveLength(4);
    for (const [expected, actual] of seen) expect(actual).toBe(expected);
  });

  test("a nested run restores the outer request's nonce afterwards", () => {
    expect(
      runWithCspNonce("outer", () => {
        const inner = runWithCspNonce("inner", () => currentCspNonce());
        return [inner, currentCspNonce()];
      }),
    ).toEqual(["inner", "outer"]);
  });
});
