import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { initialAdoptionInstructionContent } from "./content";
import { createSupabaseAdoptionInstructionRepository } from "./repository.server";

const now = "2026-09-27T00:00:00Z";
const idFor = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function fixture(count: number) {
  const revisions = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return {
      id: idFor(n),
      page_key: "adoption-instructions",
      revision_number: n,
      state: n === count && count > 1 ? "draft" : n === 1 ? "published" : "archived",
      content: initialAdoptionInstructionContent,
      source_revision_id: null,
      version: n,
      created_by: null,
      updated_by: null,
      published_by: null,
      published_at: n === 1 ? now : null,
      created_at: now,
      updated_at: now,
    };
  });
  const page = {
    page_key: "adoption-instructions",
    published_revision_id: idFor(1),
    draft_revision_id: count > 1 ? idFor(count) : null,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  const reads: Array<{
    table: string;
    columns: string;
    limit: number | null;
    filters: Record<string, unknown>;
  }> = [];
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let columns = "";
      let limit: number | null = null;
      let cursor = "";
      const query = {
        select(value: string) {
          columns = value;
          return query;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        order() {
          return query;
        },
        limit(value: number) {
          limit = value;
          return query;
        },
        or(value: string) {
          cursor = value;
          return query;
        },
        async maybeSingle() {
          reads.push({ table, columns, limit, filters: { ...filters } });
          if (table === "adoption_instruction_pages") return { data: page, error: null };
          const match = revisions.find(
            (item) => item.id === filters.id && item.page_key === filters.page_key,
          );
          return { data: match ?? null, error: null };
        },
        then(resolve: (value: unknown) => unknown) {
          reads.push({ table, columns, limit, filters: { ...filters, cursor } });
          let rows: Record<string, unknown>[] = revisions.slice().reverse();
          if (cursor) {
            const match = cursor.match(/revision_number.lt\.(\d+)/);
            if (match)
              rows = rows.filter((item) => Number(item.revision_number) < Number(match[1]));
          }
          rows = rows.slice(0, Math.min(limit ?? 1000, 1000));
          if (!columns.includes("content"))
            rows = rows.map(({ content: _content, ...item }) => item);
          return Promise.resolve(resolve({ data: rows, error: null }));
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { repository: createSupabaseAdoptionInstructionRepository(client), reads, revisions };
}

describe("adoption instruction revision read model", () => {
  for (const count of [1, 100, 1002]) {
    test(
      "keeps active revisions outside the history page and bounds " + count + " revisions",
      async () => {
        const { repository, reads, revisions } = fixture(count);
        const legacyHistoryBytes = Buffer.byteLength(
          JSON.stringify(revisions.slice().reverse().slice(0, 1000)),
        );
        const result = await repository.getAdminPage();
        const currentPageBytes = Buffer.byteLength(JSON.stringify(result));
        console.log(
          JSON.stringify({
            metric: "T11 synthetic history payload",
            count,
            legacyHistoryBytes,
            currentPageBytes,
          }),
        );
        expect(result.published?.id).toBe(idFor(1));
        expect(result.draft?.id).toBe(count > 1 ? idFor(count) : undefined);
        expect(result.history.length).toBe(Math.min(count, 25));
        expect(result.history[0]).not.toHaveProperty("content");
        expect(
          reads.find(
            (read) => read.table === "adoption_instruction_revisions" && read.limit !== null,
          )?.columns,
        ).not.toContain("content");
        expect(currentPageBytes).toBeLessThan(20_000);
        if (count > 1) expect(currentPageBytes).toBeLessThan(legacyHistoryBytes);
      },
    );
  }
});

test("revision cursor pages remain stable when a newer revision arrives", async () => {
  const { repository, revisions } = fixture(100);
  const first = await repository.listHistory();
  expect(first.items).toHaveLength(25);
  expect(first.nextCursor).toBe("76:" + idFor(76));
  revisions.push({ ...revisions[0], id: idFor(101), revision_number: 101, state: "archived" });
  const second = await repository.listHistory({ cursor: first.nextCursor, limit: 25 });
  expect(second.items).toHaveLength(25);
  expect(second.items[0].revisionNumber).toBe(75);
  expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(50);
  expect(second.nextCursor).toBe("51:" + idFor(51));
  await expect(repository.listHistory({ limit: 101 })).rejects.toMatchObject({ status: 422 });
  await expect(repository.listHistory({ cursor: "bad" })).rejects.toMatchObject({ status: 422 });
});
