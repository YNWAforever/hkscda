import { describe, expect, mock, test } from "bun:test";

import { createSupabaseAboutPagesRepository } from "./repository.server";
import type { AboutPageContent } from "./types";

const validAbout: AboutPageContent = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  mission: { eyebrow: "e", title: "t", body: "b", sideBadge: "s", sideBody: "s" },
  impact: { eyebrow: "e", title: "t", description: "d" },
  journey: {
    eyebrow: "e",
    title: "t",
    steps: [
      { title: "1", description: "d" },
      { title: "2", description: "d" },
      { title: "3", description: "d" },
      { title: "4", description: "d" },
    ],
  },
  communityBand: {
    eyebrow: "e",
    title: "t",
    description: "d",
    cccpCard: { title: "t", description: "d" },
    tnrCard: { title: "t", description: "d" },
  },
  responsibleAdoption: {
    eyebrow: "e",
    title: "t",
    body: "b",
    linkLabel: "l",
    sideTitle: "s",
    principles: ["1", "2", "3"],
  },
  helpPaths: {
    eyebrow: "e",
    title: "t",
    items: [
      { title: "1", description: "d", label: "l" },
      { title: "2", description: "d", label: "l" },
      { title: "3", description: "d", label: "l" },
      { title: "4", description: "d", label: "l" },
    ],
  },
  closing: { title: "t", description: "d", buttonLabel: "b" },
};

function fakeClient({
  row,
  rpcData,
  rpcError,
}: {
  row?: { page_slug: string; content: unknown } | null;
  rpcData?: unknown;
  rpcError?: unknown;
} = {}) {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: row ?? null, error: null }),
      };
    },
    rpc: mock(async () => ({ data: rpcData ?? null, error: rpcError ?? null })),
  };
}

describe("createSupabaseAboutPagesRepository", () => {
  test("getContent returns null when no row exists", async () => {
    const repo = createSupabaseAboutPagesRepository(fakeClient({ row: null }) as never);
    expect(await repo.getContent("about")).toBeNull();
  });

  test("getContent returns null when the row's content fails schema validation", async () => {
    const repo = createSupabaseAboutPagesRepository(
      fakeClient({ row: { page_slug: "about", content: { hero: "not an object" } } }) as never,
    );
    expect(await repo.getContent("about")).toBeNull();
  });

  test("getContent parses a valid row into the matching page schema", async () => {
    const repo = createSupabaseAboutPagesRepository(
      fakeClient({ row: { page_slug: "about", content: validAbout } }) as never,
    );
    const result = await repo.getContent("about");
    expect(result).toEqual(validAbout);
  });

  test("upsertContent calls the RPC with the actor's auth_user_id and the page slug", async () => {
    const client = fakeClient({ rpcData: { page_slug: "about", content: validAbout } });
    const repo = createSupabaseAboutPagesRepository(client as never);
    await repo.upsertContent("about", validAbout, "actor-auth-id");
    expect(client.rpc).toHaveBeenCalledWith("upsert_about_page_content_with_audit", {
      p_actor_user_id: "actor-auth-id",
      p_page_slug: "about",
      p_content: validAbout,
    });
  });

  test("upsertContent throws the underlying error on RPC failure", async () => {
    const repo = createSupabaseAboutPagesRepository(
      fakeClient({ rpcError: { code: "42501", message: "forbidden" } }) as never,
    );
    await expect(repo.upsertContent("about", validAbout, "actor-auth-id")).rejects.toBeTruthy();
  });
});
