import { AsyncLocalStorage } from "node:async_hooks";

// h3 can turn a thrown request error into a generic response. Keep the original
// error in that request's async context so concurrent responses cannot consume
// each other's stack.
type RequestError = { error?: unknown };
const requestErrors = new AsyncLocalStorage<RequestError>();

function record(error: unknown) {
  const current = requestErrors.getStore();
  if (current) current.error = error;
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function withRequestErrorCapture<T>(run: () => T): T {
  return requestErrors.run({}, run);
}

export function consumeLastCapturedError(): unknown {
  const current = requestErrors.getStore();
  const error = current?.error;
  if (current) current.error = undefined;
  return error;
}
