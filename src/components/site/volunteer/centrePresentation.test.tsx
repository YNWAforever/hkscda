import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { VolunteerRecords } from "./VolunteerRecords";
import { VolunteerSessionBrowser } from "./VolunteerSessionBrowser";
import type { VolunteerMe } from "../../../lib/volunteers/policy/booking";
const member: VolunteerMe = {
  profile: { id: "p", display_name: "Member", tier: "regular", status: "active" },
  registrations: [
    {
      id: "registration",
      activity_id: "a",
      status: "approved",
      attendance_status: "not_recorded",
      notes: "private-not-rendered",
      activity: {
        id: "a",
        title: "過往服務的真實名稱",
        starts_at: "2020-01-01T01:00:00Z",
        ends_at: "2020-01-01T03:00:00Z",
        location: "測試貓舍",
      },
    },
  ],
};
test("record keeps actual past title and time, never invents verified attendance", () => {
  const html = renderToStaticMarkup(
    <VolunteerRecords
      me={member}
      mode="record"
      busy={false}
      onCancel={async () => {}}
      onBrowse={() => {}}
    />,
  );
  expect(html).toContain("過往服務的真實名稱");
  expect(html).toContain("測試貓舍");
  expect(html).toContain("尚未核實");
  expect(html).toContain("較早歷史尚待核實");
  expect(html).not.toContain("private-not-rendered");
  expect(html).toContain("—");
});
test("empty and loading sessions tell members what they can do next", () => {
  const props = { sessions: [], selected: "", onSelect: () => {}, onRetry: () => {} };
  expect(renderToStaticMarkup(<VolunteerSessionBrowser {...props} loading={false} />)).toContain(
    "先登入及完成身份登記",
  );
  expect(renderToStaticMarkup(<VolunteerSessionBrowser {...props} loading />)).toContain(
    "正在載入服務場次",
  );
});
