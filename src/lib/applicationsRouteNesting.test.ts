import { describe, expect, test } from "bun:test";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

describe("admin applications route nesting", () => {
  test("mounts the case list and detail as children of the applications layout route", async () => {
    const { routeTree } = await import("../routeTree.gen");
    const applicationsRoute = routeTree.children?.find(
      (route) => route.options?.id === "/admin/applications",
    );

    expect(applicationsRoute).toBeDefined();
    expect(applicationsRoute?.children?.map((child) => child.options?.path).sort()).toEqual([
      "/",
      "/$id",
    ]);
  });
});
