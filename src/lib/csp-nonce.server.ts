import { AsyncLocalStorage } from "node:async_hooks";

import { installCspNonceStore, runWithCspNonce } from "./csp-nonce";

/**
 * Server-only half of the CSP nonce plumbing: the `AsyncLocalStorage` that keeps one request's
 * nonce in scope from the Vercel handler through TanStack Start's SSR render (where
 * `src/router.tsx` reads it via `currentCspNonce()`).
 *
 * Importing this module installs the store. `src/server.ts` imports it before delegating to the
 * Start handler; the `.server.ts` suffix keeps `node:async_hooks` out of the client bundle.
 */
const requestNonces = new AsyncLocalStorage<{ nonce: string }>();

installCspNonceStore({
  run: (nonce, fn) => requestNonces.run({ nonce }, fn),
  current: () => requestNonces.getStore()?.nonce,
});

export { currentCspNonce, createCspNonce, runWithCspNonce } from "./csp-nonce";
