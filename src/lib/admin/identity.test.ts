import { describe, expect, test } from "bun:test";

import {
  ADMIN_IDENTITY_QUERY_KEY,
  ADMIN_IDENTITY_STALE_TIME_MS,
  adminIdentityQueryOptions,
} from "./identity";
import { fetchAdminIdentity } from "./session";

describe("admin identity query options", () => {
  test("every consumer gets the same cache key", () => {
    // Six places resolved the identity before this existed, under two different
    // keys — so invalidating one left the other showing a stale role.
    //
    // queryOptions() brands queryKey with react-query's DataTag type so it can
    // infer data types at the useQuery call sites. Spread both sides to compare
    // contents rather than the branded type.
    expect([...adminIdentityQueryOptions().queryKey]).toEqual([...ADMIN_IDENTITY_QUERY_KEY]);
    expect([...ADMIN_IDENTITY_QUERY_KEY]).toEqual(["admin-me"]);
  });

  test("uses the shared fetcher rather than an inline duplicate", () => {
    expect(adminIdentityQueryOptions().queryFn).toBe(fetchAdminIdentity);
  });

  test("caches for long enough to survive a navigation", () => {
    // react-query's default staleTime is 0, which is why every mount refetched.
    expect(ADMIN_IDENTITY_STALE_TIME_MS).toBe(60_000);
    expect(adminIdentityQueryOptions().staleTime).toBe(ADMIN_IDENTITY_STALE_TIME_MS);
  });
});
