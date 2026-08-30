import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  AboutPageContent,
  CccpPageContent,
  TnrPageContent,
} from "../../../lib/aboutPages/types";
import {
  ABOUT_PAGES_QUERY_KEY,
  AboutPagesManagementView,
  invalidateAboutPagesQueries,
} from "./AboutPagesManagement";

const aboutContent: AboutPageContent = {
  hero: {
    eyebrow: "關於我們",
    title: "About Hero Distinctive Title",
    description: "About hero description text.",
  },
  mission: {
    eyebrow: "使命引言",
    title: "使命標題",
    body: "使命內文",
    sideBadge: "側欄標籤",
    sideBody: "側欄內文",
  },
  impact: { eyebrow: "公開資料引言", title: "公開資料標題", description: "公開資料描述" },
  journey: {
    eyebrow: "步驟引言",
    title: "步驟標題",
    steps: [
      { title: "步驟一標題", description: "步驟一描述" },
      { title: "步驟二標題", description: "步驟二描述" },
      { title: "步驟三標題", description: "步驟三描述" },
      { title: "步驟四標題", description: "步驟四描述" },
    ],
  },
  communityBand: {
    eyebrow: "橫幅引言",
    title: "橫幅標題",
    description: "橫幅描述",
    cccpCard: { title: "CCCP 卡片標題", description: "CCCP 卡片描述" },
    tnrCard: { title: "TNR 卡片標題", description: "TNR 卡片描述" },
  },
  responsibleAdoption: {
    eyebrow: "負責任領養引言",
    title: "負責任領養標題",
    body: "負責任領養內文",
    linkLabel: "了解更多",
    sideTitle: "側欄標題",
    principles: ["原則一", "原則二", "原則三"],
  },
  helpPaths: {
    eyebrow: "參與方式引言",
    title: "參與方式標題",
    items: [
      { title: "方式一標題", description: "方式一描述", label: "方式一按鈕" },
      { title: "方式二標題", description: "方式二描述", label: "方式二按鈕" },
      { title: "方式三標題", description: "方式三描述", label: "方式三按鈕" },
      { title: "方式四標題", description: "方式四描述", label: "方式四按鈕" },
    ],
  },
  closing: { title: "結尾標題", description: "結尾描述", buttonLabel: "結尾按鈕" },
};

const tnrContent: TnrPageContent = {
  hero: {
    eyebrow: "TNR 引言",
    title: "TNR Hero Distinctive Title",
    description: "TNR hero description text.",
  },
  stages: [
    { title: "階段一標題", description: "階段一描述" },
    { title: "階段二標題", description: "階段二描述" },
    { title: "階段三標題", description: "階段三描述" },
  ],
  chapter: {
    title: "社區參與標題",
    description: "社區參與描述",
    bullets: ["重點一", "重點二", "重點三"],
  },
  cta: { eyebrow: "行動呼籲引言", title: "行動呼籲標題", descriptionPrefix: "行動呼籲描述前綴" },
};

const cccpContent: CccpPageContent = {
  hero: {
    eyebrow: "CCCP 引言",
    title: "CCCP Hero Distinctive Title",
    description: "CCCP hero description text.",
  },
  chapters: [
    { title: "章節一標題", description: "章節一描述" },
    { title: "章節二標題", description: "章節二描述" },
  ],
  workRows: [
    { scope: "範圍一", method: "方法一", result: "成果一" },
    { scope: "範圍二", method: "方法二", result: "成果二" },
    { scope: "範圍三", method: "方法三", result: "成果三" },
  ],
  workSectionTitle: "工作方式表格標題",
  cta: {
    eyebrow: "CCCP 行動呼籲引言",
    title: "CCCP 行動呼籲標題",
    description: "CCCP 行動呼籲描述",
    points: ["要點一", "要點二", "要點三"],
  },
};

const allPages = { about: aboutContent, tnr: tnrContent, cccp: cccpContent };

