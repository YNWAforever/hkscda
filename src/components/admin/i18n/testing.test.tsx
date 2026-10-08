import { describe, expect, test } from "bun:test";
import { AdminLanguageToggle, useAdminLanguage } from "../adminI18n";
import { expectNoChineseText, renderAdminInChinese, renderAdminInEnglish } from "./testing";

function LanguageProbe() {
  const { language } = useAdminLanguage();
  return <p>{language}</p>;
}

describe("expectNoChineseText", () => {
  test("passes when the markup has no Chinese", () => {
    expect(() => expectNoChineseText("<p>Hi</p>")).not.toThrow();
  });

  test("throws and names the Chinese it found", () => {
    expect(() => expectNoChineseText("<p>Hi 你好</p>")).toThrow(/你好/);
  });

  test("names every separate run it found", () => {
    expect(() => expectNoChineseText("<p>你好</p><p>Stop</p><p>再見</p>")).toThrow(/你好.*再見/s);
  });

  test("passes when every Chinese run is allowed", () => {
    expect(() => expectNoChineseText("<p>Hi 你好</p>", { allow: ["你好"] })).not.toThrow();
  });

  test("still throws for Chinese that is not on the allow list", () => {
    expect(() => expectNoChineseText("<p>你好 再見</p>", { allow: ["你好"] })).toThrow(/再見/);
  });

  test("allows fixture text that sits inside a longer run of Chinese", () => {
    expect(() => expectNoChineseText("<p>小白貓</p>", { allow: ["小白"] })).toThrow(/貓/);
    expect(() => expectNoChineseText("<p>小白貓</p>", { allow: ["小白貓"] })).not.toThrow();
  });

  test("catches Chinese punctuation and full-width characters", () => {
    expect(() => expectNoChineseText("<p>Done。</p>")).toThrow();
    expect(() => expectNoChineseText("<p>Done：</p>")).toThrow();
    expect(() => expectNoChineseText("<p>（1）</p>")).toThrow();
  });
});

describe("renderAdminInEnglish and renderAdminInChinese", () => {
  test("provide the matching language to the element", () => {
    expect(renderAdminInEnglish(<LanguageProbe />)).toBe("<p>en</p>");
    expect(renderAdminInChinese(<LanguageProbe />)).toBe("<p>zh</p>");
  });

  test("render the shared toggle with the active language pressed", () => {
    const english = renderAdminInEnglish(<AdminLanguageToggle />);
    expect(english).toMatch(/aria-pressed="true"[^>]*>English</);
    expect(english).toMatch(/aria-pressed="false"[^>]*>中文</);

    const chinese = renderAdminInChinese(<AdminLanguageToggle />);
    expect(chinese).toMatch(/aria-pressed="true"[^>]*>中文</);
  });
});
