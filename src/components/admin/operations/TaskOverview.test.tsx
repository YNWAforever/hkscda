import { expect, test } from "bun:test";
import { TaskOverviewView } from "./TaskOverview";
import { renderAdminInChinese } from "../i18n/testing";

test("task overview distinguishes real zero from unavailable", () => {
  const html = renderAdminInChinese(
    <TaskOverviewView
      cards={[
        {
          key: "payment_pending",
          label: "待對帳款項",
          guidance: "核對付款證據及對帳資料，再逐筆確認款項。",
          href: "/admin?section=payments",
          metric: { state: "ready", count: 0, oldestAt: null },
        },
        {
          key: "delivery_attention",
          label: "收條／通知需處理",
          guidance: "核對已收款及收件資料，再逐筆處理失敗工作。",
          href: "/admin?section=payments",
          metric: { state: "unavailable" },
        },
      ]}
    />,
  );
  expect(html).toContain("0");
  expect(html).toContain("未能讀取");
  expect(html).toContain("/admin?section=payments");
});

test("task overview presents the role tasks as an ordered guide with direct destinations", () => {
  const html = renderAdminInChinese(
    <TaskOverviewView
      cards={[
        {
          key: "payment_pending",
          label: "待對帳款項",
          guidance: "核對付款證據及對帳資料，再逐筆確認款項。",
          href: "/admin?section=payments",
          metric: { state: "ready", count: 2, oldestAt: null },
        },
      ]}
    />,
  );
  expect(html).toContain("<ol");
  expect(html).toContain("工作起步建議");
  expect(html).toContain("核對付款證據及對帳資料");
  expect(html).toContain('href="/admin?section=payments"');
});
