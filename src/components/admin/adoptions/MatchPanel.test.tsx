import { describe, expect, test } from "bun:test";
import type { JSX } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CoordinatorStatus } from "../../../lib/adoptions/types";
import {
  formatAnimalOptionLabel,
  getDefaultMatchStatusId,
  getMatchableAnimalStatuses,
} from "./matchPanelLogic";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const matchPanelModule = await import("./MatchPanel");
const { MatchPanelAsyncError } = matchPanelModule as typeof matchPanelModule & {
  MatchPanelAsyncError?: (props: { message: string }) => JSX.Element;
};

function status(overrides: Partial<CoordinatorStatus> = {}): CoordinatorStatus {
  return {
    id: "status-1",
    category: "match",
    key: "proposed",
    labelZh: "建議",
    labelEn: "Proposed",
    sortOrder: 1,
    color: "blue",
    isActive: true,
    isSystem: true,
    isClosing: false,
    isFinal: false,
    ...overrides,
  };
}

describe("MatchPanel helpers", () => {
  test("matches available and fostered animals", () => {
    expect(typeof getMatchableAnimalStatuses).toBe("function");
    expect(getMatchableAnimalStatuses?.()).toEqual(["available", "fostered"]);
  });

  test("includes the animal status in the selector label", () => {
    expect(typeof formatAnimalOptionLabel).toBe("function");
    expect(
      formatAnimalOptionLabel?.({
        name: "Mochi",
        name_en: "Momo",
        type: "cat",
        status: "fostered",
      }),
    ).toBe("Mochi / Momo (cat · fostered)");
  });

  test("prefers proposed as the default match status", () => {
    expect(typeof getDefaultMatchStatusId).toBe("function");
    expect(
      getDefaultMatchStatusId?.([
        status({ id: "suggested", key: "suggested", sortOrder: 1 }),
        status({ id: "proposed", key: "proposed", sortOrder: 2 }),
      ]),
    ).toBe("proposed");
  });

  test("falls back to suggested as the default match status when proposed is absent", () => {
    expect(typeof getDefaultMatchStatusId).toBe("function");
    expect(
      getDefaultMatchStatusId?.([
        status({ id: "reviewing", key: "reviewing", sortOrder: 1 }),
        status({ id: "suggested", key: "suggested", sortOrder: 2 }),
      ]),
    ).toBe("suggested");
  });

  test("announces async match panel errors", () => {
    expect(typeof MatchPanelAsyncError).toBe("function");

    const markup = renderToStaticMarkup(
      MatchPanelAsyncError ? <MatchPanelAsyncError message="Animal load failed" /> : <div />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Animal load failed");
  });
});
