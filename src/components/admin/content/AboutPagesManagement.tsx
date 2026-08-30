import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  AboutPageContent,
  AboutPageSlug,
  CccpChapter,
  CccpPageContent,
  HelpPathItem,
  JourneyStep,
  TnrPageContent,
  TnrStage,
  WorkRow,
} from "../../../lib/aboutPages/types";

export const ABOUT_PAGES_QUERY_KEY = ["admin-about-pages"] as const;

type PagesData = {
  about: AboutPageContent | null;
  tnr: TnrPageContent | null;
  cccp: CccpPageContent | null;
};

const TABS: readonly [AboutPageSlug, string][] = [
  ["about", "關於我們"],
  ["tnr", "TNR"],
  ["cccp", "CCCP"],
];

export function invalidateAboutPagesQueries(client: {
  invalidateQueries(input: { queryKey: readonly string[] }): Promise<unknown>;
}) {
  return client.invalidateQueries({ queryKey: ABOUT_PAGES_QUERY_KEY });
}

export function AboutPagesManagement() {
  return <AboutPagesManagementRuntime />;
}

function AboutPagesManagementRuntime() {
  const [activeTab, setActiveTab] = useState<AboutPageSlug>("about");
  const queryClient = useQueryClient();

  const pagesQuery = useQuery({
    queryKey: ABOUT_PAGES_QUERY_KEY,
    queryFn: () => fetchAdminJson<PagesData>("/api/admin/about-pages"),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: { pageSlug: AboutPageSlug; content: unknown }) =>
      fetchAdminJson("/api/admin/about-pages", { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => invalidateAboutPagesQueries(queryClient),
  });

  if (pagesQuery.isLoading) return <p aria-live="polite">載入頁面內容中…</p>;
  if (pagesQuery.isError || !pagesQuery.data) {
    return (
      <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
        未能載入頁面內容，請重新整理頁面。
      </p>
    );
  }

  return (
    <AboutPagesManagementView
      activeTab={activeTab}
      onTabChange={setActiveTab}
      data={pagesQuery.data}
      onSave={(pageSlug, content) => upsertMutation.mutate({ pageSlug, content })}
      isSaving={upsertMutation.isPending}
      isSaveError={upsertMutation.isError}
    />
  );
}

export function AboutPagesManagementView({
  activeTab,
  onTabChange,
  data,
  onSave,
  isSaving,
  isSaveError,
}: {
  activeTab: AboutPageSlug;
  onTabChange: (tab: AboutPageSlug) => void;
  data: PagesData;
  onSave: (pageSlug: AboutPageSlug, content: unknown) => void;
  isSaving: boolean;
  isSaveError: boolean;
}) {
  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">宣傳內容</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">關於頁面管理</h1>
      </div>

      <div className="flex gap-2 border-b border-[var(--color-border)]" role="tablist">
        {TABS.map(([slug, label]) => (
          <button
            key={slug}
            type="button"
            role="tab"
            aria-selected={activeTab === slug}
            className={
              "min-h-11 px-4 py-2 " +
              (activeTab === slug ? "border-b-2 border-[var(--color-primary)] font-bold" : "")
            }
            onClick={() => onTabChange(slug)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "about" && data.about ? (
        <AboutTabForm
          content={data.about}
          onSave={(c) => onSave("about", c)}
          isSaving={isSaving}
          isSaveError={isSaveError}
        />
      ) : null}
      {activeTab === "tnr" && data.tnr ? (
        <TnrTabForm
          content={data.tnr}
          onSave={(c) => onSave("tnr", c)}
          isSaving={isSaving}
          isSaveError={isSaveError}
        />
      ) : null}
      {activeTab === "cccp" && data.cccp ? (
        <CccpTabForm
          content={data.cccp}
          onSave={(c) => onSave("cccp", c)}
          isSaving={isSaving}
          isSaveError={isSaveError}
        />
      ) : null}
    </div>
  );
}

function SaveBar({ isSaving, isSaveError }: { isSaving: boolean; isSaveError: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <button type="submit" className="btn-primary min-h-11 px-4" disabled={isSaving}>
        儲存
      </button>
      {isSaveError ? (
        <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
          儲存失敗，請檢查資料後再試一次。
        </p>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const inputClassName = "mt-1 block w-full border border-[var(--color-border)] px-3 py-2";
  return (
    <label className="block">
      {label}
      {multiline ? (
        <textarea
          className={inputClassName}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        />
      ) : (
        <input
          className={inputClassName}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        />
      )}
    </label>
  );
}

function AboutTabForm({
  content,
  onSave,
  isSaving,
  isSaveError,
}: {
  content: AboutPageContent;
  onSave: (content: AboutPageContent) => void;
  isSaving: boolean;
  isSaveError: boolean;
}) {
  const [draft, setDraft] = useState(content);
  useEffect(() => setDraft(content), [content]);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">主視覺</legend>
        <TextField
          label="引言"
          value={draft.hero.eyebrow}
          onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, eyebrow: v } })}
        />
        <TextField
          label="標題"
          value={draft.hero.title}
          onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, title: v } })}
        />
        <TextField
          label="描述"
          value={draft.hero.description}
          onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, description: v } })}
          multiline
        />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">我們的使命</legend>
        <TextField
          label="引言"
          value={draft.mission.eyebrow}
          onChange={(v) => setDraft({ ...draft, mission: { ...draft.mission, eyebrow: v } })}
        />
        <TextField
          label="標題"
          value={draft.mission.title}
          onChange={(v) => setDraft({ ...draft, mission: { ...draft.mission, title: v } })}
        />
        <TextField
          label="內文"
          value={draft.mission.body}
          onChange={(v) => setDraft({ ...draft, mission: { ...draft.mission, body: v } })}
          multiline
        />
        <TextField
          label="側欄標籤"
          value={draft.mission.sideBadge}
          onChange={(v) => setDraft({ ...draft, mission: { ...draft.mission, sideBadge: v } })}
        />
        <TextField
          label="側欄內文"
          value={draft.mission.sideBody}
          onChange={(v) => setDraft({ ...draft, mission: { ...draft.mission, sideBody: v } })}
          multiline
        />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">公開資料</legend>
        <TextField
          label="引言"
          value={draft.impact.eyebrow}
          onChange={(v) => setDraft({ ...draft, impact: { ...draft.impact, eyebrow: v } })}
        />
        <TextField
          label="標題"
          value={draft.impact.title}
          onChange={(v) => setDraft({ ...draft, impact: { ...draft.impact, title: v } })}
        />
        <TextField
          label="描述"
          value={draft.impact.description}
          onChange={(v) => setDraft({ ...draft, impact: { ...draft.impact, description: v } })}
          multiline
        />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">四個重要步驟</legend>
        <TextField
          label="引言"
          value={draft.journey.eyebrow}
          onChange={(v) => setDraft({ ...draft, journey: { ...draft.journey, eyebrow: v } })}
        />
        <TextField
          label="標題"
          value={draft.journey.title}
          onChange={(v) => setDraft({ ...draft, journey: { ...draft.journey, title: v } })}
        />
        {draft.journey.steps.map((step, index) => (
          <div key={index} className="space-y-2 border border-[var(--color-border)] p-3">
            <TextField
              label={"步驟 " + (index + 1) + " 標題"}
              value={step.title}
              onChange={(v) => {
                const steps = [...draft.journey.steps] as typeof draft.journey.steps;
                steps[index] = { ...steps[index], title: v } as JourneyStep;
                setDraft({ ...draft, journey: { ...draft.journey, steps } });
              }}
            />
            <TextField
              label={"步驟 " + (index + 1) + " 描述"}
              value={step.description}
              onChange={(v) => {
                const steps = [...draft.journey.steps] as typeof draft.journey.steps;
                steps[index] = { ...steps[index], description: v } as JourneyStep;
                setDraft({ ...draft, journey: { ...draft.journey, steps } });
              }}
              multiline
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">CCCP 與 TNR 橫幅</legend>
        <TextField
          label="引言"
          value={draft.communityBand.eyebrow}
          onChange={(v) =>
            setDraft({ ...draft, communityBand: { ...draft.communityBand, eyebrow: v } })
          }
        />
        <TextField
          label="標題"
          value={draft.communityBand.title}
          onChange={(v) =>
            setDraft({ ...draft, communityBand: { ...draft.communityBand, title: v } })
          }
        />
        <TextField
          label="描述"
          value={draft.communityBand.description}
          onChange={(v) =>
            setDraft({ ...draft, communityBand: { ...draft.communityBand, description: v } })
          }
          multiline
        />
        <div className="space-y-2 border border-[var(--color-border)] p-3">
          <p className="font-semibold">CCCP 卡片</p>
          <TextField
            label="標題"
            value={draft.communityBand.cccpCard.title}
            onChange={(v) =>
              setDraft({
                ...draft,
                communityBand: {
                  ...draft.communityBand,
                  cccpCard: { ...draft.communityBand.cccpCard, title: v },
                },
              })
            }
          />
          <TextField
            label="描述"
            value={draft.communityBand.cccpCard.description}
            onChange={(v) =>
              setDraft({
                ...draft,
                communityBand: {
                  ...draft.communityBand,
                  cccpCard: { ...draft.communityBand.cccpCard, description: v },
                },
              })
            }
            multiline
          />
        </div>
        <div className="space-y-2 border border-[var(--color-border)] p-3">
          <p className="font-semibold">TNR 卡片</p>
          <TextField
            label="標題"
            value={draft.communityBand.tnrCard.title}
            onChange={(v) =>
              setDraft({
                ...draft,
                communityBand: {
                  ...draft.communityBand,
                  tnrCard: { ...draft.communityBand.tnrCard, title: v },
                },
              })
            }
          />
          <TextField
            label="描述"
            value={draft.communityBand.tnrCard.description}
            onChange={(v) =>
              setDraft({
                ...draft,
                communityBand: {
                  ...draft.communityBand,
                  tnrCard: { ...draft.communityBand.tnrCard, description: v },
                },
              })
            }
            multiline
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">負責任領養</legend>
        <TextField
          label="引言"
          value={draft.responsibleAdoption.eyebrow}
          onChange={(v) =>
            setDraft({
              ...draft,
              responsibleAdoption: { ...draft.responsibleAdoption, eyebrow: v },
            })
          }
        />
        <TextField
          label="標題"
          value={draft.responsibleAdoption.title}
          onChange={(v) =>
            setDraft({ ...draft, responsibleAdoption: { ...draft.responsibleAdoption, title: v } })
          }
        />
        <TextField
          label="內文"
          value={draft.responsibleAdoption.body}
          onChange={(v) =>
            setDraft({ ...draft, responsibleAdoption: { ...draft.responsibleAdoption, body: v } })
          }
          multiline
        />
        <TextField
          label="連結文字"
          value={draft.responsibleAdoption.linkLabel}
          onChange={(v) =>
            setDraft({
              ...draft,
              responsibleAdoption: { ...draft.responsibleAdoption, linkLabel: v },
            })
          }
        />
        <TextField
          label="側欄標題"
          value={draft.responsibleAdoption.sideTitle}
          onChange={(v) =>
            setDraft({
              ...draft,
              responsibleAdoption: { ...draft.responsibleAdoption, sideTitle: v },
            })
          }
        />
        {draft.responsibleAdoption.principles.map((principle, index) => (
          <TextField
            key={index}
            label={"原則 " + (index + 1)}
            value={principle}
            onChange={(v) => {
              const principles = [
                ...draft.responsibleAdoption.principles,
              ] as typeof draft.responsibleAdoption.principles;
              principles[index] = v;
              setDraft({
                ...draft,
                responsibleAdoption: { ...draft.responsibleAdoption, principles },
              });
            }}
            multiline
          />
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">四種參與方式</legend>
        <TextField
          label="引言"
          value={draft.helpPaths.eyebrow}
          onChange={(v) => setDraft({ ...draft, helpPaths: { ...draft.helpPaths, eyebrow: v } })}
        />
        <TextField
          label="標題"
          value={draft.helpPaths.title}
          onChange={(v) => setDraft({ ...draft, helpPaths: { ...draft.helpPaths, title: v } })}
        />
        {draft.helpPaths.items.map((item, index) => (
          <div key={index} className="space-y-2 border border-[var(--color-border)] p-3">
            <TextField
              label={"項目 " + (index + 1) + " 標題"}
              value={item.title}
              onChange={(v) => {
                const items = [...draft.helpPaths.items] as typeof draft.helpPaths.items;
                items[index] = { ...items[index], title: v } as HelpPathItem;
                setDraft({ ...draft, helpPaths: { ...draft.helpPaths, items } });
              }}
            />
            <TextField
              label={"項目 " + (index + 1) + " 描述"}
              value={item.description}
              onChange={(v) => {
                const items = [...draft.helpPaths.items] as typeof draft.helpPaths.items;
                items[index] = { ...items[index], description: v } as HelpPathItem;
                setDraft({ ...draft, helpPaths: { ...draft.helpPaths, items } });
              }}
              multiline
            />
            <TextField
              label={"項目 " + (index + 1) + " 按鈕文字"}
              value={item.label}
              onChange={(v) => {
                const items = [...draft.helpPaths.items] as typeof draft.helpPaths.items;
                items[index] = { ...items[index], label: v } as HelpPathItem;
                setDraft({ ...draft, helpPaths: { ...draft.helpPaths, items } });
              }}
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">結尾</legend>
        <TextField
          label="標題"
          value={draft.closing.title}
          onChange={(v) => setDraft({ ...draft, closing: { ...draft.closing, title: v } })}
        />
        <TextField
          label="描述"
          value={draft.closing.description}
          onChange={(v) => setDraft({ ...draft, closing: { ...draft.closing, description: v } })}
          multiline
        />
        <TextField
          label="按鈕文字"
          value={draft.closing.buttonLabel}
          onChange={(v) => setDraft({ ...draft, closing: { ...draft.closing, buttonLabel: v } })}
        />
      </fieldset>

      <SaveBar isSaving={isSaving} isSaveError={isSaveError} />
    </form>
  );
}

function TnrTabForm({
  content,
  onSave,
  isSaving,
  isSaveError,
}: {
  content: TnrPageContent;
  onSave: (content: TnrPageContent) => void;
  isSaving: boolean;
  isSaveError: boolean;
}) {
  const [draft, setDraft] = useState(content);
  useEffect(() => setDraft(content), [content]);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">主視覺</legend>
        <TextField
          label="引言"
          value={draft.hero.eyebrow}
          onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, eyebrow: v } })}
        />
        <TextField
          label="標題"
          value={draft.hero.title}
          onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, title: v } })}
        />
        <TextField
          label="描述"
          value={draft.hero.description}
          onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, description: v } })}
          multiline
        />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">三個階段</legend>
        {draft.stages.map((stage, index) => (
          <div key={index} className="space-y-2 border border-[var(--color-border)] p-3">
            <TextField
              label={"階段 " + (index + 1) + " 標題"}
              value={stage.title}
              onChange={(v) => {
                const stages = [...draft.stages] as typeof draft.stages;
                stages[index] = { ...stages[index], title: v } as TnrStage;
                setDraft({ ...draft, stages });
              }}
            />
            <TextField
              label={"階段 " + (index + 1) + " 描述"}
              value={stage.description}
              onChange={(v) => {
                const stages = [...draft.stages] as typeof draft.stages;
                stages[index] = { ...stages[index], description: v } as TnrStage;
                setDraft({ ...draft, stages });
              }}
              multiline
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">社區參與</legend>
        <TextField
          label="標題"
          value={draft.chapter.title}
          onChange={(v) => setDraft({ ...draft, chapter: { ...draft.chapter, title: v } })}
        />
        <TextField
          label="描述"
          value={draft.chapter.description}
          onChange={(v) => setDraft({ ...draft, chapter: { ...draft.chapter, description: v } })}
          multiline
        />
        {draft.chapter.bullets.map((bullet, index) => (
          <TextField
            key={index}
            label={"重點 " + (index + 1)}
            value={bullet}
            onChange={(v) => {
              const bullets = [...draft.chapter.bullets] as typeof draft.chapter.bullets;
              bullets[index] = v;
              setDraft({ ...draft, chapter: { ...draft.chapter, bullets } });
            }}
            multiline
          />
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">行動呼籲</legend>
        <TextField
          label="引言"
          value={draft.cta.eyebrow}
          onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, eyebrow: v } })}
        />
        <TextField
          label="標題"
          value={draft.cta.title}
          onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, title: v } })}
        />
        <TextField
          label="描述前綴"
          value={draft.cta.descriptionPrefix}
          onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, descriptionPrefix: v } })}
          multiline
        />
      </fieldset>

      <SaveBar isSaving={isSaving} isSaveError={isSaveError} />
    </form>
  );
}

