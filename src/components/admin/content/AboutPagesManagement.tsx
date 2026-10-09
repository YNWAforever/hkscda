import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  AboutPageContent,
  AboutPageSlug,
  CccpPageContent,
  TnrPageContent,
} from "../../../lib/aboutPages/types";
import { useAdminCopy } from "../i18n/copy";
import { LoadFailure } from "../LoadFailure";
import { aboutPagesCopy } from "./aboutPagesCopy";

export const ABOUT_PAGES_QUERY_KEY = ["admin-about-pages"] as const;

type PagesData = {
  about: AboutPageContent | null;
  tnr: TnrPageContent | null;
  cccp: CccpPageContent | null;
};

// The server always echoes back content of the same shape it was asked to
// persist for a given pageSlug; declaring that correlation as a discriminated
// union (rather than the looser AnyAboutPageContent) lets a `pageSlug`
// equality check narrow `content` for us, with no cast needed at the call site.
type AboutPagesUpsertResult =
  | { pageSlug: "about"; content: AboutPageContent }
  | { pageSlug: "tnr"; content: TnrPageContent }
  | { pageSlug: "cccp"; content: CccpPageContent };

const TABS: readonly ["about", "tnr"] = ["about", "tnr"];

export function invalidateAboutPagesQueries(client: {
  invalidateQueries(input: { queryKey: readonly string[] }): Promise<unknown>;
}) {
  return client.invalidateQueries({ queryKey: ABOUT_PAGES_QUERY_KEY });
}

export function AboutPagesManagement() {
  return <AboutPagesManagementRuntime />;
}

function AboutPagesManagementRuntime() {
  const copy = useAdminCopy(aboutPagesCopy);
  const [activeTab, setActiveTab] = useState<AboutPageSlug>("about");
  // Drafts are lifted up here (rather than living inside each tab form) so that
  // switching tabs — which unmounts the inactive form — does not discard
  // whatever the admin was mid-typing. Once initialized from the first
  // successful load, a draft is only ever replaced by a successful save of
  // that same page; it must never be silently overwritten by a background
  // refetch or by navigating away from and back to a tab.
  const [drafts, setDrafts] = useState<PagesData | null>(null);
  const queryClient = useQueryClient();

  const pagesQuery = useQuery({
    queryKey: ABOUT_PAGES_QUERY_KEY,
    queryFn: () => fetchAdminJson<PagesData>("/api/admin/about-pages"),
  });

  useEffect(() => {
    if (pagesQuery.data && drafts === null) {
      setDrafts(pagesQuery.data);
    }
  }, [pagesQuery.data, drafts]);

  const upsertMutation = useMutation({
    mutationFn: (input: { pageSlug: AboutPageSlug; content: unknown }) =>
      fetchAdminJson<AboutPagesUpsertResult>("/api/admin/about-pages", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: (result) => {
      // Reset only the page that was just saved to the confirmed-saved value;
      // the other two drafts (and any in-progress edits they hold) are untouched.
      setDrafts((current) => {
        if (!current) return current;
        if (result.pageSlug === "about") return { ...current, about: result.content };
        if (result.pageSlug === "tnr") return { ...current, tnr: result.content };
        return { ...current, cccp: result.content };
      });
      void invalidateAboutPagesQueries(queryClient);
    },
  });

  if (pagesQuery.isLoading) return <p aria-live="polite">{copy.loading}</p>;
  if (pagesQuery.isError || !pagesQuery.data) {
    return (
      <LoadFailure
        error={pagesQuery.error}
        onRetry={() => void pagesQuery.refetch()}
        title={copy.loadFailed}
      />
    );
  }
  if (!drafts) return <p aria-live="polite">{copy.loading}</p>;

  return (
    <AboutPagesManagementView
      activeTab={activeTab}
      onTabChange={setActiveTab}
      drafts={drafts}
      onAboutDraftChange={(content) =>
        setDrafts((current) => (current ? { ...current, about: content } : current))
      }
      onTnrDraftChange={(content) =>
        setDrafts((current) => (current ? { ...current, tnr: content } : current))
      }
      onSave={(pageSlug, content) => upsertMutation.mutate({ pageSlug, content })}
      isSaving={upsertMutation.isPending}
      isSaveError={upsertMutation.isError}
    />
  );
}

export function AboutPagesManagementView({
  activeTab,
  onTabChange,
  drafts,
  onAboutDraftChange,
  onTnrDraftChange,
  onSave,
  isSaving,
  isSaveError,
}: {
  activeTab: AboutPageSlug;
  onTabChange: (tab: AboutPageSlug) => void;
  drafts: PagesData;
  onAboutDraftChange: (content: AboutPageContent) => void;
  onTnrDraftChange: (content: TnrPageContent) => void;
  onSave: (pageSlug: AboutPageSlug, content: unknown) => void;
  isSaving: boolean;
  isSaveError: boolean;
}) {
  const copy = useAdminCopy(aboutPagesCopy);
  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">{copy.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
      </div>

      <div className="flex gap-2 border-b border-[var(--color-border)]" role="tablist">
        {TABS.map((slug) => (
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
            {copy.tabs[slug]}
          </button>
        ))}
      </div>

      {activeTab === "about" && drafts.about ? (
        <AboutTabForm
          draft={drafts.about}
          onDraftChange={onAboutDraftChange}
          onSave={(c) => onSave("about", c)}
          isSaving={isSaving}
          isSaveError={isSaveError}
        />
      ) : null}
      {activeTab === "tnr" && drafts.tnr ? (
        <TnrTabForm
          draft={drafts.tnr}
          onDraftChange={onTnrDraftChange}
          onSave={(c) => onSave("tnr", c)}
          isSaving={isSaving}
          isSaveError={isSaveError}
        />
      ) : null}
    </div>
  );
}

