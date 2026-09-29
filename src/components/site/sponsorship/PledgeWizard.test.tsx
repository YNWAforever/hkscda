import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShortlistContext, type ShortlistContextValue } from "../ShortlistContext";
import type { ShortlistItem } from "../../../lib/publicAdoption/shortlist";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const seededItem: ShortlistItem = {
  id: "sponsor-1",
  name: "小白",
  animalType: "sponsor",
  imageUrl: null,
  intent: "sponsorship",
  rank: 1,
};

const stubContext: ShortlistContextValue = {
  items: [seededItem],
  persistenceWarning: null,
  message: null,
  addItem: () => {},
  removeItem: () => {},
  clearMessage: () => {},
  clear: () => {},
  clearIntent: () => {},
  reorderAdoptions: () => {},
  findItem: () => undefined,
};

describe("PledgeWizard", () => {
  test("offers device-only draft saving as an unchecked choice", async () => {
    const { PledgeWizard } = await import("./PledgeWizard");
    const markup = renderToStaticMarkup(
      <ShortlistContext.Provider value={stubContext}>
        <PledgeWizard />
      </ShortlistContext.Provider>,
    );
    expect(markup).toContain("在此裝置保存");
    expect(markup).toMatch(/type="checkbox"[^>]*aria-label="在此裝置保存草稿"/);
    expect(markup).not.toMatch(/aria-label="在此裝置保存草稿"[^>]*checked/);
  });

  test("offers explicit later and proof-uploaded payment choices", async () => {
    const { PledgeWizard } = await import("./PledgeWizard");
    const markup = renderToStaticMarkup(
      <ShortlistContext.Provider value={stubContext}>
        <PledgeWizard />
      </ShortlistContext.Provider>,
    );
    expect(markup).toContain("稍後按核實安排付款");
    expect(markup).toContain("已付款，上載證明");
    expect(markup).toContain('type="radio"');
  });

  test("renders exactly one h1 in the main pledge form", async () => {
    const { PledgeWizard } = await import("./PledgeWizard");
    const markup = renderToStaticMarkup(
      <ShortlistContext.Provider value={stubContext}>
        <PledgeWizard />
      </ShortlistContext.Provider>,
    );

    expect(markup.match(/<h1/g) ?? []).toHaveLength(1);
    expect(markup).toContain("確認助養承諾");
  });
});
