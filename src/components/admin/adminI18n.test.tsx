import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminLanguageProvider, adminCopy, useAdminLanguage } from "./adminI18n";
import { useAdminCopy, useSharedAdminCopy } from "./i18n/copy";
import { defineAdminCopy } from "./i18n/copyModule";
import { useAdminLanguageOrDefault } from "./i18n/languageContext";
import { adminLanguageTag, setAdminDocumentLanguage } from "./i18n/pageLanguage";
import { renderAdminInChinese, renderAdminInEnglish } from "./i18n/testing";

function LanguageProbe() {
  const { copy, language } = useAdminLanguage();
  return <p>{`${language}:${copy.common.save}`}</p>;
}

describe("AdminLanguageProvider", () => {
  test("starts in Chinese when no initial language is given", () => {
    const markup = renderToStaticMarkup(
      <AdminLanguageProvider>
        <LanguageProbe />
      </AdminLanguageProvider>,
    );
    expect(markup).toBe("<p>zh:儲存</p>");
  });

  test("starts in the initial language when one is given", () => {
    const markup = renderToStaticMarkup(
      <AdminLanguageProvider initialLanguage="en">
        <LanguageProbe />
      </AdminLanguageProvider>,
    );
    expect(markup).toBe("<p>en:Save</p>");
  });

  test("keeps copy as the active half of adminCopy", () => {
    expect(adminCopy.zh.common.save).toBe("儲存");
    expect(adminCopy.en.common.save).toBe("Save");
    expect(Object.keys(adminCopy).sort()).toEqual(["en", "zh"]);
  });

  test("a provider inside another provider shares the outer language", () => {
    // Every admin page mounts its own provider, so this is what lets a test choose the
    // language of a whole page by wrapping it once.
    const markup = renderToStaticMarkup(
      <AdminLanguageProvider initialLanguage="en">
        <AdminLanguageProvider>
          <LanguageProbe />
        </AdminLanguageProvider>
      </AdminLanguageProvider>,
    );
    expect(markup).toBe("<p>en:Save</p>");

    const nestedWithOwnLanguage = renderToStaticMarkup(
      <AdminLanguageProvider initialLanguage="en">
        <AdminLanguageProvider initialLanguage="zh">
          <LanguageProbe />
        </AdminLanguageProvider>
      </AdminLanguageProvider>,
    );
    expect(nestedWithOwnLanguage).toBe("<p>en:Save</p>");
  });

  test("renderAdminInEnglish reaches a page that mounts its own provider", () => {
    function PageWithItsOwnProvider() {
      return (
        <AdminLanguageProvider>
          <LanguageProbe />
        </AdminLanguageProvider>
      );
    }
    expect(renderAdminInEnglish(<PageWithItsOwnProvider />)).toBe("<p>en:Save</p>");
    expect(renderAdminInChinese(<PageWithItsOwnProvider />)).toBe("<p>zh:儲存</p>");
  });
});

describe("outside the provider", () => {
  const sample = defineAdminCopy({ zh: { a: "甲" }, en: { a: "A" } });

  function SharedProbe() {
    return <p>{useSharedAdminCopy(sample).a}</p>;
  }
  function ScreenProbe() {
    return <p>{useAdminCopy(sample).a}</p>;
  }

  test("a screen throws, because the provider is missing", () => {
    expect(() => renderToStaticMarkup(<ScreenProbe />)).toThrow(/AdminLanguageProvider/);
    expect(() => renderToStaticMarkup(<LanguageProbe />)).toThrow(/AdminLanguageProvider/);
  });

  test("a shared building block shows Chinese instead of throwing", () => {
    expect(renderToStaticMarkup(<SharedProbe />)).toBe("<p>甲</p>");
  });

  test("a shared building block follows the provider when there is one", () => {
    expect(renderAdminInEnglish(<SharedProbe />)).toBe("<p>A</p>");
    expect(renderAdminInChinese(<SharedProbe />)).toBe("<p>甲</p>");
  });

  test("useAdminLanguageOrDefault reports the language, or zh without a provider", () => {
    function Language() {
      return <p>{useAdminLanguageOrDefault()}</p>;
    }
    expect(renderToStaticMarkup(<Language />)).toBe("<p>zh</p>");
    expect(renderAdminInEnglish(<Language />)).toBe("<p>en</p>");
  });
});

describe("page language", () => {
  test("names zh-HK and en as the language tags", () => {
    expect(adminLanguageTag("zh")).toBe("zh-HK");
    expect(adminLanguageTag("en")).toBe("en");
  });

  test("setAdminDocumentLanguage sets the tag and puts the previous value back", () => {
    const root = { lang: "zh-Hant" };
    const restore = setAdminDocumentLanguage(root, "en");
    expect(root.lang).toBe("en");
    restore();
    expect(root.lang).toBe("zh-Hant");
  });

  test("setAdminDocumentLanguage restores an empty previous value", () => {
    const root = { lang: "" };
    setAdminDocumentLanguage(root, "zh")();
    expect(root.lang).toBe("");
  });
});
