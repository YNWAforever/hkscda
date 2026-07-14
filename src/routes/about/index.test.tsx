import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AboutContent } from "./index";

describe("AboutContent", () => {
  test("renders the approved mission sequence without unverified legacy figures", () => {
    const markup = renderToStaticMarkup(<AboutContent impact={[]} />);

    expect(markup).toContain("領養代替購買");
    expect(markup).toContain("救援");
    expect(markup).toContain("醫療照護");
    expect(markup).toContain("絕育");
    expect(markup).toContain("配對領養");
    expect(markup).not.toContain("每年救助超過 600");
    expect(markup).not.toContain("6,800");
  });
});
