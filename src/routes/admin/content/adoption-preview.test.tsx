import { expect, test } from "bun:test";
import { loadAdoptionInstructionPreview } from "../../../lib/adoptionInstructions/preview";
import { initialAdoptionInstructionContent as copy } from "../../../lib/adoptionInstructions/content";
import type { AdoptionInstructionRevision } from "../../../lib/adoptionInstructions/types";
const page = {
  copy,
  feesBySpecies: { cat: [], dog: [] },
  estates: [],
  guideGroups: [],
  rules: [],
  careTopics: { cat: [], dog: [] },
};
const draft: AdoptionInstructionRevision = {
  id: "22222222-2222-4222-8222-222222222222",
  pageKey: "adoption-instructions",
  revisionNumber: 2,
  state: "draft",
  content: { ...copy, hero: { ...copy.hero, title: "Preview title" } },
  version: 1,
  sourceRevisionId: null,
  createdBy: null,
  updatedBy: null,
  publishedBy: null,
  publishedAt: null,
  createdAt: "2026-09-26T00:00:00Z",
  updatedAt: "2026-09-26T00:00:00Z",
};
test("preview replaces only page labels and preserves the live bilingual collections", async () => {
  const result = await loadAdoptionInstructionPreview(
    async () => page,
    async () => draft,
  );
  expect(result.copy.hero.title).toBe("Preview title");
  expect(page.copy.hero.title).toBe("領養需知");
  expect(result.rules).toBe(page.rules);
  expect(result.careTopics).toBe(page.careTopics);
});
test("preview propagates authorization failures instead of displaying public copy as a draft", async () => {
  await expect(
    loadAdoptionInstructionPreview(
      async () => page,
      async () => {
        throw new Error("forbidden");
      },
    ),
  ).rejects.toThrow("forbidden");
});
