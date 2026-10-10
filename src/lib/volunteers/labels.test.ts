import { describe, expect, test } from "bun:test";

import { expectNoChineseText } from "../../components/admin/i18n/testing";
import {
  volunteerRegistrationStatusLabel,
  volunteerRegistrationStatusLabels,
  volunteerRegistrationStatusLabelsFor,
} from "./labels";
import { volunteerRegistrationStatuses } from "./types";

describe("the volunteer registration status labels", () => {
  test("the zh-HK labels are what the registration emails and the public pages have always shown", () => {
    expect(volunteerRegistrationStatusLabels).toEqual({
      pending: "待審批",
      approved: "已批准",
      waitlisted: "候補中",
      rejected: "已拒絕",
      cancelled: "已取消",
    });
    // The default language is Chinese, so a caller that does not pass one is unchanged.
    for (const status of volunteerRegistrationStatuses) {
      expect(volunteerRegistrationStatusLabel(status)).toBe(
        volunteerRegistrationStatusLabels[status],
      );
      expect(volunteerRegistrationStatusLabel(status, "zh")).toBe(
        volunteerRegistrationStatusLabels[status],
      );
    }
    expect(volunteerRegistrationStatusLabelsFor()).toBe(volunteerRegistrationStatusLabels);
  });

  test("the English labels are one English word each, with no Chinese", () => {
    expect(volunteerRegistrationStatusLabelsFor("en")).toEqual({
      pending: "Pending",
      approved: "Approved",
      waitlisted: "Waitlisted",
      rejected: "Rejected",
      cancelled: "Cancelled",
    });
    for (const status of volunteerRegistrationStatuses) {
      expectNoChineseText(volunteerRegistrationStatusLabel(status, "en"));
    }
  });
});
