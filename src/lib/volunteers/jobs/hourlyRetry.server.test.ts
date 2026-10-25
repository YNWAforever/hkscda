import { describe, expect, test } from "bun:test";
import { createHourlyRetryHandler, runHourlyRetry } from "./hourlyRetry.server";
import type { VolunteerJobRepository } from "./service";

const now = () => new Date("2026-10-25T03:20:00Z");
const input = {
  bucket: "2026-10-25T03:00:00+00:00",
  expectedUpdatedAt: "2026-10-25T03:15:00.123456+00:00",
  confirmed: true as const,
  reason: "  Synthetic retry after checking configuration  ",
};
const actor = "00000000-0000-4000-8000-000000000001";
const request = (body: unknown = input) =>
  new Request("https://example.invalid/api/admin/volunteers/jobs/", {
    method: "POST",
    body: JSON.stringify(body),
  });
const complete = {
  kind: "complete" as const,
  generated: 2,
  promoted: 0,
  released: 1,
  assessment: false,
  deferred: 0,
};

describe("confirmed hourly retry HTTP boundary", () => {
  test("authorizes before reading input and preserves a denial without running work", async () => {
    let work = 0;
    const response = await createHourlyRetryHandler(
      {
        authorize: async () => {
          throw new Response("Forbidden", { status: 403 });
        },
        run: async () => {
          work++;
          return complete;
        },
      },
      now,
    )(new Request("https://example.invalid", { method: "POST", body: "bad json" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(work).toBe(0);
  });
  test("passes the authenticated actor, trimmed reason and exact microsecond fence", async () => {
    const calls: unknown[] = [];
    const response = await createHourlyRetryHandler(
      {
        authorize: async () => ({ authUserId: actor }),
        run: async (command, actorId) => {
          calls.push({ command, actorId });
          return complete;
        },
      },
      now,
    )(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(complete);
    expect(calls).toEqual([{ command: { ...input, reason: input.reason.trim() }, actorId: actor }]);
  });
  for (const [label, changes] of [
    ["unconfirmed", { confirmed: false }],
    ["no confirmation", { confirmed: undefined }],
    ["blank reason", { reason: " \n " }],
    ["oversized reason", { reason: "x".repeat(501) }],
    ["invalid revision", { expectedUpdatedAt: "yesterday" }],
    ["missing revision", { expectedUpdatedAt: undefined }],
    ["worker actor substitution", { actorUserId: actor }],
    ["alternate job", { jobKey: "other" }],
    ["force", { force: true }],
  ] as const) {
    test(`rejects ${label} without a claim`, async () => {
      let calls = 0;
      const response = await createHourlyRetryHandler(
        {
          authorize: async () => ({ authUserId: actor }),
          run: async () => {
            calls++;
            return complete;
          },
        },
        now,
      )(request({ ...input, ...changes }));
      expect(response.status).toBe(400);
      expect(calls).toBe(0);
    });
  }
  for (const bucket of ["2026-10-25T02:00:00Z", "2026-10-25T04:00:00Z"]) {
    test(`rejects noncurrent bucket ${bucket} without a claim`, async () => {
      let calls = 0;
      const response = await createHourlyRetryHandler(
        {
          authorize: async () => ({ authUserId: actor }),
          run: async () => {
            calls++;
            return complete;
          },
        },
        now,
      )(request({ ...input, bucket }));
      expect(response.status).toBe(409);
      expect(calls).toBe(0);
    });
  }
  test("rejects a body over 4096 bytes before a claim", async () => {
    let calls = 0;
    const response = await createHourlyRetryHandler(
      {
        authorize: async () => ({ authUserId: actor }),
        run: async () => {
          calls++;
          return complete;
        },
      },
      now,
    )(request({ ...input, reason: "x".repeat(4096) }));
    expect(response.status).toBe(413);
    expect(calls).toBe(0);
  });
});

function repository(calls: string[]): VolunteerJobRepository {
  const work = async (name: string) => {
    calls.push(name);
    return 0;
  };
  return {
    claim: async () => {
      throw new Error("Unaudited claim must never be used");
    },
    preflight: async () => {
      calls.push("preflight:configured-actor");
    },
    finish: async (_bucket, _owner, status) => {
      calls.push(`finish:${status}`);
    },
    generate: () => work("generate"),
    persistReleases: () => work("release"),
    promote: () => work("promote"),
    assess: async () => {
      calls.push("assess");
      return false;
    },
    deferNotifications: () => work("defer"),
  };
}

describe("atomic claim acknowledgement gates the existing worker", () => {
  test("two racing HTTP requests respect a single true transactional acknowledgement", async () => {
    const calls: string[] = [];
    let claimed = false;
    const handler = createHourlyRetryHandler(
      {
        authorize: async () => ({ authUserId: actor }),
        run: (command, actorId) =>
          runHourlyRetry(
            repository(calls),
            async () => {
              // Synthetic transactional boundary; real row-lock atomicity is NOT_RUN.
              if (claimed) return false;
              claimed = true;
              return true;
            },
            actorId,
            command,
            now,
          ),
      },
      now,
    );
    const responses = await Promise.all([handler(request()), handler(request())]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(calls.filter((call) => call === "generate")).toHaveLength(1);
    expect(calls.filter((call) => call === "finish:complete")).toHaveLength(1);
  });
  test("only an audited claim runs the unchanged fenced worker", async () => {
    const calls: string[] = [];
    const claims: unknown[] = [];
    const result = await runHourlyRetry(
      repository(calls),
      async (claim) => {
        calls.push("claim-with-audit");
        claims.push(claim);
        return true;
      },
      actor,
      input,
      now,
    );
    expect(result.kind).toBe("complete");
    expect(claims).toEqual([
      {
        bucket: input.bucket,
        expectedUpdatedAt: input.expectedUpdatedAt,
        confirmed: true,
        reason: input.reason,
        actorId: actor,
        owner: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    ]);
    expect(calls).toEqual([
      "claim-with-audit",
      "preflight:configured-actor",
      "generate",
      "release",
      "promote",
      "assess",
      "defer",
      "finish:complete",
    ]);
  });
  for (const value of [false, null, {}, "true"]) {
    test(`non-true acknowledgement ${JSON.stringify(value)} never runs stages`, async () => {
      const calls: string[] = [];
      const response = await createHourlyRetryHandler(
        {
          authorize: async () => ({ authUserId: actor }),
          run: (command, actorId) =>
            runHourlyRetry(repository(calls), async () => value, actorId, command, now),
        },
        now,
      )(request());
      expect(response.status).toBe(value === false ? 409 : 503);
      expect(calls).toEqual([]);
    });
  }
  for (const [code, status] of [
    ["PGRST202", 503],
    ["42883", 503],
    ["42501", 403],
    ["P0001", 500],
  ] as const) {
    test(`RPC rejection ${code} fails closed without private response text`, async () => {
      const calls: string[] = [];
      const response = await createHourlyRetryHandler(
        {
          authorize: async () => ({ authUserId: actor }),
          run: (command, actorId) =>
            runHourlyRetry(
              repository(calls),
              async () => {
                throw { code, message: "synthetic-private-audit-error" };
              },
              actorId,
              command,
              now,
            ),
        },
        now,
      )(request());
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("synthetic-private");
      expect(calls).toEqual([]);
    });
  }
  test("an hour boundary crossed before worker claim cannot claim a different bucket", async () => {
    const calls: string[] = [];
    let claims = 0;
    const result = await runHourlyRetry(
      repository(calls),
      async () => {
        claims++;
        return true;
      },
      actor,
      input,
      () => new Date("2026-10-25T04:00:00Z"),
    );
    expect(result.kind).toBe("busy");
    expect(claims).toBe(0);
    expect(calls).toEqual([]);
  });
  test("lost finish acknowledgement never produces a successful HTTP response", async () => {
    const calls: string[] = [];
    const repo = repository(calls);
    repo.finish = async () => {
      throw { code: "VOLUNTEER_JOB_LEASE_LOST" };
    };
    const response = await createHourlyRetryHandler(
      {
        authorize: async () => ({ authUserId: actor }),
        run: (command, actorId) => runHourlyRetry(repo, async () => true, actorId, command, now),
      },
      now,
    )(request());
    expect(response.status).toBe(500);
  });
});
