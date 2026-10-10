import { describe, expect, mock, test } from "bun:test";

import { createVolunteerHandlers } from "./http.server";
import { createVolunteerService } from "./service";
import type { VolunteerRepository } from "./service";

const admin = { authUserId: "admin-1", email: "admin@example.invalid", role: "admin" } as never;
const REGISTRATION_ID = "11111111-2222-4333-8444-555555555555";
const VERSION = "2026-09-05T00:00:00Z";

function build() {
  const updateRegistrationStatus = mock(async (_command: unknown) => ({ id: REGISTRATION_ID }));
  const repo = { updateRegistrationStatus } as unknown as VolunteerRepository;
  const handlers = createVolunteerHandlers({
    requireVolunteerAdmin: async () => admin,
    service: createVolunteerService({ repo }),
  });
  return { handlers, updateRegistrationStatus };
}

function patch(handlers: ReturnType<typeof build>["handlers"], body: unknown) {
  return handlers.updateRegistrationStatus({
    request: new Request("https://example.invalid/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: { id: REGISTRATION_ID },
  });
}

function sentCommand(calls: unknown[][]): { status: string; reason: string | null } {
  return calls[0][0] as { status: string; reason: string | null };
}

describe("rejecting a volunteer registration needs a reason", () => {
  // required-reason: volunteer_registration.reject
  test("a rejection reaches the repository with the trimmed reason", async () => {
    const { handlers, updateRegistrationStatus } = build();
    const response = await patch(handlers, {
      status: "rejected",
      expectedUpdatedAt: VERSION,
      reason: " no-show history ",
    });
    expect(response.status).toBe(200);
    expect(updateRegistrationStatus).toHaveBeenCalledTimes(1);
    expect(sentCommand(updateRegistrationStatus.mock.calls)).toMatchObject({
      status: "rejected",
      reason: "no-show history",
    });
  });

  test("a rejection with no reason is a 400 and never reaches the repository", async () => {
    const { handlers, updateRegistrationStatus } = build();
    const response = await patch(handlers, { status: "rejected", expectedUpdatedAt: VERSION });
    expect(response.status).toBe(400);
    expect(updateRegistrationStatus).not.toHaveBeenCalled();
  });

  test("a whitespace-only reason is a 400 and never reaches the repository", async () => {
    const { handlers, updateRegistrationStatus } = build();
    const response = await patch(handlers, {
      status: "rejected",
      expectedUpdatedAt: VERSION,
      reason: "   ",
    });
    expect(response.status).toBe(400);
    expect(updateRegistrationStatus).not.toHaveBeenCalled();
  });

  test("a 501-character reason is a 400 and never reaches the repository", async () => {
    const { handlers, updateRegistrationStatus } = build();
    const response = await patch(handlers, {
      status: "rejected",
      expectedUpdatedAt: VERSION,
      reason: "x".repeat(501),
    });
    expect(response.status).toBe(400);
    expect(updateRegistrationStatus).not.toHaveBeenCalled();
  });

  test("a 500-character reason is accepted", async () => {
    const { handlers, updateRegistrationStatus } = build();
    const response = await patch(handlers, {
      status: "rejected",
      expectedUpdatedAt: VERSION,
      reason: "x".repeat(500),
    });
    expect(response.status).toBe(200);
    expect(updateRegistrationStatus).toHaveBeenCalledTimes(1);
  });

  test("an approval needs no reason and passes null", async () => {
    const { handlers, updateRegistrationStatus } = build();
    const response = await patch(handlers, { status: "approved", expectedUpdatedAt: VERSION });
    expect(response.status).toBe(200);
    expect(sentCommand(updateRegistrationStatus.mock.calls)).toMatchObject({
      status: "approved",
      reason: null,
    });
  });
});
