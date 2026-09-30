import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskOverviewView } from "./TaskOverview";

test("task overview distinguishes real zero from unavailable", () => {
  const html = renderToStaticMarkup(
    <TaskOverviewView
      cards={[
        {
          key: "payment_pending",
          label: "待對帳款項",
          href: "/admin?section=payments",
          metric: { state: "ready", count: 0, oldestAt: null },
        },
        {
          key: "delivery_attention",
          label: "收條／通知需處理",
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
