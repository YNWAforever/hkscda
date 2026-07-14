import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseInviteAuthProvider } from "./accessManagement.repository.server";

describe("createSupabaseInviteAuthProvider", () => {
  test("generates a fresh invite link and sends it for an existing user", async () => {
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

    const provider = (
      createSupabaseInviteAuthProvider as unknown as (
        client: SupabaseClient,
        options: {
          sendInviteEmail: (input: { to: string; actionLink: string }) => Promise<void>;
        },
      ) => { resendInvite: (email: string) => Promise<void> }
    )(client, {
      sendInviteEmail: async (input) => {
        sent.push(input);
      },
    });

    await provider.resendInvite("pending@example.com");

    expect(generateCalls).toEqual([{ type: "invite", email: "pending@example.com" }]);
    expect(sent).toEqual([
      {
        to: "pending@example.com",
        actionLink: "https://supabase.example/verify?token=fresh-token",
      },
    ]);
  });
});