function CccpTabForm({
  content,
  onSave,
  isSaving,
  isSaveError,
}: {
  content: CccpPageContent;
  onSave: (content: CccpPageContent) => void;
  isSaving: boolean;
  isSaveError: boolean;
}) {
  const [draft, setDraft] = useState(content);
  useEffect(() => setDraft(content), [content]);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">主視覺</legend>
        <TextField
          label="引言"
          value={draft.hero.eyebrow}
          onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, eyebrow: v } })}
        />
        <TextField
          label="標題"
          value={draft.hero.title}
          onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, title: v } })}
        />
        <TextField
          label="描述"
          value={draft.hero.description}
          onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, description: v } })}
          multiline
        />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">兩個章節</legend>
        {draft.chapters.map((chapter, index) => (
          <div key={index} className="space-y-2 border border-[var(--color-border)] p-3">
            <TextField
              label={"章節 " + (index + 1) + " 標題"}
              value={chapter.title}
              onChange={(v) => {
                const chapters = [...draft.chapters] as typeof draft.chapters;
                chapters[index] = { ...chapters[index], title: v } as CccpChapter;
                setDraft({ ...draft, chapters });
              }}
            />
            <TextField
              label={"章節 " + (index + 1) + " 描述"}
              value={chapter.description}
              onChange={(v) => {
                const chapters = [...draft.chapters] as typeof draft.chapters;
                chapters[index] = { ...chapters[index], description: v } as CccpChapter;
                setDraft({ ...draft, chapters });
              }}
              multiline
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">工作方式表格</legend>
        <TextField
          label="表格標題"
          value={draft.workSectionTitle}
          onChange={(v) => setDraft({ ...draft, workSectionTitle: v })}
        />
        {draft.workRows.map((row, index) => (
          <div key={index} className="space-y-2 border border-[var(--color-border)] p-3">
            <TextField
              label={"第 " + (index + 1) + " 行範圍"}
              value={row.scope}
              onChange={(v) => {
                const workRows = [...draft.workRows] as typeof draft.workRows;
                workRows[index] = { ...workRows[index], scope: v } as WorkRow;
                setDraft({ ...draft, workRows });
              }}
            />
            <TextField
              label={"第 " + (index + 1) + " 行方法"}
              value={row.method}
              onChange={(v) => {
                const workRows = [...draft.workRows] as typeof draft.workRows;
                workRows[index] = { ...workRows[index], method: v } as WorkRow;
                setDraft({ ...draft, workRows });
              }}
            />
            <TextField
              label={"第 " + (index + 1) + " 行成果"}
              value={row.result}
              onChange={(v) => {
                const workRows = [...draft.workRows] as typeof draft.workRows;
                workRows[index] = { ...workRows[index], result: v } as WorkRow;
                setDraft({ ...draft, workRows });
              }}
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">行動呼籲</legend>
        <TextField
          label="引言"
          value={draft.cta.eyebrow}
          onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, eyebrow: v } })}
        />
        <TextField
          label="標題"
          value={draft.cta.title}
          onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, title: v } })}
        />
        <TextField
          label="描述"
          value={draft.cta.description}
          onChange={(v) => setDraft({ ...draft, cta: { ...draft.cta, description: v } })}
          multiline
        />
        {draft.cta.points.map((point, index) => (
          <TextField
            key={index}
            label={"要點 " + (index + 1)}
            value={point}
            onChange={(v) => {
              const points = [...draft.cta.points] as typeof draft.cta.points;
              points[index] = v;
              setDraft({ ...draft, cta: { ...draft.cta, points } });
            }}
            multiline
          />
        ))}
      </fieldset>

      <SaveBar isSaving={isSaving} isSaveError={isSaveError} />
    </form>
  );
}
