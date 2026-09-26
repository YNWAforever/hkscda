import { initialAdoptionInstructionContent } from "../adoptionInstructions/content";
import { describe, expect, test } from "bun:test";

import {
  POST_ADOPTION_GUIDE_SLOT_KEY,
  createPublicAdoptionPageReaderFromClient,
} from "./publicPage.server";

type FakeOptions = {
  revisionError?: { code: string; message: string } | null;
  revisionData?: unknown;
  revisionContent?: unknown;
  tableError?: { table: string; code: string; message: string };
};

class FakeSupabaseQuery {
  private filters: Array<[string, unknown]> = [];
  private rangeBounds: [number, number] | null = null;

  constructor(
    private readonly table: string,
    private readonly calls: string[],
    private readonly options: FakeOptions,
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push([column, values]);
    return this;
  }

  async maybeSingle() {
    this.calls.push(this.table);
    expect(this.table).toBe("adoption_instruction_revisions");
    expect(this.filters).toEqual([
      ["page_key", "adoption-instructions"],
      ["state", "published"],
    ]);
    if (this.options.revisionError) return { data: null, error: this.options.revisionError };
    if ("revisionData" in this.options) return { data: this.options.revisionData, error: null };
    return {
      data: {
        id: "44444444-4444-4444-8444-444444444444",
        page_key: "adoption-instructions",
        revision_number: 1,
        state: "published",
        content: this.options.revisionContent ?? initialAdoptionInstructionContent,
        source_revision_id: null,
        version: 1,
        created_by: null,
        updated_by: null,
        published_by: null,
        published_at: "2026-09-26T00:00:00Z",
        created_at: "2026-09-26T00:00:00Z",
        updated_at: "2026-09-26T00:00:00Z",
      },
      error: null,
    };
  }

  order() {
    return this;
  }

  range(from: number, to: number) {
    this.rangeBounds = [from, to];
    return this;
  }

  then(resolve: (value: unknown) => unknown) {
    this.calls.push(this.table);
    const rows = this.rows();
    const data = this.rangeBounds ? rows.slice(this.rangeBounds[0], this.rangeBounds[1] + 1) : rows;
    const error = this.options.tableError?.table === this.table ? this.options.tableError : null;
    return Promise.resolve({ data: error ? null : data, error, count: rows.length }).then(resolve);
  }

  private rows() {
    if (this.table === "adoption_fees") {
      return [
        {
          id: "11111111-1111-4111-8111-111111111111",
          animal_type: "dog",
          item_name: "Dog adoption fee",
          price_hkd: "0",
          sort_order: 0,
          is_published: true,
        },
      ];
    }
    if (this.table === "site_document_slots") {
      const slotKeys = this.filters.find(([column]) => column === "slot_key")?.[1] as string[];
      if (!slotKeys.includes(POST_ADOPTION_GUIDE_SLOT_KEY)) return [];
      return [
        {
          id: "22222222-2222-4222-8222-222222222222",
          slot_key: POST_ADOPTION_GUIDE_SLOT_KEY,
          language: "en",
          is_published: true,
          document_assets: {
            id: "33333333-3333-4333-8333-333333333333",
            kind: "adoption_guide",
            title: "What to know after adopting a cat",
            language: "en",
            bucket_name: "site-documents",
            object_path: "adoption-guides/post-adoption-guide-en.pdf",
            mime_type: "application/pdf",
            byte_size: 1024,
            checksum_sha256: null,
            is_published: true,
            sort_order: 0,
            created_at: "2026-07-18T00:00:00.000Z",
            updated_at: "2026-07-18T00:00:00.000Z",
          },
        },
      ];
    }
    return [];
  }
}

function fakeSupabaseClient(calls: string[], options: FakeOptions = {}) {
  return {
    from(table: string) {
      return new FakeSupabaseQuery(table, calls, options);
    },
    storage: {
      from(bucket: string) {
        return {
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://cdn.test/${bucket}/${path}` } };
          },
        };
      },
    },
  };
}

describe("public adoption page reader client wiring", () => {
  test("loads fees and guide slots through one supplied server client", async () => {
    const calls: string[] = [];
    const read = createPublicAdoptionPageReaderFromClient(fakeSupabaseClient(calls) as never);

    const result = await read();

    expect(calls).toContain("adoption_fees");
    expect(calls).toContain("dog_friendly_estates");
    expect(calls).toContain("site_document_slots");
    expect(result.feesBySpecies.dog.map((fee) => fee.itemName)).toEqual(["Dog adoption fee"]);
    expect(result.guideGroups).toEqual([]);
    expect(result.copy.hero.title).toBe("領養需知");
  });

  test("uses the approved seed copy while the CMS migration has not run", async () => {
    const calls: string[] = [];
    const read = createPublicAdoptionPageReaderFromClient(
      fakeSupabaseClient(calls, {
        revisionError: {
          code: "PGRST205",
          message: "Could not find the table in the schema cache",
        },
      }) as never,
    );

    const result = await read();

    expect(result.copy).toEqual(initialAdoptionInstructionContent);
    expect(result.feesBySpecies.dog.map((fee) => fee.itemName)).toEqual(["Dog adoption fee"]);
  });

  test("uses approved seed copy for a missing CMS relation (42P01)", async () => {
    const read = createPublicAdoptionPageReaderFromClient(
      fakeSupabaseClient([], {
        revisionError: { code: "42P01", message: "relation does not exist" },
      }) as never,
    );
    expect((await read()).copy).toEqual(initialAdoptionInstructionContent);
  });

  test.each(["42501", "XX000", "PGRST116"])("rejects CMS read error %s", async (code) => {
    const read = createPublicAdoptionPageReaderFromClient(
      fakeSupabaseClient([], { revisionError: { code, message: "CMS read failed" } }) as never,
    );
    await expect(read()).rejects.toThrow();
  });

  test("rejects an absent published CMS revision", async () => {
    const read = createPublicAdoptionPageReaderFromClient(
      fakeSupabaseClient([], { revisionData: null }) as never,
    );
    await expect(read()).rejects.toThrow("Published adoption instructions were not found");
  });

  test("rejects invalid published CMS content", async () => {
    const read = createPublicAdoptionPageReaderFromClient(
      fakeSupabaseClient([], { revisionContent: { invalid: true } }) as never,
    );
    await expect(read()).rejects.toThrow();
  });

  test("prefers valid published CMS content over the seed", async () => {
    const copy = {
      ...initialAdoptionInstructionContent,
      hero: { ...initialAdoptionInstructionContent.hero, title: "CMS revision title" },
    };
    const read = createPublicAdoptionPageReaderFromClient(
      fakeSupabaseClient([], { revisionContent: copy }) as never,
    );
    expect((await read()).copy.hero.title).toBe("CMS revision title");
  });

  test.each(["adoption_fees", "site_document_slots"])(
    "rejects an unrelated %s read error",
    async (table) => {
      const read = createPublicAdoptionPageReaderFromClient(
        fakeSupabaseClient([], {
          revisionError: { code: "PGRST205", message: "CMS table missing" },
          tableError: { table, code: "42501", message: "unrelated source denied" },
        }) as never,
      );
      await expect(read()).rejects.toThrow();
    },
  );

  test("keeps unrelated CMS read errors visible", async () => {
    const read = createPublicAdoptionPageReaderFromClient(
      fakeSupabaseClient([], {
        revisionError: { code: "42501", message: "permission denied" },
      }) as never,
    );

    expect(read()).rejects.toThrow();
  });
});