function SaveBar({ isSaving, isSaveError }: { isSaving: boolean; isSaveError: boolean }) {
  const copy = useAdminCopy(aboutPagesCopy);
  return (
    <div className="flex items-center gap-3">
      <button type="submit" className="btn-primary min-h-11 px-4" disabled={isSaving}>
        {copy.save}
      </button>
      {isSaveError ? (
        <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
          {copy.saveFailed}
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
  draft,
  onDraftChange,
  onSave,
  isSaving,
  isSaveError,
}: {
  draft: AboutPageContent;
  onDraftChange: (content: AboutPageContent) => void;
  onSave: (content: AboutPageContent) => void;
  isSaving: boolean;
  isSaveError: boolean;
}) {
  const copy = useAdminCopy(aboutPagesCopy);
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{copy.groups.hero}</legend>
        <TextField
          label={copy.fields.eyebrow}
          value={draft.hero.eyebrow}
          onChange={(v) => onDraftChange({ ...draft, hero: { ...draft.hero, eyebrow: v } })}
        />
        <TextField
          label={copy.fields.title}
          value={draft.hero.title}
          onChange={(v) => onDraftChange({ ...draft, hero: { ...draft.hero, title: v } })}
        />
        <TextField
          label={copy.fields.description}
          value={draft.hero.description}
          onChange={(v) => onDraftChange({ ...draft, hero: { ...draft.hero, description: v } })}
          multiline
        />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{copy.groups.mission}</legend>
        <TextField
          label={copy.fields.eyebrow}
          value={draft.mission.eyebrow}
          onChange={(v) => onDraftChange({ ...draft, mission: { ...draft.mission, eyebrow: v } })}
        />
        <TextField
          label={copy.fields.title}
          value={draft.mission.title}
          onChange={(v) => onDraftChange({ ...draft, mission: { ...draft.mission, title: v } })}
        />
        <TextField
          label={copy.fields.body}
          value={draft.mission.body}
          onChange={(v) => onDraftChange({ ...draft, mission: { ...draft.mission, body: v } })}
          multiline
        />
        <TextField
          label={copy.fields.sideBadge}
          value={draft.mission.sideBadge}
          onChange={(v) => onDraftChange({ ...draft, mission: { ...draft.mission, sideBadge: v } })}
        />
        <TextField
          label={copy.fields.sideBody}
          value={draft.mission.sideBody}
          onChange={(v) => onDraftChange({ ...draft, mission: { ...draft.mission, sideBody: v } })}
          multiline
        />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{copy.groups.impact}</legend>
        <TextField
          label={copy.fields.eyebrow}
          value={draft.impact.eyebrow}
          onChange={(v) => onDraftChange({ ...draft, impact: { ...draft.impact, eyebrow: v } })}
        />
        <TextField
          label={copy.fields.title}
          value={draft.impact.title}
          onChange={(v) => onDraftChange({ ...draft, impact: { ...draft.impact, title: v } })}
        />
        <TextField
          label={copy.fields.description}
          value={draft.impact.description}
          onChange={(v) => onDraftChange({ ...draft, impact: { ...draft.impact, description: v } })}
          multiline
        />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{copy.groups.journey}</legend>
        <TextField
          label={copy.fields.eyebrow}
          value={draft.journey.eyebrow}
          onChange={(v) => onDraftChange({ ...draft, journey: { ...draft.journey, eyebrow: v } })}
        />
        <TextField
          label={copy.fields.title}
          value={draft.journey.title}
          onChange={(v) => onDraftChange({ ...draft, journey: { ...draft.journey, title: v } })}
        />
        {draft.journey.steps.map((step, index) => (
          <div key={index} className="space-y-2 border border-[var(--color-border)] p-3">
            <TextField
              label={copy.numbered.stepTitle(index + 1)}
              value={step.title}
              onChange={(v) => {
                const steps = [...draft.journey.steps] as typeof draft.journey.steps;
                steps[index] = { ...steps[index], title: v };
                onDraftChange({ ...draft, journey: { ...draft.journey, steps } });
              }}
            />
            <TextField
              label={copy.numbered.stepDescription(index + 1)}
              value={step.description}
              onChange={(v) => {
                const steps = [...draft.journey.steps] as typeof draft.journey.steps;
                steps[index] = { ...steps[index], description: v };
                onDraftChange({ ...draft, journey: { ...draft.journey, steps } });
              }}
              multiline
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{copy.groups.communityBand}</legend>
        <TextField
          label={copy.fields.eyebrow}
          value={draft.communityBand.eyebrow}
          onChange={(v) =>
            onDraftChange({ ...draft, communityBand: { ...draft.communityBand, eyebrow: v } })
          }
        />
        <TextField
          label={copy.fields.title}
          value={draft.communityBand.title}
          onChange={(v) =>
            onDraftChange({ ...draft, communityBand: { ...draft.communityBand, title: v } })
          }
        />
        <TextField
          label={copy.fields.description}
          value={draft.communityBand.description}
          onChange={(v) =>
            onDraftChange({ ...draft, communityBand: { ...draft.communityBand, description: v } })
          }
          multiline
        />
        <div className="space-y-2 border border-[var(--color-border)] p-3">
          <p className="font-semibold">{copy.groups.tnrCard}</p>
          <TextField
            label={copy.fields.title}
            value={draft.communityBand.tnrCard.title}
            onChange={(v) =>
              onDraftChange({
                ...draft,
                communityBand: {
                  ...draft.communityBand,
                  tnrCard: { ...draft.communityBand.tnrCard, title: v },
                },
              })
            }
          />
          <TextField
            label={copy.fields.description}
            value={draft.communityBand.tnrCard.description}
            onChange={(v) =>
              onDraftChange({
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
        <legend className="px-1 font-bold">{copy.groups.responsibleAdoption}</legend>
        <TextField
          label={copy.fields.eyebrow}
          value={draft.responsibleAdoption.eyebrow}
          onChange={(v) =>
            onDraftChange({
              ...draft,
              responsibleAdoption: { ...draft.responsibleAdoption, eyebrow: v },
            })
          }
        />
        <TextField
          label={copy.fields.title}
          value={draft.responsibleAdoption.title}
          onChange={(v) =>
            onDraftChange({
              ...draft,
              responsibleAdoption: { ...draft.responsibleAdoption, title: v },
            })
          }
        />
        <TextField
          label={copy.fields.body}
          value={draft.responsibleAdoption.body}
          onChange={(v) =>
            onDraftChange({
              ...draft,
              responsibleAdoption: { ...draft.responsibleAdoption, body: v },
            })
          }
          multiline
        />
        <TextField
          label={copy.fields.linkLabel}
          value={draft.responsibleAdoption.linkLabel}
          onChange={(v) =>
            onDraftChange({
              ...draft,
              responsibleAdoption: { ...draft.responsibleAdoption, linkLabel: v },
            })
          }
        />
        <TextField
          label={copy.fields.sideTitle}
          value={draft.responsibleAdoption.sideTitle}
          onChange={(v) =>
            onDraftChange({
              ...draft,
              responsibleAdoption: { ...draft.responsibleAdoption, sideTitle: v },
            })
          }
        />
        {draft.responsibleAdoption.principles.map((principle, index) => (
          <TextField
            key={index}
            label={copy.numbered.principle(index + 1)}
            value={principle}
            onChange={(v) => {
              const principles = [
                ...draft.responsibleAdoption.principles,
              ] as typeof draft.responsibleAdoption.principles;
              principles[index] = v;
              onDraftChange({
                ...draft,
                responsibleAdoption: { ...draft.responsibleAdoption, principles },
              });
            }}
            multiline
          />
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{copy.groups.helpPaths}</legend>
        <TextField
          label={copy.fields.eyebrow}
          value={draft.helpPaths.eyebrow}
          onChange={(v) =>
            onDraftChange({ ...draft, helpPaths: { ...draft.helpPaths, eyebrow: v } })
          }
        />
        <TextField
          label={copy.fields.title}
          value={draft.helpPaths.title}
          onChange={(v) => onDraftChange({ ...draft, helpPaths: { ...draft.helpPaths, title: v } })}
        />
        {draft.helpPaths.items.map((item, index) => (
          <div key={index} className="space-y-2 border border-[var(--color-border)] p-3">
            <TextField
              label={copy.numbered.itemTitle(index + 1)}
              value={item.title}
              onChange={(v) => {
                const items = [...draft.helpPaths.items] as typeof draft.helpPaths.items;
                items[index] = { ...items[index], title: v };
                onDraftChange({ ...draft, helpPaths: { ...draft.helpPaths, items } });
              }}
            />
            <TextField
              label={copy.numbered.itemDescription(index + 1)}
              value={item.description}
              onChange={(v) => {
                const items = [...draft.helpPaths.items] as typeof draft.helpPaths.items;
                items[index] = { ...items[index], description: v };
                onDraftChange({ ...draft, helpPaths: { ...draft.helpPaths, items } });
              }}
              multiline
            />
            <TextField
              label={copy.numbered.itemButton(index + 1)}
              value={item.label}
              onChange={(v) => {
                const items = [...draft.helpPaths.items] as typeof draft.helpPaths.items;
                items[index] = { ...items[index], label: v };
                onDraftChange({ ...draft, helpPaths: { ...draft.helpPaths, items } });
              }}
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{copy.groups.closing}</legend>
        <TextField
          label={copy.fields.title}
          value={draft.closing.title}
          onChange={(v) => onDraftChange({ ...draft, closing: { ...draft.closing, title: v } })}
        />
        <TextField
          label={copy.fields.description}
          value={draft.closing.description}
          onChange={(v) =>
            onDraftChange({ ...draft, closing: { ...draft.closing, description: v } })
          }
          multiline
        />
        <TextField
          label={copy.fields.buttonLabel}
          value={draft.closing.buttonLabel}
          onChange={(v) =>
            onDraftChange({ ...draft, closing: { ...draft.closing, buttonLabel: v } })
          }
        />
      </fieldset>

      <SaveBar isSaving={isSaving} isSaveError={isSaveError} />
    </form>
  );
}

function TnrTabForm({
  draft,
  onDraftChange,
  onSave,
  isSaving,
  isSaveError,
}: {
  draft: TnrPageContent;
  onDraftChange: (content: TnrPageContent) => void;
  onSave: (content: TnrPageContent) => void;
  isSaving: boolean;
  isSaveError: boolean;
}) {
  const copy = useAdminCopy(aboutPagesCopy);
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{copy.groups.hero}</legend>
        <TextField
          label={copy.fields.eyebrow}
          value={draft.hero.eyebrow}
          onChange={(v) => onDraftChange({ ...draft, hero: { ...draft.hero, eyebrow: v } })}
        />
        <TextField
          label={copy.fields.title}
          value={draft.hero.title}
          onChange={(v) => onDraftChange({ ...draft, hero: { ...draft.hero, title: v } })}
        />
        <TextField
          label={copy.fields.description}
          value={draft.hero.description}
          onChange={(v) => onDraftChange({ ...draft, hero: { ...draft.hero, description: v } })}
          multiline
        />
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{copy.groups.stages}</legend>
        {draft.stages.map((stage, index) => (
          <div key={index} className="space-y-2 border border-[var(--color-border)] p-3">
            <TextField
              label={copy.numbered.stageTitle(index + 1)}
              value={stage.title}
              onChange={(v) => {
                const stages = [...draft.stages] as typeof draft.stages;
                stages[index] = { ...stages[index], title: v };
                onDraftChange({ ...draft, stages });
              }}
            />
            <TextField
              label={copy.numbered.stageDescription(index + 1)}
              value={stage.description}
              onChange={(v) => {
                const stages = [...draft.stages] as typeof draft.stages;
                stages[index] = { ...stages[index], description: v };
                onDraftChange({ ...draft, stages });
              }}
              multiline
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{copy.groups.chapter}</legend>
        <TextField
          label={copy.fields.title}
          value={draft.chapter.title}
          onChange={(v) => onDraftChange({ ...draft, chapter: { ...draft.chapter, title: v } })}
        />
        <TextField
          label={copy.fields.description}
          value={draft.chapter.description}
          onChange={(v) =>
            onDraftChange({ ...draft, chapter: { ...draft.chapter, description: v } })
          }
          multiline
        />
        {draft.chapter.bullets.map((bullet, index) => (
          <TextField
            key={index}
            label={copy.numbered.bullet(index + 1)}
            value={bullet}
            onChange={(v) => {
              const bullets = [...draft.chapter.bullets] as typeof draft.chapter.bullets;
              bullets[index] = v;
              onDraftChange({ ...draft, chapter: { ...draft.chapter, bullets } });
            }}
            multiline
          />
        ))}
      </fieldset>

      <fieldset className="space-y-3 border border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{copy.groups.cta}</legend>
        <TextField
          label={copy.fields.eyebrow}
          value={draft.cta.eyebrow}
          onChange={(v) => onDraftChange({ ...draft, cta: { ...draft.cta, eyebrow: v } })}
        />
        <TextField
          label={copy.fields.title}
          value={draft.cta.title}
          onChange={(v) => onDraftChange({ ...draft, cta: { ...draft.cta, title: v } })}
        />
        <TextField
          label={copy.fields.descriptionPrefix}
          value={draft.cta.descriptionPrefix}
          onChange={(v) => onDraftChange({ ...draft, cta: { ...draft.cta, descriptionPrefix: v } })}
          multiline
        />
      </fieldset>

      <SaveBar isSaving={isSaving} isSaveError={isSaveError} />
    </form>
  );
}
