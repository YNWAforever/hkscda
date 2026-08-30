import { describe, expect, mock, test } from "bun:test";

import { createAboutPagesService } from "./service";

const validTnr = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  stages: [
    { title: "1", description: "d" },
    { title: "2", description: "d" },
    { title: "3", description: "d" },
  ],
  chapter: { title: "t", description: "d", bullets: ["1", "2", "3"] },
  cta: { eyebrow: "e", title: "t", descriptionPrefix: "p" },
};

function fakeRepo(overrides: Partial<{ getContent: unknown; upsertContent: unknown }> = {}) {
  return {
    getContent: mock(async () => null),
    upsertContent: mock(async (_slug: string, content: unknown) => content),
    ...overrides,
  };
}

describe("createAboutPagesService", () => {
  test("listPublic fetches all three pages concurrently", async () => {
    const repo = fakeRepo({
      getContent: mock(async (slug: string) => ({ slug })),
    });
    const service = createAboutPagesService({ repo } as never);
    const result = await service.listPublic();
    expect(result).toEqual({
      about: { slug: "about" },
      tnr: { slug: "tnr" },
      cccp: { slug: "cccp" },
    } as never);
  });

  test("upsertAdmin validates content against the page's own schema before delegating", async () => {
    const repo = fakeRepo();
    const service = createAboutPagesService({ repo } as never);
    await service.upsertAdmin({ actorUserId: "actor-1", pageSlug: "tnr", content: validTnr });
    expect(repo.upsertContent).toHaveBeenCalledWith("tnr", validTnr, "actor-1");
  });

  test("upsertAdmin rejects content that doesn't match the page's schema", async () => {
    const repo = fakeRepo();
    const service = createAboutPagesService({ repo } as never);
    await expect(
      service.upsertAdmin({ actorUserId: "actor-1", pageSlug: "tnr", content: { hero: {} } }),
    ).rejects.toThrow();
    expect(repo.upsertContent).not.toHaveBeenCalled();
  });

  test("upsertAdmin does not expose or call any separate audit method — the RPC handles it atomically", async () => {
    const repo = fakeRepo();
    const service = createAboutPagesService({ repo } as never);
    expect("insertAuditLog" in service).toBe(false);
    await service.upsertAdmin({ actorUserId: "actor-1", pageSlug: "tnr", content: validTnr });
  });
});
