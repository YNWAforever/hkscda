import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PersonRecords } from "./VolunteerPersonDetail";
import type { DirectoryDetail } from "../../../lib/volunteers/directory/types";
const data: DirectoryDetail = {
  profile: {
    id: "canonical-profile",
    display_name: "測試義工",
    birth_date: null,
    tier: "newcomer",
    status: "pending",
    verified_at: null,
    joined_on: null,
    history_coverage_start: null,
    revision: 1,
    linked_email: "fixture@example.test",
    email_verified: true,
    account_linked: true,
  },
  credentials: [],
  registrations: [],
  attendance_events: [],
  verification_history: [],
  coverage: {
    history_coverage_start: null,
    registration_total: 0,
    attendance_event_total: 0,
    verification_event_total: 0,
    credential_total: 0,
    records_limit: 100,
    scope: "linked_profile_records_only",
  },
};
describe("person detail", () => {
  test("links canonical identity to qualifications and preserves directory filters", () => {
    const html = renderToStaticMarkup(
      createElement(PersonRecords, { data, search: { q: "fixture", page: 3 } }),
    );
    expect(html).toContain("qualifications?profile_id=canonical-profile");
    expect(html).toContain("page=3");
    expect(html).toContain("電郵已驗證");
    expect(html).toContain("待核實");
  });
  test("does not infer service history or hours from missing facts", () => {
    const html = renderToStaticMarkup(
      createElement(PersonRecords, { data, search: { page: 1 }, initialTab: "attendance" }),
    );
    expect(html).toContain("未設定歷史覆蓋起點");
    expect(html).toContain("沒有已連結的出席事實紀錄");
    expect(html).not.toContain("0 小時");
  });
});
