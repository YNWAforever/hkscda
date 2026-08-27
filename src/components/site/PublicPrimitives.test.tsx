import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckCircle2 } from "lucide-react";
import { PublicPageHero } from "./PublicPageHero";
import { PublicStatusBadge } from "./PublicStatusBadge";
import { PublicStateShell } from "./PublicStateShell";

describe("public brand primitives", () => {
  test("renders an image-backed hero with one h1 and explicit image alternative text", () => {
    const markup = renderToStaticMarkup(
      <PublicPageHero
        eyebrow="香港本地動物救援"
        title="領養代替購買"
        description="讓生命重新有家"
        imageSrc="/example.jpg"
        imageAlt="獲救貓狗在義工照顧下休息"
      />,
    );
    expect(markup).toContain("<h1");
    expect(markup).toContain('alt="獲救貓狗在義工照顧下休息"');
    expect(markup).toContain("public-page-hero-grid");
    expect(markup).toContain("public-page-hero-photo");
  });

  test("renders status with text and icon rather than colour alone", () => {
    const markup = renderToStaticMarkup(
      <PublicStatusBadge tone="success" icon={CheckCircle2}>
        已領養
      </PublicStatusBadge>,
    );
    expect(markup).toContain("已領養");
    expect(markup).toContain("<svg");
  });

  test("announces error states", () => {
    const markup = renderToStaticMarkup(
      <PublicStateShell title="暫時未能載入" description="請稍後再試" role="alert" />,
    );
    expect(markup).toContain('role="alert"');
  });
});
