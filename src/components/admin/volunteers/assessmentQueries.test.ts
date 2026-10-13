import { expect, test } from "bun:test";
import {
  assessmentJobsQueryOptions,
  assessmentListingQueryOptions,
  shouldHydrateAssessmentDraft,
} from "./assessmentQueries";
test("settings and notification queries independently read real endpoints with cancellation", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetcher = async <T>(path: string, init?: RequestInit): Promise<T> => {
    calls.push([path, init]);
    if (path.includes("jobs")) throw new Error("jobs 500");
    return { draft: undefined } as T;
  };
  const controller = new AbortController();
  const settings = assessmentListingQueryOptions(fetcher);
  const jobs = assessmentJobsQueryOptions(fetcher);
  await expect(settings.queryFn!({ signal: controller.signal } as never)).resolves.toEqual({
    draft: undefined,
  });
  await expect(jobs.queryFn!({ signal: controller.signal } as never)).rejects.toThrow("jobs 500");
  expect(calls[0][0]).toBe("/api/admin/volunteers/assessments/");
  expect(calls[0][1]?.body).toBe('{"kind":"list"}');
  expect(calls[1][0]).toBe("/api/admin/volunteers/jobs/");
  expect(calls[1][1]?.signal).toBe(controller.signal);
});
test("background revisions never hydrate a dirty draft", () => {
  expect(shouldHydrateAssessmentDraft(false, 0, 1)).toBe(true);
  expect(shouldHydrateAssessmentDraft(true, 1, 2)).toBe(false);
  expect(shouldHydrateAssessmentDraft(false, 1, 1)).toBe(false);
  expect(shouldHydrateAssessmentDraft(false, 2, 1)).toBe(false);
});
