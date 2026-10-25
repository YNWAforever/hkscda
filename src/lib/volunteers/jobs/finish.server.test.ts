import { expect, spyOn, test } from "bun:test";
import { createVolunteerJobRepository } from "./repository.server";
import { createVolunteerRuntimeJobs } from "./service";
import { safeJobFailure } from "./errors";

function fixture(data: boolean | null, error: unknown = null) {
  return createVolunteerJobRepository(
    {
      rpc: async () => ({ data, error }),
    } as never,
    "00000000-0000-4000-8000-000000000001",
  );
}

test("an acknowledged finish succeeds", async () => {
  await expect(
    fixture(true).finish("2026-10-25T03:00:00Z", "synthetic-owner", "complete", {}),
  ).resolves.toBeUndefined();
});

for (const result of [false, null]) {
  test(`an unconfirmed finish (${result}) reports lease loss instead of success`, async () => {
    await expect(
      fixture(result).finish("2026-10-25T03:00:00Z", "synthetic-owner", "complete", {}),
    ).rejects.toMatchObject({ code: "VOLUNTEER_JOB_LEASE_LOST" });
  });
}

test("a finish RPC error retains the original failure", async () => {
  const error = { code: "42501", message: "Synthetic private provider detail" };
  await expect(
    fixture(false, error).finish("2026-10-25T03:00:00Z", "synthetic-owner", "complete", {}),
  ).rejects.toBe(error);
});

test("the worker cannot report complete when the finish write was rejected", async () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const worker = createVolunteerRuntimeJobs({
      claim: async () => true,
      preflight: async () => {},
      generate: async () => 0,
      persistReleases: async () => 0,
      promote: async () => 0,
      assess: async () => false,
      deferNotifications: async () => 0,
      finish: fixture(false).finish,
    });
    await expect(worker.run()).rejects.toMatchObject({ code: "VOLUNTEER_JOB_LEASE_LOST" });
    const output = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(output).toMatchObject({
      event: "volunteer_job_finish_failed",
      stage: "finish",
      code: "VOLUNTEER_JOB_LEASE_LOST",
    });
    expect(Object.keys(output).sort()).toEqual(["code", "correlationId", "event", "stage"]);
  } finally {
    log.mockRestore();
  }
});

test("lease loss has a fixed safe diagnostic code", () => {
  expect(
    safeJobFailure(
      { code: "VOLUNTEER_JOB_LEASE_LOST", message: "Synthetic private detail" },
      "finish",
      "synthetic-correlation",
    ),
  ).toEqual({
    code: "VOLUNTEER_JOB_LEASE_LOST",
    stage: "finish",
    correlationId: "synthetic-correlation",
  });
});
