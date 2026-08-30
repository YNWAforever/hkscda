import { describe, expect, mock, test } from "bun:test";

import { createFaqService } from "./service";
import type { FaqEntry, FaqRepository } from "./types";

const actorId = "11111111-1111-4111-8111-111111111111";

function entry(overrides: Partial<FaqEntry> = {}): FaqEntry {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    category: "sponsorship",
    question: { "zh-HK": "問題", en: "Question" },
    answer: { "zh-HK": "答案", en: "Answer" },
    keywords: { "zh-HK": ["助養"], en: ["sponsor"] },
    ctaKey: "view_sponsor_animals",
    sensitive: false,
    sortOrder: 0,
    isActive: true,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

function createFakeRepo(overrides: Partial<FaqRepository> = {}): FaqRepository {
  return {
    listPublic: mock(async () => []),
    listAdmin: mock(async () => [entry()]),
    upsert: mock(async () => entry()),
    deactivate: mock(async () => undefined),
    ...overrides,
  };
}

describe("createFaqService", () => {
  test("listPublic and listAdmin delegate to the repository", async () => {
    const repo = createFakeRepo();
    const service = createFaqService({ repo });
    await service.listPublic();
    await service.listAdmin();
    expect(repo.listPublic).toHaveBeenCalledTimes(1);
    expect(repo.listAdmin).toHaveBeenCalledTimes(1);
  });

  test("upsert validates input via the schema before calling the repository", async () => {
    const repo = createFakeRepo();
    const service = createFaqService({ repo });

    await service.upsert({
      actorUserId: actorId,
      input: {
        category: "sponsorship",
        questionZh: "問題",
        questionEn: "Question",
        answerZh: "答案",
        answerEn: "Answer",
        keywordsZh: ["助養"],
        keywordsEn: ["sponsor"],
        ctaKey: "view_sponsor_animals",
        sensitive: false,
        sortOrder: 0,
        isActive: true,
      },
    });

    expect(repo.upsert).toHaveBeenCalledTimes(1);
    const [passedInput, passedActor] = (repo.upsert as ReturnType<typeof mock>).mock.calls[0];
    expect(passedActor).toBe(actorId);
    expect(passedInput.category).toBe("sponsorship");
    expect(passedInput.isActive).toBe(true);
  });

  test("upsert defaults isActive to true when the caller omits it (e.g. creating a new entry)", async () => {
    const repo = createFakeRepo();
    const service = createFaqService({ repo });

    await service.upsert({
      actorUserId: actorId,
      input: {
        category: "sponsorship",
        questionZh: "問題",
        questionEn: "Question",
        answerZh: "答案",
        answerEn: "Answer",
        keywordsZh: ["助養"],
        keywordsEn: ["sponsor"],
        ctaKey: "view_sponsor_animals",
        sensitive: false,
        sortOrder: 0,
      },
    });

    const [passedInput] = (repo.upsert as ReturnType<typeof mock>).mock.calls[0];
    expect(passedInput.isActive).toBe(true);
  });

  test("upsert passes isActive: false through when the caller explicitly deactivates via the edit form", async () => {
    const repo = createFakeRepo();
    const service = createFaqService({ repo });

    await service.upsert({
      actorUserId: actorId,
      input: {
        category: "sponsorship",
        questionZh: "問題",
        questionEn: "Question",
        answerZh: "答案",
        answerEn: "Answer",
        keywordsZh: ["助養"],
        keywordsEn: ["sponsor"],
        ctaKey: "view_sponsor_animals",
        sensitive: false,
        sortOrder: 0,
        isActive: false,
      },
    });

    const [passedInput] = (repo.upsert as ReturnType<typeof mock>).mock.calls[0];
    expect(passedInput.isActive).toBe(false);
  });

  test("upsert rejects invalid input before ever calling the repository", async () => {
    const repo = createFakeRepo();
    const service = createFaqService({ repo });

    await expect(
      service.upsert({
        actorUserId: actorId,
        input: { category: "not-real", questionZh: "", questionEn: "", answerZh: "", answerEn: "" },
      }),
    ).rejects.toBeTruthy();
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  test("deactivate validates the id and delegates to the repository", async () => {
    const repo = createFakeRepo();
    const service = createFaqService({ repo });
    await service.deactivate({ actorUserId: actorId, id: entry().id });
    expect(repo.deactivate).toHaveBeenCalledWith(entry().id, actorId);
  });

  test("deactivate rejects a non-uuid id before calling the repository", async () => {
    const repo = createFakeRepo();
    const service = createFaqService({ repo });
    await expect(
      service.deactivate({ actorUserId: actorId, id: "not-a-uuid" }),
    ).rejects.toBeTruthy();
    expect(repo.deactivate).not.toHaveBeenCalled();
  });
});
