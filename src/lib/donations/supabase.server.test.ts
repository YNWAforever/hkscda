import { expect, test } from "bun:test";
import { createSupabaseDonationRepository } from "./supabase.server";

test("public donation identity resolution uses the preserving RPC", async () => {
  const calls: unknown[] = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return { data: { supporterId: "supporter-1", kind: "existing" }, error: null };
    },
  };
  const repo = createSupabaseDonationRepository(client as never);
  const contact = {
    name: "Ada",
    email: "ada@example.invalid",
    phone: null,
    language: "en" as const,
    source: "donation_form" as const,
  };

  await expect(repo.resolvePublicIdentity(contact)).resolves.toEqual({
    supporterId: "supporter-1",
    kind: "existing",
  });
  expect(calls).toEqual([
    { name: "resolve_public_supporter_identity", args: { p_contact: contact } },
  ]);
});

test("empty active consent rows do not issue an insert", async () => {
  let fromCalled = false;
  const repo = createSupabaseDonationRepository({
    from() {
      fromCalled = true;
      throw new Error("unexpected insert");
    },
  } as never);

  await expect(repo.replaceConsents([])).resolves.toBeUndefined();
  expect(fromCalled).toBe(false);
});
