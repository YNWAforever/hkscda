import { afterEach, expect, setSystemTime, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  clearVolunteerIdentityQueries,
  invalidateVolunteerQueries,
  volunteerQueryKeys,
} from "../../../lib/volunteers/queryKeys";
import { workspaceTemplatesQueryOptions } from "./workspaceQueries";
import type { Template } from "./activityWorkspaceTypes";

const template: Template = {
  template_key: "fixture-cat",
  name: "Fixture cat shelter",
  version_id: "version-1",
  shelter: "cat",
  start_time: "10:00",
  end_time: "12:00",
};
const clients: QueryClient[] = [];
const clientForTest = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return client;
};
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  setSystemTime();
});
async function mountTemplates(
  client: QueryClient,
  options: ReturnType<typeof workspaceTemplatesQueryOptions>,
) {
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  try {
    return await client.fetchQuery(options);
  } finally {
    unsubscribe();
  }
}

test("activity/calendar remounts reuse templates for 30 seconds then read the current version", async () => {
  const now = Date.parse("2026-10-15T04:00:00Z");
  setSystemTime(now);
  const client = clientForTest();
  let reads = 0;
  let current = template;
  const options = workspaceTemplatesQueryOptions(async <T>(path: string, init?: RequestInit) => {
    expect(path).toBe("/api/admin/volunteers/bulk");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ action: "templates" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    reads++;
    return { templates: [current] } as T;
  });
  expect((await mountTemplates(client, options)).templates[0].version_id).toBe("version-1");
  current = { ...template, version_id: "version-2" };
  setSystemTime(now + 29_999);
  expect((await mountTemplates(client, options)).templates[0].version_id).toBe("version-1");
  expect(reads).toBe(1);
  setSystemTime(now + 30_001);
  expect((await mountTemplates(client, options)).templates[0].version_id).toBe("version-2");
  expect(reads).toBe(2);
});

for (const change of ["activity", "policy", "source", "dailyQuota"] as const) {
  test(`${change} invalidation refreshes templates inside the freshness window`, async () => {
    const client = clientForTest();
    let current = template;
    const options = workspaceTemplatesQueryOptions(async <T>() => ({ templates: [current] }) as T);
    await mountTemplates(client, options);
    current = { ...template, version_id: "version-2" };
    await invalidateVolunteerQueries(client, change);
    expect((await mountTemplates(client, options)).templates[0].version_id).toBe("version-2");
  });
}

test("explicit refresh reloads templates even while their cached version is fresh", async () => {
  const client = clientForTest();
  let current = template;
  const options = workspaceTemplatesQueryOptions(async <T>() => ({ templates: [current] }) as T);
  await mountTemplates(client, options);
  current = { ...template, version_id: "version-2" };
  await client.refetchQueries({ queryKey: volunteerQueryKeys.key("workspaceTemplates") });
  expect(client.getQueryData(options.queryKey)?.templates[0].version_id).toBe("version-2");
});

test("identity changes remove fresh templates and abort an outstanding template read", async () => {
  const client = clientForTest();
  const first = workspaceTemplatesQueryOptions(async <T>() => ({ templates: [template] }) as T);
  await mountTemplates(client, first);
  await clearVolunteerIdentityQueries(client);
  expect(client.getQueryData(first.queryKey)).toBeUndefined();

  let signal: AbortSignal | null | undefined;
  const pending = workspaceTemplatesQueryOptions(async <T>(_path: string, init?: RequestInit) => {
    signal = init?.signal;
    return new Promise<T>(() => {});
  });
  const oldRead = client.fetchQuery(pending).catch(() => undefined);
  await clearVolunteerIdentityQueries(client);
  await oldRead;
  expect(signal?.aborted).toBe(true);
  expect(client.getQueryData(first.queryKey)).toBeUndefined();
  const nextActor = workspaceTemplatesQueryOptions(
    async <T>() => ({ templates: [{ ...template, version_id: "next-actor-version" }] }) as T,
  );
  expect((await mountTemplates(client, nextActor)).templates[0].version_id).toBe(
    "next-actor-version",
  );
});

test("a failed template read does not become a fresh empty listing", async () => {
  const client = clientForTest();
  const failed = workspaceTemplatesQueryOptions(async () => {
    throw new Error("Fixture unavailable");
  });
  await expect(client.fetchQuery(failed)).rejects.toThrow("Fixture unavailable");
  expect(client.getQueryData(failed.queryKey)).toBeUndefined();
  const recovered = workspaceTemplatesQueryOptions(async <T>() => ({ templates: [template] }) as T);
  expect((await mountTemplates(client, recovered)).templates[0].version_id).toBe("version-1");
});
