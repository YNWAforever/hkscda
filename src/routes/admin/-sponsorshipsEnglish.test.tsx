import { describe, expect, mock, test } from "bun:test";

import {
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../../components/admin/i18n/testing";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

// The pledge list has its own English test in components/admin/sponsorship; a stand-in keeps this
// test on what the page itself renders, which is its title.
mock.module("../../components/admin/sponsorship/PledgeReviewLane", () => ({
  PledgeReviewLane: () => <p>pledge review lane</p>,
}));

const { SponsorshipsContent } = await import("./sponsorships");

describe("sponsorship payments and matching page", () => {
  test("is titled in English with the navigation label", () => {
    const markup = renderAdminInEnglish(<SponsorshipsContent />);
    expectNoChineseText(markup);
    expect(markup).toContain("Sponsorship payments and matching");
    expect(markup).toContain("pledge review lane");
  });

  test("keeps its Chinese title", () => {
    const markup = renderAdminInChinese(<SponsorshipsContent />);
    expect(markup).toContain("<h1");
    expect(markup).toContain(">助養收款及配對</h1>");
  });
});
