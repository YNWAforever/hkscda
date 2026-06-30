import { describe, expect, test } from "bun:test";

import type { AnimalMatchSummary, CoordinatorStatus } from "../../../lib/adoptions/types";
import {
  buildCaseListSearchParams,
  buildFinalizationPayload,
  filterStatusesByCategory,
  findApprovedMatches,
  findDefaultAdoptedOutcomeStatus,
  formatDate,
  formatFallback,
  formatHkdCents,
} from "./caseWorkflowLogic";

function status(overrides: Partial<CoordinatorStatus> = {}): CoordinatorStatus {
  return {
    id: "status-1",
    category: "adoption_case",
    key: "new",
    labelZh: "新個案",
    labelEn: "New",
    sortOrder: 1,
    color: "blue",
    isActive: true,
    isSystem: true,
    isClosing: false,
    isFinal: false,
    ...overrides,
  };
}

function match(overrides: Partial<AnimalMatchSummary> = {}): AnimalMatchSummary {
  return {
    id: "match-1",
    animalId: "animal-1",
    animalName: "Mochi",
    status: status({ category: "match", key: "suggested" }),
    isApproved: false,
    notes: null,
    ...overrides,
  };
}

describe("case workflow logic", () => {
  test("builds case list search params with trimmed filters and pagination", () => {
    expect(
      buildCaseListSearchParams({
        q: "  Ada  ",
        statusId: "status-1",
        animalType: " cat ",
        openOnly: true,
        page: 2,
        pageSize: 50,
      }).toString(),
    ).toBe("q=Ada&statusId=status-1&animalType=cat&openOnly=true&page=2&pageSize=50");
  });

  test("omits blank case list filters and false open-only while keeping defaults", () => {
    expect(
      buildCaseListSearchParams({
        q: " ",
        statusId: "",
        animalType: " ",
        openOnly: false,
      }).toString(),
    ).toBe("page=1&pageSize=25");
  });

  test("filters active statuses by category in sort order", () => {
    const statuses = [
      status({ id: "closed", category: "adoption_case", labelZh: "結案", sortOrder: 30 }),
      status({ id: "inactive", category: "adoption_case", isActive: false, sortOrder: 1 }),
      status({ id: "approved", category: "match", sortOrder: 2 }),
      status({ id: "screening", category: "adoption_case", labelZh: "初審", sortOrder: 10 }),
    ];

    expect(filterStatusesByCategory(statuses, "adoption_case").map((item) => item.id)).toEqual([
      "screening",
      "closed",
    ]);
  });

  test("formats fallback display, dates, and HKD cents", () => {
    expect(formatFallback("  value  ")).toBe("value");
    expect(formatFallback(null)).toBe("-");
    expect(formatDate("2026-06-01T12:30:00Z")).toBe("2026-06-01");
    expect(formatDate(null)).toBe("-");
    expect(formatHkdCents(123456)).toBe("HK$1,234.56");
    expect(formatHkdCents(null)).toBe("-");
  });

  test("builds finalization payload with cents and nullable optional fields", () => {
    expect(
      buildFinalizationPayload({
        matchId: " match-1 ",
        outcomeStatusId: " outcome-1 ",
        caseNumber: " HK-2026-001 ",
        adoptionFeeHkd: " 888.5 ",
        approvalDate: "2026-06-15",
        pickupDate: " ",
      }),
    ).toEqual({
      matchId: "match-1",
      outcomeStatusId: "outcome-1",
      caseNumber: "HK-2026-001",
      adoptionFeeCents: 88850,
      approvalDate: "2026-06-15",
      pickupDate: null,
    });
  });

  test("returns null finalization payload for invalid money or missing required fields", () => {
    expect(
      buildFinalizationPayload({
        matchId: "match-1",
        outcomeStatusId: "outcome-1",
        caseNumber: "HK-2026-001",
        adoptionFeeHkd: "12.345",
        approvalDate: "2026-06-15",
        pickupDate: "",
      }),
    ).toBeNull();

    expect(
      buildFinalizationPayload({
        matchId: "",
        outcomeStatusId: "outcome-1",
        caseNumber: "HK-2026-001",
        adoptionFeeHkd: "",
        approvalDate: "2026-06-15",
        pickupDate: "",
      }),
    ).toBeNull();
  });

  test("finds approved matches and the active adopted final outcome status", () => {
    const approved = match({
      id: "approved-match",
      isApproved: true,
      status: status({ category: "match", key: "approved", isFinal: true }),
    });
    const rejected = match({
      id: "rejected-match",
      status: status({ category: "match", key: "no" }),
    });
    const adopted = status({
      id: "adopted",
      category: "final_outcome",
      key: "adopted",
      isFinal: true,
      sortOrder: 2,
    });

    expect(findApprovedMatches([rejected, approved])).toEqual([approved]);
    expect(
      findDefaultAdoptedOutcomeStatus([
        status({ id: "other", category: "final_outcome", key: "not_adopted", isFinal: true }),
        adopted,
      ]),
    ).toEqual(adopted);
  });

  test("excludes approved matches that are not active final approved statuses", () => {
    const eligible = match({
      id: "eligible-match",
      isApproved: true,
      status: status({ category: "match", key: "approved", isActive: true, isFinal: true }),
    });
    const inactive = match({
      id: "inactive-match",
      isApproved: true,
      status: status({ category: "match", key: "approved", isActive: false, isFinal: true }),
    });
    const nonFinal = match({
      id: "non-final-match",
      isApproved: true,
      status: status({ category: "match", key: "approved", isActive: true, isFinal: false }),
    });
    const wrongKey = match({
      id: "wrong-key-match",
      isApproved: true,
      status: status({ category: "match", key: "proposed", isActive: true, isFinal: true }),
    });

    expect(findApprovedMatches([inactive, nonFinal, wrongKey, eligible])).toEqual([eligible]);
  });

  test("does not default to an inactive or non-final adopted outcome status", () => {
    expect(
      findDefaultAdoptedOutcomeStatus([
        status({
          id: "inactive-adopted",
          category: "final_outcome",
          key: "adopted",
          isActive: false,
          isFinal: true,
        }),
        status({
          id: "non-final-adopted",
          category: "final_outcome",
          key: "adopted",
          isActive: true,
          isFinal: false,
        }),
      ]),
    ).toBeNull();
  });
});
