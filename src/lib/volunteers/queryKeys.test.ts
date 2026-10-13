import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateVolunteerQueries,
  volunteerQueryKeys,
  clearVolunteerIdentityQueries,
} from "./queryKeys";
test("registration success invalidates actual workspace/detail/calendar keys and independent pages", async () => {
  const client = new QueryClient();
  const keys = [
    ["volunteer-workspace", { from: "2026-10-13" }, 1],
    ["volunteer-workspace", { from: "2026-10-14" }, 2],
    ["volunteer-workspace-detail", "id", 1, 1],
    ["volunteer-calendar", "from", "until"],
    ["volunteer-tasks"],
    ["volunteer-directory", "person", "id"],
    ["volunteer-registration", "id"],
    ["volunteer-overview"],
  ];
  for (const key of keys) client.setQueryData(key, { original: true });
  client.setQueryData(["unrelated-public-page"], "keep");
  await invalidateVolunteerQueries(client, "registration");
  for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["unrelated-public-page"])?.isInvalidated).toBe(false);
  expect(volunteerQueryKeys.workspace({ from: "A" }, 1)).not.toEqual(
    volunteerQueryKeys.workspace({ from: "A" }, 2),
  );
});
test("identity clear aborts real pending reads before removing protected data", async () => {
  const client = new QueryClient();
  let signal: AbortSignal | undefined;
  const old = client
    .fetchQuery({
      queryKey: ["volunteer-workspace", "old"],
      queryFn: ({ signal: s }) => {
        signal = s;
        return new Promise(() => {});
      },
    })
    .catch(() => undefined);
  client.setQueryData(["group-enquiries", "old"], { private: true });
  client.setQueryData(["public"], "keep");
  await clearVolunteerIdentityQueries(client);
  await old;
  expect(signal?.aborted).toBe(true);
  expect(client.getQueryData(["group-enquiries", "old"])).toBeUndefined();
  expect(client.getQueryData<string>(["public"])).toBe("keep");
});
