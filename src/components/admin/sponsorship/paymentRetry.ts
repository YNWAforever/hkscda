/**
 * The idempotency key for one recorded-payment submission. A retry of the same facts after a
 * failure reuses the key, so the server records the payment once. A success ends that
 * submission: the next one, even with identical facts, is a new payment and gets a new key
 * (BUG-45 — a reused key made the RPC replay the first proof and drop the second payment).
 */
export function createPaymentRetryKey(newKey: () => string = () => crypto.randomUUID()) {
  let current: { fingerprint: string; key: string } | null = null;
  return {
    keyFor(fingerprint: string) {
      if (current?.fingerprint !== fingerprint) current = { fingerprint, key: newKey() };
      return current.key;
    },
    clear() {
      current = null;
    },
  };
}

export type PaymentRetryKey = ReturnType<typeof createPaymentRetryKey>;

/** Sends one submission under its retry key and clears the key once it has succeeded. */
export async function submitWithPaymentRetryKey<T>(
  retry: PaymentRetryKey,
  fingerprint: string,
  send: (idempotencyKey: string) => Promise<T>,
): Promise<T> {
  const result = await send(retry.keyFor(fingerprint));
  retry.clear();
  return result;
}
