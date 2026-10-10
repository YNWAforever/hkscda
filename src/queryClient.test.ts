import { describe, expect, test } from "bun:test";

import { AdminHttpError, AdminSessionError } from "./lib/admin/session";
import { createQueryClient } from "./queryClient";

function defaultRetry(server: boolean) {
  const retry = createQueryClient({ server }).getDefaultOptions().queries?.retry;
  if (typeof retry !== "function") throw new Error("expected a retry function");
  return retry;
}

describe("createQueryClient", () => {
  test("does not retry a query that failed on a lapsed session", async () => {
    const queryClient = createQueryClient({ server: false });
    let calls = 0;
    const error = await queryClient
      .fetchQuery({
        queryKey: ["me"],
        queryFn: () => {
          calls += 1;
          return Promise.reject(new AdminSessionError("not_signed_in"));
        },
      })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AdminSessionError);
    expect(calls).toBe(1);
  });

  test("in the browser, stops on a 401 and keeps three retries for other failures", () => {
    const retry = defaultRetry(false);
    expect(retry(0, new AdminHttpError("API request failed", 401))).toBe(false);
    expect(retry(0, new AdminHttpError("boom", 500))).toBe(true);
    expect(retry(2, new AdminHttpError("boom", 500))).toBe(true);
    expect(retry(3, new AdminHttpError("boom", 500))).toBe(false);
  });

  test("on the server, keeps React Query's default of no retries", () => {
    const retry = defaultRetry(true);
    expect(retry(0, new AdminHttpError("boom", 500))).toBe(false);
    expect(retry(0, new AdminSessionError("not_signed_in"))).toBe(false);
  });

  test("leaves mutation retry at React Query's default", () => {
    expect(
      createQueryClient({ server: false }).getDefaultOptions().mutations?.retry,
    ).toBeUndefined();
  });
});
