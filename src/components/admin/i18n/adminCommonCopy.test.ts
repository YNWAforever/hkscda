import { describe, expect, test } from "bun:test";

import { adminCommonCopy } from "./adminCommonCopy";
import { expectNoChineseInCopy } from "./testing";

describe("adminCommonCopy", () => {
  test("the shell and the animal form have no Chinese in English, apart from the language toggle", () => {
    expect(Object.keys(adminCommonCopy.en.form).length).toBeGreaterThan(0);
    // The toggle names each language in its own language.
    expectNoChineseInCopy(adminCommonCopy.en, { allow: ["中文"] });
  });

  test("the animal form names its Chinese fields in English, and the zh wording is unchanged", () => {
    const { form } = adminCommonCopy.en;
    expect(form.chineseGroup).toBe("Chinese content");
    expect(form.chineseName).toBe("Chinese name *");
    expect(form.errors.name).toBe("Enter the Chinese name");
    expect(adminCommonCopy.zh.form.chineseGroup).toBe("中文內容");
    expect(adminCommonCopy.zh.form.chineseName).toBe("名字 *");
    expect(adminCommonCopy.zh.form.namePlaceholder).toBe("如：蝦米");
    expect(adminCommonCopy.zh.form.errors.age).toBe("請填寫年齡");
  });

  test("English animal copy lists items without a comma before and or or", () => {
    for (const language of ["zh", "en"] as const) {
      expect(adminCommonCopy[language].form.englishDescriptionPlaceholder).toBe(
        "Write temperament, health notes or adoption details",
      );
    }
  });

  test("signs out and signs in with the same verb in both directions", () => {
    expect(adminCommonCopy.en.common.logout).toBe("Sign out");
    expect(adminCommonCopy.en.login.submit).toBe("Sign in");
    expect(adminCommonCopy.zh.common.logout).toBe("登出");
  });

  test("keeps the zh-HK shell wording", () => {
    expect(adminCommonCopy.zh.layout.taskOverview).toBe("待辦總覽");
    expect(adminCommonCopy.zh.navGroups.animals).toBe("動物管理");
    expect(adminCommonCopy.zh.navItems["coordinator-intake"]).toBe("手動建案");
  });
});
