import { expect, test } from "bun:test";
import { createSupabaseVolunteerRepository } from "./repository.server";

test("public volunteer identity resolution uses the preserving RPC", async () => {
  const calls: unknown[] = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return { data: { supporterId: "supporter-1", kind: "existing" }, error: null };
    },
  };
  const repo = createSupabaseVolunteerRepository(client as never);
  const contact = {
    name: "Ada",
    email: "ada@example.invalid",
    phone: "91234567",
    language: "zh-HK" as const,
    source: "volunteer_registration_form" as const,
  };

  await expect(repo.resolvePublicIdentity(contact)).resolves.toEqual({
    supporterId: "supporter-1",
    kind: "existing",
  });
  expect(calls).toEqual([
    { name: "resolve_public_supporter_identity", args: { p_contact: contact } },
  ]);
});

test.each(["conflict", "capacity_full"])(
  "status RPC maps %s to409 without follow-up writes",
  async (kind) => {
    const calls: unknown[] = [];
    const repo = createSupabaseVolunteerRepository({
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return { data: { kind }, error: null };
      },
      from: () => {
        throw new Error("Must not write or hydrate after conflict");
      },
    } as never);
    try {
      await repo.updateRegistrationStatus({
        registrationId: "registration-1",
        actorUserId: "actor-1",
        expectedUpdatedAt: "2026-09-05T00:00:00Z",
        status: "approved",
      });
      throw new Error("Expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(409);
    }
    expect(calls).toEqual([
      {
        name: "set_volunteer_registration_status_with_audit",
        args: {
          p_registration_id: "registration-1",
          p_actor_user_id: "actor-1",
          p_expected_updated_at: "2026-09-05T00:00:00Z",
          p_status: "approved",
          p_internal_notes: null,
          p_update_internal_notes: false,
        },
      },
    ]);
  },
);
test("capacity reduction uses the audited activity RPC with expected version", async () => {
  const calls: unknown[] = [];
  const repo = createSupabaseVolunteerRepository({
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: { kind: "capacity_full" }, error: null };
    },
  } as never);
  try {
    await repo.updateActivity("activity-1", { capacity: 2 }, "actor-1", "version");
    throw new Error("Expected capacity failure");
  } catch (error) {
    expect((error as Response).status).toBe(409);
  }
  expect(calls).toEqual([
    {
      name: "update_volunteer_activity_with_audit",
      args: {
        p_activity_id: "activity-1",
        p_actor_user_id: "actor-1",
        p_expected_updated_at: "version",
        p_input: { capacity: 2 },
      },
    },
  ]);
});

test("explicit empty notes are distinguished from omitted notes", async () => {
  let args: unknown;
  const repo = createSupabaseVolunteerRepository({
    rpc: async (_name: string, input: unknown) => {
      args = input;
      return { data: { kind: "conflict" }, error: null };
    },
  } as never);
  try {
    await repo.updateRegistrationStatus({
      registrationId: "registration-1",
      actorUserId: "actor-1",
      expectedUpdatedAt: "version",
      status: "approved",
      internalNotes: null,
    });
  } catch (error) {
    expect((error as Response).status).toBe(409);
  }
  expect(args).toMatchObject({ p_internal_notes: null, p_update_internal_notes: true });
});

test("a failed counts RPC propagates instead of degrading to zero participants", async () => {
  // volunteer_activity_counts is the only source of approvedParticipants, and
  // rules.ts derives remaining capacity as `capacity - approvedParticipants`.
  // Treating an unreadable count as 0 would present a full activity as empty
  // and let the next registration overbook it, so this path must fail closed.
  //
  // The audit's symptom -- the volunteer page showing zero records while the
  // database held 12 activities and 5 registrations -- is the *display* half of
  // this, and is fixed in the UI by rendering the rejection as a failure state
  // rather than as an empty list. It must not be "fixed" here by swallowing the
  // error, which would trade a visible outage for silent overbooking.
  const repo = createSupabaseVolunteerRepository({
    from: () => ({
      select: () => ({
        order: () => ({
          range: async () => ({
            data: [
              {
                id: "activity-1",
                type: "shelter",
                title: "貓舍清潔",
                description: null,
                starts_at: "2026-09-20T01:00:00.000Z",
                ends_at: "2026-09-20T03:00:00.000Z",
                location: "貓舍",
                capacity: 12,
                min_age: null,
                underage_policy: "not_allowed",
                auto_approve: false,
                allow_waitlist: true,
                status: "published",
                registration_modes: ["individual"],
                created_at: "2026-09-01T00:00:00.000Z",
                updated_at: "2026-09-01T00:00:00.000Z",
              },
            ],
            error: null,
            count: 1,
          }),
        }),
      }),
    }),
    rpc: async () => ({
      data: null,
      error: { message: "function public.volunteer_activity_counts(uuid[]) does not exist" },
    }),
  } as never);

  await expect(
    repo.listActivities({
      status: undefined,
      type: undefined,
      q: undefined,
      page: 1,
      pageSize: 25,
    }),
  ).rejects.toMatchObject({
    message: "function public.volunteer_activity_counts(uuid[]) does not exist",
  });
});

test.each([
  "conflict",
  "future_attendance",
  "attendance_correction_required",
  "invalid_attendance_status",
])("attendance RPC maps %s to409 without any follow-up write", async (kind) => {
  const calls: unknown[] = [];
  const repo = createSupabaseVolunteerRepository({
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: { kind }, error: null };
    },
    from: () => {
      throw new Error("No partial write or hydration after rejection");
    },
  } as never);
  try {
    await repo.updateAttendance({
      registrationId: "registration-1",
      actorUserId: "actor",
      expectedUpdatedAt: "2026-09-13T00:00:00Z",
      attendanceStatus: "no_show",
      command: "correct",
      reason: "Mistaken completion",
    });
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(409);
  }
  expect(calls[0]).toMatchObject({
    name: "set_volunteer_attendance_with_audit",
    args: {
      p_actor_user_id: "actor",
      p_expected_updated_at: "2026-09-13T00:00:00Z",
      p_command: "correct",
      p_reason: "Mistaken completion",
      p_update_volunteer_hours: false,
    },
  });
});
