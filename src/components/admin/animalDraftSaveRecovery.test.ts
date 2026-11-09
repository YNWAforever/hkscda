import { describe, expect, test } from "bun:test";

import { AdminApiError } from "../../lib/admin/session";
import { isStaleDraftSave, saveAnimalDraft } from "./animalDraftSaveRecovery";

function staleDraftError() {
  return new AdminApiError({
    status: 409,
    code: "stale_draft",
    message: "草稿已在其他地方更新，已重新載入；你的修改仍然保留，請再次儲存。",
  });
}

describe("animal draft save recovery", () => {
  test("a saved draft adopts the returned revision", async () => {
    const outcome = await saveAnimalDraft({
      save: async () => ({ kind: "saved", revision: 9 }),
      readDraft: async () => {
        throw new Error("the draft must not be re-read");
      },
    });

    expect(outcome).toEqual({ status: "saved", revision: 9 });
  });

  test("CMS-01: a stale save re-reads the draft, keeps the edits and rebases the revision", async () => {
    const reads: string[] = [];
    const outcome = await saveAnimalDraft({
      save: async () => {
        throw staleDraftError();
      },
      readDraft: async () => {
        reads.push("read");
        return { draft: { revision: 12 } };
      },
    });

    // "rebased" means the editor must not treat the save as done: the local edits are kept
    // and the next save uses revision 12 rather than the stale one it kept re-sending.
    expect(outcome).toEqual({ status: "rebased", revision: 12 });
    expect(reads).toEqual(["read"]);
  });

  test("a non-conflict failure is the ordinary save failure and is not re-read", async () => {
    const outcome = await saveAnimalDraft({
      save: async () => {
        throw new AdminApiError({ status: 500, code: "publication_failed", message: "boom" });
      },
      readDraft: async () => {
        throw new Error("the draft must not be re-read");
      },
    });

    expect(outcome).toEqual({ status: "failed" });
  });

  test("a 409 without the stale_draft code is not treated as a stale revision", async () => {
    expect(isStaleDraftSave(new AdminApiError({ status: 409, message: "conflict" }))).toBe(false);
    expect(isStaleDraftSave(new Error("stale_draft"))).toBe(false);
  });

  test("a failed re-read falls back to the ordinary save failure", async () => {
    const outcome = await saveAnimalDraft({
      save: async () => {
        throw staleDraftError();
      },
      readDraft: async () => {
        throw new Error("network");
      },
    });

    expect(outcome).toEqual({ status: "failed" });
  });

  test("a re-read that finds no draft falls back to the ordinary save failure", async () => {
    const outcome = await saveAnimalDraft({
      save: async () => {
        throw staleDraftError();
      },
      readDraft: async () => ({ draft: null }),
    });

    expect(outcome).toEqual({ status: "failed" });
  });
});
