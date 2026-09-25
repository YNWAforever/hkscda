import { afterAll, expect, mock, test } from "bun:test";

const realSupabaseServerModule = {
  ...(await import("../../../../lib/donations/supabase.server")),
};
let activeClient: unknown;
mock.module("../../../../lib/donations/supabase.server", () => ({
  ...realSupabaseServerModule,
  createSupabaseServiceClient: () => activeClient,
  requireAdmin: async () => ({ authUserId: "staff-user" }),
}));

const routePath = "./$id/archive";
const archiveModule = await import(routePath).catch(() => null);

afterAll(() => {
  mock.module("../../../../lib/donations/supabase.server", () => realSupabaseServerModule);
});

test("staff archive uses an atomic audited server mutation", async () => {
  expect(archiveModule?.Route).toBeDefined();
  if (!archiveModule?.Route) return;

  const rpc = mock(async () => ({
    data: { kind: "archived", id: "11111111-1111-4111-8111-111111111111" },
    error: null,
  }));
  activeClient = { rpc };

  const handlers = archiveModule.Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Animal archive POST handler missing");
  const response = await handler({
    request: new Request(
      "http://localhost/api/admin/animals/11111111-1111-4111-8111-111111111111/archive",
      {
        method: "POST",
        body: JSON.stringify({ archived: true }),
      },
    ),
    params: { id: "11111111-1111-4111-8111-111111111111" },
  } as never);

  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("set_animal_archived_with_audit", {
    p_actor_user_id: "staff-user",
    p_animal_id: "11111111-1111-4111-8111-111111111111",
    p_archived: true,
  });
});
