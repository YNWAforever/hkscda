import { expect, test } from "bun:test";
import { voidReceipt } from "./reconcile.server";

test("an audit failure leaves a manually voided receipt issued", async () => {
  let status = "issued";
  const client = {
    rpc: async () => ({ data: null, error: new Error("audit failed") }),
    from(table: string) {
      if (table === "receipt")
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => {
                    status = "void";
                    return {
                      data: { id: "receipt-1", pdf_url: "2026/receipt.pdf" },
                      error: null,
                    };
                  },
                }),
              }),
            }),
          }),
        };
      if (table === "audit_log")
        return { insert: async () => ({ error: new Error("audit failed") }) };
      throw new Error("Unexpected table: " + table);
    },
    storage: {
      from: () => ({ remove: async () => ({ error: null }) }),
    },
  };
  await expect(
    voidReceipt(client as never, "receipt-1", "admin-1", { reason: "duplicate" }),
  ).rejects.toThrow("audit failed");
  expect(status).toBe("issued");
});
