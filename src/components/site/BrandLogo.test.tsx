import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo", () => {
  test("renders the local authentic logo without distortion", () => {
    const markup = renderToStaticMarkup(<BrandLogo className="h-12" eager />);

    expect(markup).toContain('src="/brand/hkscda-logo-primary.jpg"');
    expect(markup).toContain('alt="香港拯救貓狗協會 HKSCDA"');
    expect(markup).toContain('width="960"');
    expect(markup).toContain('height="960"');
    expect(markup).toContain("object-contain");
    expect(markup).toContain('loading="eager"');
  });
});
