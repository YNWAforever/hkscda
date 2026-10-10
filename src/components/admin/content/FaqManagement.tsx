import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import { buildTesterFaqs } from "../../../lib/faq/answerTester";
import { FAQ_CTA_OPTIONS, faqCtaOptionLabel } from "../../../lib/faq/schemas";
import type { FaqCategory, FaqEntry, FaqEntryInput, FaqLanguage } from "../../../lib/faq/types";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { localizedText } from "../i18n/localizedText";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { requiredReasonDialog } from "../confirmActionState";
import { LoadFailure } from "../LoadFailure";
import { FaqAnswerTester } from "./FaqAnswerTester";
import { faqCopy } from "./faqCopy";
import {
  faqDeactivateRequest,
  sendFaqDeactivate,
  type FaqDeactivateRequest,
} from "./faqDeactivate";
import { FaqSearchGapsReport } from "./FaqSearchGapsReport";

export const ADMIN_FAQ_QUERY_KEY = ["admin-faq"] as const;

const CATEGORIES: readonly FaqCategory[] = [
  "sponsorship",
  "adoption",
  "tax_receipt",
  "donation",
  "contact",
];

export type FaqDraft = {
  id?: string;
  category: FaqCategory;
  questionZh: string;
  questionEn: string;
  answerZh: string;
  answerEn: string;
  keywordsZh: string;
  keywordsEn: string;
  ctaKey: string;
  sensitive: boolean;
  sortOrder: number;
  isActive: boolean;
};

function draftFromEntry(entry?: FaqEntry): FaqDraft {
  return {
    id: entry?.id,
    category: entry?.category ?? "sponsorship",
    questionZh: entry?.question["zh-HK"] ?? "",
    questionEn: entry?.question.en ?? "",
    answerZh: entry?.answer["zh-HK"] ?? "",
    answerEn: entry?.answer.en ?? "",
    keywordsZh: entry?.keywords["zh-HK"].join(", ") ?? "",
    keywordsEn: entry?.keywords.en.join(", ") ?? "",
    ctaKey: entry?.ctaKey ?? "",
    sensitive: entry?.sensitive ?? false,
    sortOrder: entry?.sortOrder ?? 0,
    isActive: entry?.isActive ?? true,
  };
}

export function toInput(draft: FaqDraft): FaqEntryInput {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    category: draft.category,
    questionZh: draft.questionZh,
    questionEn: draft.questionEn,
    answerZh: draft.answerZh,
    answerEn: draft.answerEn,
    keywordsZh: draft.keywordsZh
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    keywordsEn: draft.keywordsEn
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    ctaKey: draft.ctaKey || null,
    sensitive: draft.sensitive,
    sortOrder: draft.sortOrder,
    isActive: draft.isActive,
  };
}

export function invalidateFaqQueries(client: {
  invalidateQueries(input: { queryKey: readonly string[] }): Promise<unknown>;
}) {
  return client.invalidateQueries({ queryKey: ADMIN_FAQ_QUERY_KEY });
}

export function FaqManagement() {
  const common = useAdminCopy(faqCopy);
  const copy = common.list;
  const { language } = useAdminLanguage();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<FaqDraft | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);
  // The draft form renders below the whole FAQ table, so opening it from a button
  // higher up the page would otherwise look like nothing happened. This counts
  // openings so the form is revealed on each one, including a second "add question from this"
  // click on a search-gap row while a draft is already open.
  const [draftOpenings, setDraftOpenings] = useState(0);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  function openDraft(next: FaqDraft) {
    setDraft(next);
    setDraftOpenings((count) => count + 1);
  }

  useEffect(() => {
    const field = firstFieldRef.current;
    if (draftOpenings === 0 || !field) return;
    field.scrollIntoView({ block: "center" });
    field.focus({ preventScroll: true });
  }, [draftOpenings]);

  // Held here, not in the tester, so the search-gap report can fill them in.
  const [testerQuery, setTesterQuery] = useState("");
  const [testerLanguage, setTesterLanguage] = useState<FaqLanguage>("zh-HK");

  const entriesQuery = useQuery({
    queryKey: ADMIN_FAQ_QUERY_KEY,
    queryFn: () => fetchAdminJson<FaqEntry[]>("/api/admin/faq"),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: FaqEntryInput) =>
      fetchAdminJson<{ entry: FaqEntry }>("/api/admin/faq", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setDraft(null);
      return invalidateFaqQueries(queryClient);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (request: FaqDeactivateRequest) => sendFaqDeactivate(request, language),
    onSuccess: () => invalidateFaqQueries(queryClient),
  });

  const entries = entriesQuery.data ?? [];
  const tester = useMemo(
    () => buildTesterFaqs(entriesQuery.data ?? [], draft ? toInput(draft) : null),
    [entriesQuery.data, draft],
  );

  return (
    <div className="space-y-6">
      {/* required-reason: faq.deactivate */}
      <ConfirmActionDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        title={copy.disable}
        consequence={copy.disableConsequence}
        confirmLabel={copy.disable}
        destructive
        reason={requiredReasonDialog}
        onConfirm={async (reason) => {
          const request = faqDeactivateRequest(deactivateTarget, reason);
          if (request) await deactivateMutation.mutateAsync(request);
        }}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{copy.title}</h1>
        <button
          type="button"
          className="btn-primary min-h-11 px-4"
          onClick={() => openDraft(draftFromEntry())}
        >
          {copy.add}
        </button>
      </div>

      {/* Fetches on its own, so it shows whatever state the FAQ list is in. */}
      <FaqSearchGapsReport
        onTest={(topic, language) => {
          setTesterQuery(topic);
          setTesterLanguage(language);
        }}
        onCreate={(topic, language) =>
          openDraft({
            ...draftFromEntry(),
            [language === "en" ? "questionEn" : "questionZh"]: topic,
          })
        }
      />

      {entriesQuery.isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{copy.loading}</p>
      ) : null}
      {entriesQuery.isError ? (
        <LoadFailure
          error={entriesQuery.error}
          onRetry={() => void entriesQuery.refetch()}
          title={copy.loadFailed}
        />
      ) : null}

      {!entriesQuery.isLoading && !entriesQuery.isError ? (
        <FaqAnswerTester
          faqs={tester.faqs}
          draftHidden={tester.draftHidden}
          query={testerQuery}
          language={testerLanguage}
          onQueryChange={setTesterQuery}
          onLanguageChange={setTesterLanguage}
        />
      ) : null}

      {!entriesQuery.isLoading && !entriesQuery.isError ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">{copy.category}</th>
              <th className="py-2">{copy.question}</th>
              <th className="py-2">{copy.sortOrder}</th>
              <th className="py-2">{copy.status}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b">
                <td className="py-2">{common.categories[entry.category]}</td>
                <td className="py-2">
                  {localizedText(entry.question["zh-HK"], entry.question.en, language)}
                </td>
                <td className="py-2">{entry.sortOrder}</td>
                <td className="py-2">{entry.isActive ? copy.shown : copy.disabled}</td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => openDraft(draftFromEntry(entry))}
                    >
                      {copy.edit}
                    </Button>
                    {entry.isActive ? (
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => setDeactivateTarget(entry.id)}
                        disabled={deactivateMutation.isPending}
                      >
                        {copy.disable}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {draft ? (
        <FaqEntryForm
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={() => upsertMutation.mutate(toInput(draft))}
          onCancel={() => setDraft(null)}
          pending={upsertMutation.isPending}
          failed={upsertMutation.isError}
          firstFieldRef={firstFieldRef}
        />
      ) : null}
    </div>
  );
}

