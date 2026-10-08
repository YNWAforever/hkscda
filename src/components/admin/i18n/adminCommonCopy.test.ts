import { describe, expect, test } from "bun:test";

import { adminCommonCopy } from "./adminCommonCopy";
import { expectNoChineseInCopy } from "./testing";

describe("adminCommonCopy", () => {
  test("the shell sections have no Chinese in English, apart from the language toggle", () => {
    // `form` is the animal form, which labels its Chinese-language fields in Chinese on
    // purpose; the animal screens are converted with the animals area.
    const { form, ...shell } = adminCommonCopy.en;
    expect(Object.keys(form).length).toBeGreaterThan(0);
    // The toggle names each language in its own language.
    expectNoChineseInCopy(shell, { allow: ["中文"] });
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
