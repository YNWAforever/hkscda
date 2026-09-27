import { describe, expect, test } from "bun:test";
import { initialAdoptionInstructionContent } from "../adoptionInstructions/content";
import {
  checkReadiness,
  createReadinessDeps,
  createReadinessHandler,
  type ReadinessDeps,
} from "./readiness.server";

const page = {
  copy: initialAdoptionInstructionContent,
  feesBySpecies: { dog: [], cat: [] },
  estates: [],
  guideGroups: [],
  rules: [],
  careTopics: { dog: [], cat: [] },
};

function deps(overrides: Partial<ReadinessDeps> = {}): ReadinessDeps {
  return {
    readCmsRevision: async () => ({
      state: "published",
      content: initialAdoptionInstructionContent,
    }),
    readPublicAdoption: async () => page,
    config: {
      isProduction: true,
      turnstileSiteKey: "synthetic-site",
      turnstileSecret: "synthetic-secret",
      upstashUrl: "https://synthetic.invalid",
      upstashToken: "synthetic-token",
    },
    releaseSha: "synthetic-sha",
    correlationId: "synthetic-correlation",
    ...overrides,
  };
}

describe("release readiness", () => {
  test("ready only when CMS, public content and abuse controls work", async () => {
    expect(await checkReadiness(deps())).toMatchObject({
      state: "ready",
      releaseSha: "synthetic-sha",
      correlationId: "synthetic-correlation",
      features: {
        cms: { state: "ready" },
        adoption: { state: "ready" },
        antiAbuse: { state: "ready" },
      },
    });
  });

  for (const code of ["PGRST205", "42P01"]) {
    test(`CMS ${code} degrades while the public page remains readable`, async () => {
      const result = await checkReadiness(
        deps({
          readCmsRevision: async () => {
            throw { code, message: "private alice@example.test" };
          },
        }),
      );
      expect(result.state).toBe("degraded");
      expect(result.features.cms).toEqual({
        state: "degraded",
        code: "CMS_SCHEMA_MISSING",
        causeCode: code,
      });
      expect(result.features.adoption.state).toBe("ready");
      expect(JSON.stringify(result)).not.toContain("alice@example.test");
    });
  }

  for (const code of ["42501", "XX000", "PGRST116"]) {
    test(`CMS ${code} is unavailable and cannot use seed fallback`, async () => {
      const result = await checkReadiness(
        deps({
          readCmsRevision: async () => {
            throw { code };
          },
        }),
      );
      expect(result.state).toBe("unavailable");
      expect(result.features.cms).toMatchObject({
        state: "unavailable",
        code: "CMS_READ_FAILED",
        causeCode: code,
      });
    });
  }

  test("no published revision and invalid CMS content are unavailable", async () => {
    expect(
      (await checkReadiness(deps({ readCmsRevision: async () => null }))).features.cms,
    ).toMatchObject({ state: "unavailable", code: "CMS_UNPUBLISHED" });
    expect(
      (
        await checkReadiness(
          deps({
            readCmsRevision: async () => ({ state: "published", content: {} }),
          }),
        )
      ).features.cms,
    ).toMatchObject({ state: "unavailable", code: "CMS_INVALID_CONTENT" });
  });

  test("public data failure is unavailable even if CMS succeeds", async () => {
    const result = await checkReadiness(
      deps({
        readPublicAdoption: async () => {
          throw Object.assign(new Error("private payload"), { code: "XX000" });
        },
      }),
    );
    expect(result.state).toBe("unavailable");
    expect(result.features.adoption).toMatchObject({
      state: "unavailable",
      code: "ADOPTION_READ_FAILED",
      causeCode: "XX000",
    });
    expect(JSON.stringify(result)).not.toContain("private payload");
  });

  test("missing production abuse settings block readiness even when both pairs are absent", async () => {
    const result = await checkReadiness(
      deps({
        config: {
          isProduction: true,
          turnstileSiteKey: undefined,
          turnstileSecret: undefined,
          upstashUrl: undefined,
          upstashToken: undefined,
        },
      }),
    );
    expect(result.state).toBe("unavailable");
    expect(result.features.antiAbuse).toMatchObject({
      state: "unavailable",
      code: "ANTI_ABUSE_UNCONFIGURED",
    });
  });

  test("local fixture can omit external abuse services", async () => {
    const result = await checkReadiness(
      deps({
        config: { isProduction: false },
      }),
    );
    expect(result.state).toBe("ready");
  });

  test("protected endpoint rejects before probing and never caches", async () => {
    let calls = 0;
    const handler = createReadinessHandler({
      secret: () => "synthetic-secret",
      check: async () => {
        calls++;
        return await checkReadiness(deps());
      },
    });
    const denied = await handler(new Request("https://example.invalid/api/internal/readiness"));
    expect(denied.status).toBe(401);
    expect(denied.headers.get("cache-control")).toBe("no-store");
    expect(calls).toBe(0);
    const allowed = await handler(
      new Request("https://example.invalid/api/internal/readiness", {
        headers: { authorization: "Bearer synthetic-secret" },
      }),
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("no-store");
    expect((await allowed.json()).state).toBe("ready");
    expect(calls).toBe(1);
  });
});

test("private readiness alerts are rate limited and recovery is visible without payloads", async () => {
  let now = 1_000;
  let report = await checkReadiness(
    deps({
      readCmsRevision: async () => {
        throw { code: "42501", message: "private alice@example.test" };
      },
    }),
  );
  const events: Array<{ state: string; codes: string[]; releaseSha: string }> = [];
  const handler = createReadinessHandler({
    secret: () => "synthetic-secret",
    check: async () => report,
    log: (event) => events.push(event),
    now: () => now,
  });
  const request = () =>
    new Request("https://example.invalid/api/internal/readiness", {
      headers: { authorization: "Bearer synthetic-secret" },
    });
  expect((await handler(request())).status).toBe(503);
  expect((await handler(request())).status).toBe(503);
  expect(events).toHaveLength(1);
  expect(events[0]).toEqual({
    state: "unavailable",
    codes: ["CMS_READ_FAILED"],
    releaseSha: "synthetic-sha",
  });
  expect(JSON.stringify(events)).not.toContain("alice@example.test");
  now += 600_000;
  await handler(request());
  expect(events).toHaveLength(2);
  report = await checkReadiness(deps());
  expect((await handler(request())).status).toBe(200);
  expect(events.at(-1)?.state).toBe("ready");
});

test("CMS readiness adapter reads only the published revision and preserves provider error code", async () => {
  const calls: unknown[] = [];
  const adapter = {
    from(table: string) {
      calls.push(["from", table]);
      return {
        select(columns: string) {
          calls.push(["select", columns]);
          return this;
        },
        eq(column: string, value: string) {
          calls.push(["eq", column, value]);
          return this;
        },
        async maybeSingle() {
          return { data: null, error: { code: "42501", message: "private" } };
        },
      };
    },
  };
  const probe = createReadinessDeps(
    { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "fixture-sha" },
    adapter as never,
  );
  expect(probe.releaseSha).toBe("fixture-sha");
  await expect(probe.readCmsRevision()).rejects.toMatchObject({ code: "42501" });
  expect(calls).toEqual([
    ["from", "adoption_instruction_revisions"],
    ["select", "state,content"],
    ["eq", "page_key", "adoption-instructions"],
    ["eq", "state", "published"],
  ]);
});
