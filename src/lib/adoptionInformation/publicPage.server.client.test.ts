import { describe, expect, test } from "bun:test";

import {
  POST_ADOPTION_GUIDE_SLOT_KEY,
  createPublicAdoptionPageReaderFromClient,
} from "./publicPage.server";

class FakeSupabaseQuery {
  private filters: Array<[string, unknown]> = [];

  constructor(
    private readonly table: string,
    private readonly calls: string[],
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

  order() {
    return this;
  }

  then(resolve: (value: unknown) => unknown) {
    this.calls.push(this.table);
    return Promise.resolve({ data: this.rows(), error: null }).then(resolve);
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

function fakeSupabaseClient(calls: string[]) {
  return {
    from(table: string) {
      return new FakeSupabaseQuery(table, calls);
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
    expect(result.guides.map((slot) => slot.document.fileUrl)).toEqual([
      "https://cdn.test/site-documents/adoption-guides/post-adoption-guide-en.pdf",
    ]);
  });
});
