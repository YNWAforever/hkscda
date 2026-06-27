import { describe, expect, test } from "bun:test";

import {
  buildStatusMutationPayload,
  createBlankStatusForm,
  getStatusFormErrors,
  statusToStatusForm,
} from "./statusAdminLogic";
import type { CoordinatorStatus } from "../../../lib/adoptions/types";

function status(overrides: Partial<CoordinatorStatus> = {}): CoordinatorStatus {
  return {
    id: "status-1",
    category: "adoption_case",
    key: "screening",
    labelZh: "初審",
    labelEn: "Screening",
    sortOrder: 1,
    color: "blue",
    isActive: true,
    isSystem: false,
    isClosing: false,
    isFinal: false,
    ...overrides,
  };
}

describe("status admin form logic", () => {
  test("builds a full payload when creating a status", () => {
    const form = {
      ...createBlankStatusForm("adoption_case"),
      key: " screening ",
      labelZh: " 初審 ",
      labelEn: " Screening ",
      sortOrder: "2",
      color: "coral",
      isActive: true,
      isClosing: true,
      isFinal: false,
    };

    expect(buildStatusMutationPayload(form)).toEqual({
      category: "adoption_case",
      key: "screening",
      labelZh: "初審",
      labelEn: "Screening",
      sortOrder: 2,
      color: "coral",
      isActive: true,
      isClosing: true,
      isFinal: false,
    });
  });

  test("builds a PATCH payload with only fields changed from the original snapshot", () => {
    const original = statusToStatusForm(status());
    const form = {
      ...original,
      labelEn: "Review",
      sortOrder: "3",
    };

    expect(buildStatusMutationPayload(form, original)).toEqual({
      labelEn: "Review",
      sortOrder: 3,
    });
  });

  test("returns null for an unchanged edit payload", () => {
    const original = statusToStatusForm(status());

    expect(buildStatusMutationPayload({ ...original }, original)).toBeNull();
  });

  test("rejects decimal sort orders instead of truncating them", () => {
    const form = {
      ...createBlankStatusForm("adoption_case"),
      key: "screening",
      labelZh: "初審",
      labelEn: "Screening",
      sortOrder: "1.9",
    };

    expect(getStatusFormErrors(form)).toEqual({
      sortOrder: "Sort order must be a whole number 0 or greater.",
    });
  });

  test("rejects blank sort orders instead of patching them as zero", () => {
    const original = statusToStatusForm(status({ sortOrder: 7 }));
    const form = {
      ...original,
      sortOrder: "   ",
    };

    expect(getStatusFormErrors(form)).toEqual({
      sortOrder: "Sort order must be a whole number 0 or greater.",
    });
    expect(buildStatusMutationPayload(form, original)).toBeNull();
  });

  test("validates keys before submission with the backend key format", () => {
    const form = {
      ...createBlankStatusForm("adoption_case"),
      key: "Screening-Done",
      labelZh: "已完成",
      labelEn: "Done",
      sortOrder: "1",
    };

    expect(getStatusFormErrors(form)).toEqual({
      key: "Key must start with a lowercase letter and use only lowercase letters, numbers, and underscores.",
    });
  });
});
