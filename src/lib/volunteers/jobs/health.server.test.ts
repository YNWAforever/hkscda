import { expect, test } from "bun:test";
import { readVolunteerJobHealth } from "./health.server";

test("both health reads cancel through the query builder before its single-row terminal", async () => {
  let cancelled = 0;
  const controller = new AbortController();
  const client = {
    from() {
      let signal: AbortSignal | undefined;
      const read = () =>
        new Promise<{ data: null; error: { code: string } }>((resolve) => {
          const abort = () => {
            cancelled++;
            resolve({ data: null, error: { code: "57014" } });
          };
          if (signal?.aborted) abort();
          else signal?.addEventListener("abort", abort, { once: true });
        });
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        abortSignal: (incoming: AbortSignal) => {
          signal = incoming;
          return query;
        },
        // Like the SDK, this terminal no longer exposes builder methods.
        maybeSingle: () => read(),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          read().then(resolve, reject),
      };
      return query;
    },
  };
  const pending = readVolunteerJobHealth(
    client as never,
    () => new Date("2026-10-25T03:00:00Z"),
    controller.signal,
  );
  controller.abort();
  expect(await pending).toMatchObject({ state: "unknown" });
  expect(cancelled).toBe(2);
});
