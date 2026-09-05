import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCrmReadModel } from "./readModel.server";
import type { SupporterSummary } from "./types";
const filters = { includeDeleted: false };
function client(data: unknown) {
  const calls: unknown[] = [];
  return {
    calls,
    client: {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return { data, error: null };
      },
      from: () => {
        throw new Error("Row-capped query forbidden");
      },
    } as unknown as SupabaseClient,
  };
}
test.each([1001, 5000])(
  "supporter export preserves all %i rows from one JSON envelope",
  async (count) => {
    const rows = Array.from({ length: count }, (_, i) => ({ id: String(i) }) as SupporterSummary);
    const fake = client({ supporters: rows, total: count, overflow: false });
    expect((await createCrmReadModel(fake.client).exportSupporters(filters)).length).toBe(count);
    expect(fake.calls).toHaveLength(1);
  },
);
test.each(["exportSupporters", "exportDonations"] as const)(
  "%s rejects 5001 before producing a partial file",
  async (method) => {
    const fake = client({ supporters: [], donations: [], total: 5001, overflow: true });
    try {
      await createCrmReadModel(fake.client)[method](filters);
      throw new Error("Expected overflow");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(413);
    }
  },
);
test("list passes every predicate and preserves a total on an empty final page", async () => {
  const fake = client({ supporters: [], total: 1001, overflow: false });
  const search = {
    ...filters,
    page: 42,
    pageSize: 25,
    q: "reference",
    role: "donor" as const,
    tag: "fixture",
    consentChannel: "email" as const,
    consentStatus: "opt_out" as const,
    purpose: "medical" as const,
    receiptNeeded: false,
  };
  expect(await createCrmReadModel(fake.client).list(search)).toEqual({
    supporters: [],
    total: 1001,
  });
  expect(fake.calls).toEqual([
    {
      name: "crm_read_supporters",
      args: { p_filters: search, p_offset: 1025, p_limit: 25, p_export: false },
    },
  ]);
});
test.each([1001, 5000])("donation export preserves all %i associations", async (count) => {
  const rows = Array.from({ length: count }, (_, i) => ({
    donationId: String(i),
    receiptNo: `R${i}`,
  }));
  const fake = client({ donations: rows, total: count, overflow: false });
  const exported = await createCrmReadModel(fake.client).exportDonations(filters);
  expect(exported.length).toBe(count);
  expect(exported[count - 1].receiptNo).toBe(`R${count - 1}`);
});

test.each(["exportSupporters", "exportDonations"] as const)(
  "%s refuses a truncated envelope instead of emitting incomplete CSV",
  async (method) => {
    const fake = client({
      supporters: Array.from({ length: 1000 }, () => ({})),
      donations: Array.from({ length: 1000 }, () => ({})),
      total: 1001,
      overflow: false,
    });
    await expect(createCrmReadModel(fake.client)[method](filters)).rejects.toThrow(
      "Incomplete CRM export",
    );
  },
);
