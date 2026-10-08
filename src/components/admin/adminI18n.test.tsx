import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminLanguageProvider, adminCopy, useAdminLanguage } from "./adminI18n";

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
});
