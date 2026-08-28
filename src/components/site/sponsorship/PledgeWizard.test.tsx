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
