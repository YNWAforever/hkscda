import { expect, mock, test } from "bun:test";
import { seedAdminSessionForTests } from "../admin/sessionMemory";
import { createContentHandlers } from "./http.server";
import { ContentLifecycleError } from "./lifecycle";
import type { createContentService } from "./service";
// The admin fetch seam is the in-memory session store now (the BFF owns the persistent one).
seedAdminSessionForTests({ accessToken: "synthetic", authUserId: "auth-1" });
const { fetchAdminJson } = await import("../admin/session");
test("lifecycle HTTP409 survives the real browser client parser", async () => {
  const handlers = createContentHandlers({
    requireContentAdmin: async () => ({
      id: "admin",
      authUserId: "11111111-2222-4333-8444-555555555555",
      role: "staff",
      status: "active",
      email: "staff@example.test",
    }),
    service: {
      updateContent: async () => {
        throw new ContentLifecycleError("conflict");
      },
    } as unknown as ReturnType<typeof createContentService>,
  });
  const original = globalThis.fetch;
  try {
    globalThis.fetch = mock(async () =>
      handlers.updateContent({
        request: new Request("http://localhost/api/admin/content/content", {
          method: "PATCH",
          body: JSON.stringify({ expectedVersion: 3, title: "Local" }),
        }),
        params: { id: "11111111-2222-4333-8444-555555555555" },
      }),
    ) as unknown as typeof fetch;
    await expect(
      fetchAdminJson("http://localhost/api/admin/content/content", { method: "PATCH" }),
    ).rejects.toMatchObject({ status: 409, code: "conflict" });
  } finally {
    globalThis.fetch = original;
  }
});
