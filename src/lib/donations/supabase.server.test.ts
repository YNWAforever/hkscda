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

test("opt-out replay uses the existing unique consent key without updating it", async () => {
  const calls: unknown[] = [];
  const repo = createSupabaseDonationRepository({
    from(table: string) {
      expect(table).toBe("consent");
      return {
        async upsert(rows: unknown, options: unknown) {
          calls.push({ rows, options });
          return { error: null };
        },
        insert() {
          throw new Error("retry must not insert a duplicate consent row");
        },
      };
    },
  } as never);
  const rows = [
    {
      supporter_id: "supporter-1",
      channel: "whatsapp" as const,
      status: "opt_out" as const,
      source: "donation_form",
      timestamp: "2026-09-25T00:00:00.000Z",
    },
  ];

  await repo.replaceConsents(rows);
  await repo.replaceConsents(rows);

  expect(calls).toEqual([
    {
      rows,
      options: {
        onConflict: "supporter_id,channel,status,source,timestamp",
        ignoreDuplicates: true,
      },
    },
    {
      rows,
      options: {
        onConflict: "supporter_id,channel,status,source,timestamp",
        ignoreDuplicates: true,
      },
    },
  ]);
});
