import { afterAll, describe, expect, mock, test } from "bun:test";

import type { AnyAboutPageContent } from "./types";

// `mock.module` mocks are process-global in Bun's test runner and outlive this
// file: they aren't undone by `mock.restore()`, so an unmocked-back specifier
// here would leak into every other test file (in the same `bun test` run)
// that imports "../donations/supabase.server" or "./repository.server" after
// this one — e.g. `repository.server.test.ts`'s own unit tests would silently
// start exercising these fakes instead of the real implementation. Capture the
// real modules first so `afterAll` can put them back.
// Spread into plain objects: `mock.module` mutates the shared module-registry
// exports object in place, so a bare reference captured here would be mutated
// out from under us the moment the mocks below are installed.
const realSupabaseServerModule = { ...(await import("../donations/supabase.server")) };
const realRepositoryModule = { ...(await import("./repository.server")) };

const createSupabaseServiceClient = mock((): unknown => ({}));
const getContent = mock(async (_slug: string): Promise<unknown> => null);

mock.module("../donations/supabase.server", () => ({
  createSupabaseServiceClient: () => createSupabaseServiceClient(),
}));

mock.module("./repository.server", () => ({
  createSupabaseAboutPagesRepository: () => ({ getContent }),
}));

const { loadAboutPageContent } = await import("./publicPage.server");

afterAll(() => {
  mock.module("../donations/supabase.server", () => realSupabaseServerModule);
  mock.module("./repository.server", () => realRepositoryModule);
});

describe("loadAboutPageContent", () => {
  test("returns the repository's content when the lookup succeeds", async () => {
    // Loose fixture: the repository is fully mocked out here, so this stands
    // in for "whatever shape the repository returned" rather than a
    // schema-valid page. Cast past the real (much larger) union type.
    const content = {
      hero: { eyebrow: "e", title: "t", description: "d" },
    } as unknown as AnyAboutPageContent;
    getContent.mockResolvedValueOnce(content);

    await expect(loadAboutPageContent("about")).resolves.toEqual(content);
  });

  test("returns null instead of throwing when the client can't be created", async () => {
    createSupabaseServiceClient.mockImplementationOnce(() => {
      throw new Error("missing env vars");
    });

    await expect(loadAboutPageContent("about")).resolves.toBeNull();
  });

  test("returns null instead of throwing when the repository lookup rejects", async () => {
    getContent.mockRejectedValueOnce(new Error("database unreachable"));

    await expect(loadAboutPageContent("tnr")).resolves.toBeNull();
  });
});
