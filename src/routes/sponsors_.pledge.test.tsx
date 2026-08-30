import { afterAll, describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// Captured via a destructured dynamic import (a one-time value read) rather than a static
// `import { PledgeWizard } from "..."` binding: bun:test's mock.module overwrites the live
// export binding in place, so a static import here would silently track the mock below too.
const { PledgeWizard: RealPledgeWizard } =
  await import("../components/site/sponsorship/PledgeWizard");

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

mock.module("../components/site/sponsorship/PledgeWizard", () => ({
  PledgeWizard: () => <p>pledge-content</p>,
}));

afterAll(() => {
  mock.module("../components/site/sponsorship/PledgeWizard", () => ({
    PledgeWizard: RealPledgeWizard,
  }));
});

describe("sponsorship pledge route", () => {
  test("wraps PledgeWizard with a breadcrumb back to sponsors and a trust note", async () => {
    const { PledgePage } = await import("./sponsors_.pledge");
    const markup = renderToStaticMarkup(<PledgePage />);

    expect(markup).toContain("pledge-content");
    expect(markup).toContain('href="/sponsors"');
    expect(markup).toContain("返回助養區");
    expect(markup).toContain("detail-breadcrumb");
    expect(markup).toContain("trust-cue");
    expect(markup).toContain("你的個人資料只會用於處理助養承諾及聯絡，不會作其他用途。");
  });
});
