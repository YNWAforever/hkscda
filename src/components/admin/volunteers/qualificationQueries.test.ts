import { expect, test } from "bun:test";
import {
  qualificationDefinitionsQueryOptions,
  qualificationProfileQueryOptions,
} from "./qualificationQueries";

// BUG-65: the page loaded every volunteer profile (with birth date) and every credential on
// each visit. It now reads the credential definitions, and one profile with its credentials
// from the paginated directory, only once a profile is chosen.
test("BUG-65: qualifications read the definitions and only the chosen profile", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetcher = async <T>(path: string, init?: RequestInit): Promise<T> => {
    calls.push([path, init]);
    return {} as T;
  };
  const controller = new AbortController();

  const definitions = qualificationDefinitionsQueryOptions(fetcher);
  await definitions.queryFn!({ signal: controller.signal } as never);
  expect(calls[0][0]).toBe("/api/admin/volunteers/qualifications");
  expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ action: "list" });
  expect(calls[0][1]?.signal).toBe(controller.signal);

  const profile = qualificationProfileQueryOptions("profile-1", fetcher);
  expect(profile.enabled).toBe(true);
  await profile.queryFn!({ signal: controller.signal } as never);
  expect(calls[1][0]).toBe("/api/admin/volunteers/people");
  expect(calls[1][1]?.method).toBe("POST");
  expect(JSON.parse(String(calls[1][1]?.body))).toEqual({ profile_id: "profile-1" });

  // Nothing is read until a profile is chosen, and each profile has its own cache entry.
  expect(qualificationProfileQueryOptions("", fetcher).enabled).toBe(false);
  expect(profile.queryKey).not.toEqual(qualificationProfileQueryOptions("profile-2").queryKey);
  // A qualification change refreshes both (they share the qualifications prefix).
  expect(definitions.queryKey[0]).toBe("volunteer-qualifications");
  expect(profile.queryKey[0]).toBe("volunteer-qualifications");
  expect(calls).toHaveLength(2);
});
