/**
 * Per-request CSP nonce: generation plus the request-scoped store the SSR render reads it from.
 *
 * This module is isomorphic: `src/router.tsx` imports `currentCspNonce()` and runs in both the
 * browser and the server, so it must not import `node:async_hooks`. The real
 * `AsyncLocalStorage`-backed store lives in `csp-nonce.server.ts` and installs itself into the
 * global registry below; on the client (or in a test that never installs one) the store is absent
 * and `currentCspNonce()` returns `undefined`.
 *
 * The registry hangs off `globalThis` rather than a module-level variable so the SSR server bundle
 * and the router chunk see the same store even when a bundler emits them as separate chunks.
 *
 * Security: the nonce is not a secret (it is printed in the markup) — it only has to be
 * unguessable *before* a response is produced and unique per response, so an injected script
 * cannot predict a value and reuse it. 16 random bytes (128 bits) base64-encoded is the usual
 * CSP practice.
 */

export type CspNonceStore = {
  /** Run `fn` with `nonce` as the current request's nonce, including through awaited work. */
  run<T>(nonce: string, fn: () => T): T;
  /** The nonce of the request currently being handled, if any. */
  current(): string | undefined;
};

const NONCE_BYTES = 16;

const STORE_GLOBAL_KEY = "__hkscdaCspNonceStore";

type GlobalWithCspNonceStore = typeof globalThis & {
  [STORE_GLOBAL_KEY]?: CspNonceStore;
};

function globalRegistry(): GlobalWithCspNonceStore {
  return globalThis as GlobalWithCspNonceStore;
}

/** Bind the request-scoped store. Called once, by `csp-nonce.server.ts`. */
export function installCspNonceStore(store: CspNonceStore): void {
  globalRegistry()[STORE_GLOBAL_KEY] = store;
}

/**
 * Run the SSR work for one request with its nonce in scope. Without an installed store this is a
 * plain call (the browser build, or a test that does not exercise the server path).
 */
export function runWithCspNonce<T>(nonce: string, fn: () => T): T {
  const store = globalRegistry()[STORE_GLOBAL_KEY];
  return store ? store.run(nonce, fn) : fn();
}

/** The current request's nonce, read by `getRouter()` so TanStack Start stamps its inline scripts. */
export function currentCspNonce(): string | undefined {
  return globalRegistry()[STORE_GLOBAL_KEY]?.current();
}

/**
 * A fresh CSP nonce: 16 random bytes as base64. The optional source is for tests; production uses
 * the platform Web Crypto (`crypto.getRandomValues`, available on the Node runtime Vercel uses and
 * in the browser).
 *
 * `btoa` gives the base64 alphabet CSP's `base64-value` grammar accepts (`+`, `/` and `=` are all
 * allowed in a nonce-source, unlike an HTML attribute value concern).
 */
export function createCspNonce(
  randomBytes: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = randomBytes(new Uint8Array(NONCE_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