describe("AboutPagesManagementView", () => {
  test("renders the about tab's fields, including every journey step and help path", () => {
    const markup = renderToStaticMarkup(
      <AboutPagesManagementView
        activeTab="about"
        onTabChange={() => {}}
        data={allPages}
        onSave={() => {}}
        isSaving={false}
        isSaveError={false}
      />,
    );

    expect(markup).toContain('value="About Hero Distinctive Title"');
    expect(markup).not.toContain("TNR Hero Distinctive Title");
    expect(markup).not.toContain("CCCP Hero Distinctive Title");

    expect(markup).toContain("步驟一標題");
    expect(markup).toContain("步驟二標題");
    expect(markup).toContain("步驟三標題");
    expect(markup).toContain("步驟四標題");

    expect(markup).toContain("方式一標題");
    expect(markup).toContain("方式二標題");
    expect(markup).toContain("方式三標題");
    expect(markup).toContain("方式四標題");
    expect(markup).toContain("方式一按鈕");

    expect(markup).toContain("原則一");
    expect(markup).toContain("原則二");
    expect(markup).toContain("原則三");

    expect(markup).toContain("CCCP 卡片標題");
    expect(markup).toContain("TNR 卡片標題");
  });

  test("renders the tnr tab's fields, including every stage and chapter bullet", () => {
    const markup = renderToStaticMarkup(
      <AboutPagesManagementView
        activeTab="tnr"
        onTabChange={() => {}}
        data={allPages}
        onSave={() => {}}
        isSaving={false}
        isSaveError={false}
      />,
    );

    expect(markup).toContain('value="TNR Hero Distinctive Title"');
    expect(markup).not.toContain("About Hero Distinctive Title");
    expect(markup).not.toContain("CCCP Hero Distinctive Title");

    expect(markup).toContain("階段一標題");
    expect(markup).toContain("階段二標題");
    expect(markup).toContain("階段三標題");

    expect(markup).toContain("重點一");
    expect(markup).toContain("重點二");
    expect(markup).toContain("重點三");

    expect(markup).toContain("行動呼籲描述前綴");
  });

  test("renders the cccp tab's fields, including every chapter and work row", () => {
    const markup = renderToStaticMarkup(
      <AboutPagesManagementView
        activeTab="cccp"
        onTabChange={() => {}}
        data={allPages}
        onSave={() => {}}
        isSaving={false}
        isSaveError={false}
      />,
    );

    expect(markup).toContain('value="CCCP Hero Distinctive Title"');
    expect(markup).not.toContain("About Hero Distinctive Title");
    expect(markup).not.toContain("TNR Hero Distinctive Title");

    expect(markup).toContain("章節一標題");
    expect(markup).toContain("章節二標題");

    expect(markup).toContain("範圍一");
    expect(markup).toContain("方法一");
    expect(markup).toContain("成果一");
    expect(markup).toContain("範圍三");

    expect(markup).toContain("工作方式表格標題");
    expect(markup).toContain("要點一");
    expect(markup).toContain("要點二");
    expect(markup).toContain("要點三");
  });

  test("shows the save-error message only when isSaveError is true", () => {
    const withError = renderToStaticMarkup(
      <AboutPagesManagementView
        activeTab="about"
        onTabChange={() => {}}
        data={allPages}
        onSave={() => {}}
        isSaving={false}
        isSaveError={true}
      />,
    );
    expect(withError).toContain('role="alert"');
    expect(withError).toContain("儲存失敗");

    const withoutError = renderToStaticMarkup(
      <AboutPagesManagementView
        activeTab="about"
        onTabChange={() => {}}
        data={allPages}
        onSave={() => {}}
        isSaving={false}
        isSaveError={false}
      />,
    );
    expect(withoutError).not.toContain("儲存失敗");
  });

  test("invalidates the about-pages query", async () => {
    const invalidateQueries = mock(async () => undefined);
    await invalidateAboutPagesQueries({ invalidateQueries });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ABOUT_PAGES_QUERY_KEY });
  });
});
