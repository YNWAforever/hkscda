import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createSupabaseAdminAccessRepository,
  createSupabaseInviteAuthProvider,
} from "./accessManagement.repository.server";

describe("createSupabaseInviteAuthProvider", () => {
  test("prepares a first invite without delivering it", async () => {
    const sent: unknown[] = [];
    const client = {
      auth: {
        admin: {
          async inviteUserByEmail() {
            throw new Error("must not send before the database commit");
          },
          async generateLink(input: unknown) {
            expect(input).toEqual({ type: "invite", email: "new@example.com" });
            return {
              data: {
                user: { id: "new-auth", email: "new@example.com" },
                properties: { action_link: "https://example.test/invite" },
              },
              error: null,
            };
          },
        },
      },
    } as unknown as SupabaseClient;
    const provider = createSupabaseInviteAuthProvider(client, {
      sendInviteEmail: async (input) => {
        sent.push(input);
      },
    });

    expect(await provider.inviteByEmail("new@example.com")).toEqual({
      authUserId: "new-auth",
      email: "new@example.com",
      actionLink: "https://example.test/invite",
    });
    expect(sent).toEqual([]);
  });
  test("prepares a resend link without delivering it", async () => {
    const generateCalls: unknown[] = [];
    const sent: unknown[] = [];
    const client = {
      auth: {
        admin: {
          generateLink: async (input: unknown) => {
            generateCalls.push(input);
            return {
              data: {
                properties: {
                  action_link: "https://supabase.example/verify?token=fresh-token",
                },
                user: { id: "target-auth", email: "pending@example.com" },
              },
              error: null,
            };
          },
        },
      },
    } as unknown as SupabaseClient;

    const provider = createSupabaseInviteAuthProvider(client, {
      sendInviteEmail: async (input) => {
        sent.push(input);
      },
    });

    const prepared = await provider.resendInvite("pending@example.com");

    expect(generateCalls).toEqual([{ type: "invite", email: "pending@example.com" }]);
    expect(prepared).toEqual({
      actionLink: "https://supabase.example/verify?token=fresh-token",
    });
    expect(sent).toEqual([]);
    await provider.sendInviteEmail({
      to: "pending@example.com",
      actionLink: prepared.actionLink,
    });
    expect(sent).toEqual([
      {
        to: "pending@example.com",
        actionLink: "https://supabase.example/verify?token=fresh-token",
      },
    ]);
  });
});

describe("createSupabaseAdminAccessRepository", () => {
  test("writes invite state and audit through one RPC", async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return {
          data: {
            id: "new-row",
            auth_user_id: "invite-auth-id",
            email: "new@example.com",
            role: "staff",
            status: "pending",
            invited_at: "2026-07-01T10:00:00.000Z",
            invite_sent_at: "2026-07-01T10:00:00.000Z",
            invite_accepted_at: null,
            last_invited_by: "actor-auth",
            created_at: "2026-07-01T10:00:00.000Z",
            updated_at: "2026-07-01T10:00:00.000Z",
          },
          error: null,
        };
      },
    } as unknown as SupabaseClient;

    const result = await createSupabaseAdminAccessRepository(client).inviteUserWithAudit({
      actorUserId: "actor-auth",
      authUserId: "invite-auth-id",
      email: "new@example.com",
      role: "staff",
      sentAt: "2026-07-01T10:00:00.000Z",
    });

    expect(result.status).toBe("pending");
    expect(calls).toEqual([
      {
        name: "invite_admin_user_with_audit",
        args: {
          p_actor_user_id: "actor-auth",
          p_auth_user_id: "invite-auth-id",
          p_email: "new@example.com",
          p_role: "staff",
          p_sent_at: "2026-07-01T10:00:00.000Z",
        },
      },
    ]);
  });

  test("writes resend state and audit through one RPC", async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return {
          data: {
            id: "target-row",
            auth_user_id: "target-auth",
            email: "pending@example.com",
            role: "staff",
            status: "pending",
            invited_at: "2026-06-30T10:00:00.000Z",
            invite_sent_at: "2026-07-01T10:00:00.000Z",
            invite_accepted_at: null,
            last_invited_by: "actor-auth",
            created_at: "2026-06-30T10:00:00.000Z",
            updated_at: "2026-07-01T10:00:00.000Z",
          },
          error: null,
        };
      },
    } as unknown as SupabaseClient;

    const result = await createSupabaseAdminAccessRepository(client).resendInviteWithAudit({
      actorUserId: "actor-auth",
      userId: "target-row",
      sentAt: "2026-07-01T10:00:00.000Z",
    });

    expect(result.status).toBe("pending");
    expect(calls).toEqual([
      {
        name: "resend_admin_invite_with_audit",
        args: {
          p_actor_user_id: "actor-auth",
          p_target_id: "target-row",
          p_sent_at: "2026-07-01T10:00:00.000Z",
        },
      },
    ]);
  });
  test("updates admin access through one audited RPC", async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return {
          data: {
            id: "target-row",
            auth_user_id: "target-auth",
            email: "target@example.com",
            role: "treasurer",
            status: "active",
            invited_at: null,
            invite_sent_at: null,
            invite_accepted_at: null,
            last_invited_by: null,
            created_at: "2026-06-30T10:00:00.000Z",
            updated_at: "2026-07-01T10:00:00.000Z",
          },
          error: null,
        };
      },
    } as unknown as SupabaseClient;

    const result = await createSupabaseAdminAccessRepository(client).updateUserWithAudit({
      actorUserId: "actor-auth",
      userId: "target-row",
      role: "treasurer",
    });

    expect(result.role).toBe("treasurer");
    expect(calls).toEqual([
      {
        name: "update_admin_user_with_audit",
        args: {
          p_actor_user_id: "actor-auth",
          p_target_id: "target-row",
          p_role: "treasurer",
          p_status: null,
        },
      },
    ]);
  });
});
