import { describe, expect, test } from "bun:test";

import { clearDraft, DRAFT_TTL_MS, readDraft, writeDraft } from "./localDraft";

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    entries,
  };
}

const now = new Date("2026-09-27T10:00:00.000Z");

describe("versioned local draft envelope", () => {
  test("saves a seven-day opt-in envelope and reads it just before expiry", () => {
    const storage = memoryStorage();
    expect(writeDraft(storage, "form", { name: "Ada" }, 3, now)).toBe(true);
    expect(JSON.parse(storage.entries.get("form")!)).toEqual({
      schemaVersion: 2,
      savedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + DRAFT_TTL_MS).toISOString(),
      step: 3,
      data: { name: "Ada" },
    });
    expect(readDraft(storage, "form", new Date(now.getTime() + DRAFT_TTL_MS - 1))).toMatchObject({
      state: "available",
      draft: { step: 3, data: { name: "Ada" } },
    });
  });

  test("removes drafts at expiry and across a calendar-day boundary", () => {
    const storage = memoryStorage();
    writeDraft(storage, "form", { name: "Ada" }, 1, now);
    expect(readDraft(storage, "form", new Date(now.getTime() + DRAFT_TTL_MS))).toEqual({
      state: "expired",
    });
    expect(storage.entries.has("form")).toBe(false);
    expect(readDraft(storage, "form", new Date(now.getTime() + DRAFT_TTL_MS + 1))).toEqual({
      state: "none",
    });
  });

  test("does not silently restore unversioned or malformed drafts", () => {
    const storage = memoryStorage();
    storage.setItem("form", JSON.stringify({ contact: { email: "old@example.com" } }));
    expect(readDraft(storage, "form", now)).toEqual({ state: "invalid" });
    expect(storage.entries.has("form")).toBe(true);
    storage.setItem("form", "{bad");
    expect(readDraft(storage, "form", now)).toEqual({ state: "invalid" });
    expect(clearDraft(storage, "form")).toBe(true);
    expect(readDraft(storage, "form", now)).toEqual({ state: "none" });
  });

  test("never blocks the form when storage is denied or full", () => {
    const denied = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(readDraft(denied, "form", now)).toEqual({ state: "invalid" });
    expect(writeDraft(denied, "form", { name: "Ada" }, 0, now)).toBe(false);
    expect(clearDraft(denied, "form")).toBe(false);
  });
});
