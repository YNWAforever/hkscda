import { describe, expect, test } from "bun:test";

import { createPublicIdentityRepository } from "./publicIdentity.server";

describe("public supporter identity", () => {
  test("normalizes contact before resolving identity through the atomic RPC", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const client = {
      async rpc(name: string, args: unknown) {
        calls.push({ name, args });
        return { data: { supporterId: "supporter-1", kind: "existing" }, error: null };
      },
    };
    const repository = createPublicIdentityRepository(client as never);

    await expect(
      repository.resolve({
        name: "  Ada  ",
        email: "  ADA@Example.com ",
        phone: " 9123 4567 ",
        language: "en",
        source: "donation_form",
      }),
    ).resolves.toEqual({ supporterId: "supporter-1", kind: "existing" });
    expect(calls).toEqual([
      {
        name: "resolve_public_supporter_identity",
        args: {
          p_contact: {
            name: "Ada",
            email: "ada@example.com",
            phone: "9123 4567",
            language: "en",
            source: "donation_form",
          },
        },
      },
    ]);
  });

  test("rejects an invalid RPC result", async () => {
    const client = { rpc: async () => ({ data: { supporterId: "supporter-1" }, error: null }) };
    const repository = createPublicIdentityRepository(client as never);

    await expect(
      repository.resolve({
        name: "Ada",
        email: "ada@example.com",
        phone: null,
        language: "zh-HK",
        source: "volunteer_registration_form",
      }),
    ).rejects.toThrow("Invalid public identity resolution");
  });
});
