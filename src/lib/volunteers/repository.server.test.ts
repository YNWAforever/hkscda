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
