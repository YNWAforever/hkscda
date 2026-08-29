import { expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

import type { PublicBoardRoster } from "@/lib/governance/publicPage.server";

const realReactRouter = await import("@tanstack/react-router");

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const populatedRoster: PublicBoardRoster = {
  members: [
    { name: "陳大文", roleTitle: "主席", sortOrder: 0 },
    { name: "李小明", roleTitle: "義務秘書", sortOrder: 1 },
  ],
  lastUpdated: "2026-08-29T00:00:00.000Z",
};

test("renders the board roster and a last-updated date when populated", async () => {
  const { TeamPage } = await import("./team");
  const html = renderToString(<TeamPage roster={populatedRoster} />);

  expect(html).toContain("陳大文");
  expect(html).toContain("主席");
  expect(html).toContain("2026年8月29日");
  expect(html).not.toContain("尚未有公開資料");
  expect(html.match(/<h1/g) ?? []).toHaveLength(1);
});

test("shows a genuinely-empty state distinct from an error, when there are zero active members", async () => {
  const { TeamPage } = await import("./team");
  const html = renderToString(<TeamPage roster={{ members: [], lastUpdated: null }} />);

  expect(html).toContain("尚未有公開資料");
  expect(html).not.toContain("暫時未能載入");
});

test("shows a distinct temporarily-unavailable state on load failure", async () => {
  const { TeamLoadError } = await import("./team");
  const html = renderToString(<TeamLoadError />);

  expect(html).toContain("暫時未能載入");
  expect(html).not.toContain("尚未有公開資料");
  expect(html).toContain('role="alert"');
});
