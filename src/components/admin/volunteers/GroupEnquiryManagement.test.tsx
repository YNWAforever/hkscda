import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { GroupEnquiry, GroupEnquirySummary } from "../../../lib/groupEnquiries/types";

// This file used to assert substrings against the component's own source text,
// which passes whether or not the component renders. These render it instead.
const realReactQuery = await import("@tanstack/react-query");

const summary: GroupEnquirySummary = {
  id: "enquiry-1",
  organisationName: "聖士提反書院",
  contactPerson: "陳大文",
  activityType: "school_talk",
  participantCount: 40,
  status: "new",
  notificationStatus: "failed",
  assignedTo: null,
  createdAt: "2026-07-02T00:00:00.000Z",
};

const baseDetail: GroupEnquiry = {
  ...summary,
  email: "contact@example.com",
  phone: "91234567",
  otherActivityDescription: null,
  participantAgeProfile: "中四至中六",
  preferredDateNotes: "十月任何星期六",
  message: "希望安排一節關於流浪動物的講座。",
  notificationError: "SMTP timeout",
  adminNotes: "已致電跟進，等待對方回覆",
  idempotencyKey: "key-1",
  updatedAt: "2026-07-02T00:00:00.000Z",
};

let detail: GroupEnquiry = baseDetail;
let total = 1;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (String(queryKey[0]) === "group-enquiries") {
      return {
        data: { enquiries: [summary], total },
        error: null,
        isLoading: false,
        isFetching: false,
      };
    }
    return { data: { enquiry: detail }, error: null, isLoading: false };
  },
}));

const { GroupEnquiryManagement } = await import("./GroupEnquiryManagement");

const render = () => renderToStaticMarkup(<GroupEnquiryManagement />);

describe("GroupEnquiryManagement", () => {
  test("renders without throwing on realistic data", () => {
    expect(render()).toContain("團體查詢");
  });

  test("seeds the notes box from the selected enquiry, not from leftover state", () => {
    // The panel is keyed by enquiry id, so a different enquiry is a different
    // component instance seeded from its own stored notes. adminNotes used to
    // be parent state that nothing reset, and saving wrote the previously
    // selected enquiry's text onto this one.
    expect(render()).toContain("已致電跟進，等待對方回覆");
  });

  test("shows the enquiry's own content, which the old panel never displayed", () => {
    const markup = render();
    expect(markup).toContain("希望安排一節關於流浪動物的講座。");
    expect(markup).toContain("十月任何星期六");
    expect(markup).toContain("中四至中六");
    expect(markup).toContain("40");
  });

  test("labels every enum in Chinese instead of leaking the database values", () => {
    const markup = render();
    expect(markup).toContain("學校講座");
    expect(markup).toContain("新查詢");
    expect(markup).toContain("發送失敗");
    for (const raw of ["school_talk", "in_progress", "retryNotification"]) {
      expect(markup).not.toContain(`>${raw}<`);
    }
  });

  test("offers the working statuses for a new enquiry", () => {
    const markup = render();
    expect(markup).toContain("處理中");
    expect(markup).toContain("已解決");
    expect(markup).toContain("已結案");
  });

  test("offers a retry only when the notification actually failed", () => {
    expect(render()).toContain("重新發送通知");
    detail = { ...baseDetail, notificationStatus: "sent" };
    expect(render()).not.toContain("重新發送通知");
    detail = baseDetail;
  });

  test("shows page controls only when there is more than one page", () => {
    expect(render()).not.toContain("下一頁");
    total = 90;
    expect(render()).toContain("下一頁");
    total = 1;
  });
});