export function FaqEntryForm({
  draft,
  onDraftChange,
  onSubmit,
  onCancel,
  pending,
  failed,
  firstFieldRef,
}: {
  draft: FaqDraft;
  onDraftChange: (draft: FaqDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  failed: boolean;
  firstFieldRef?: Ref<HTMLSelectElement>;
}) {
  const common = useAdminCopy(faqCopy);
  const copy = common.form;
  const { language } = useAdminLanguage();
  return (
    <form
      className="space-y-3 border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="block">
        {copy.category}
        <select
          ref={firstFieldRef}
          className="mt-1 block w-full border px-3 py-2"
          value={draft.category}
          onChange={(event) =>
            onDraftChange({ ...draft, category: event.target.value as FaqCategory })
          }
        >
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {common.categories[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        {copy.questionZh}
        <input
          className="mt-1 block w-full border px-3 py-2"
          value={draft.questionZh}
          onChange={(event) => onDraftChange({ ...draft, questionZh: event.target.value })}
          required
        />
      </label>
      <label className="block">
        {copy.questionEn}
        <input
          className="mt-1 block w-full border px-3 py-2"
          value={draft.questionEn}
          onChange={(event) => onDraftChange({ ...draft, questionEn: event.target.value })}
          required
        />
      </label>
      <label className="block">
        {copy.answerZh}
        <textarea
          className="mt-1 block w-full border px-3 py-2"
          value={draft.answerZh}
          onChange={(event) => onDraftChange({ ...draft, answerZh: event.target.value })}
          required
        />
      </label>
      <label className="block">
        {copy.answerEn}
        <textarea
          className="mt-1 block w-full border px-3 py-2"
          value={draft.answerEn}
          onChange={(event) => onDraftChange({ ...draft, answerEn: event.target.value })}
          required
        />
      </label>
      <label className="block">
        {copy.keywordsZh}
        <input
          className="mt-1 block w-full border px-3 py-2"
          value={draft.keywordsZh}
          onChange={(event) => onDraftChange({ ...draft, keywordsZh: event.target.value })}
        />
      </label>
      <label className="block">
        {copy.keywordsEn}
        <input
          className="mt-1 block w-full border px-3 py-2"
          value={draft.keywordsEn}
          onChange={(event) => onDraftChange({ ...draft, keywordsEn: event.target.value })}
        />
      </label>
      <label className="block">
        {copy.cta}
        <select
          className="mt-1 block w-full border px-3 py-2"
          value={draft.ctaKey}
          onChange={(event) => onDraftChange({ ...draft, ctaKey: event.target.value })}
        >
          <option value="">{copy.noCta}</option>
          {FAQ_CTA_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {faqCtaOptionLabel(option, language)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={draft.sensitive}
          onChange={(event) => onDraftChange({ ...draft, sensitive: event.target.checked })}
        />
        {copy.sensitive}
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(event) => onDraftChange({ ...draft, isActive: event.target.checked })}
        />
        {copy.isActive}
      </label>
      <label className="block">
        {copy.sortOrder}
        <input
          type="number"
          className="mt-1 block w-full border px-3 py-2"
          value={draft.sortOrder}
          onChange={(event) => onDraftChange({ ...draft, sortOrder: Number(event.target.value) })}
        />
      </label>
      {failed ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {copy.saveFailed}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button type="submit" className="btn-primary min-h-11 px-4" disabled={pending}>
          {copy.save}
        </button>
        <button type="button" className="btn-secondary min-h-11 px-4" onClick={onCancel}>
          {copy.cancel}
        </button>
      </div>
    </form>
  );
}
