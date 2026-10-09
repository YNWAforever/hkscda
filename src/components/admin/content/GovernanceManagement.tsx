import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { BoardMember, BoardMemberInput } from "../../../lib/governance/types";
import { useAdminCopy } from "../i18n/copy";
import { LoadFailure } from "../LoadFailure";
import { governanceCopy } from "./governanceCopy";
import { draftFromMember, type BoardMemberDraft } from "./governanceDraft";

export type { BoardMemberDraft } from "./governanceDraft";

export const ADMIN_GOVERNANCE_QUERY_KEY = ["admin-governance"] as const;

export function toInput(draft: BoardMemberDraft): BoardMemberInput {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name,
    roleTitle: draft.roleTitle,
    sortOrder: draft.sortOrder,
    effectiveDate: draft.effectiveDate,
  };
}

export function invalidateGovernanceQueries(client: {
  invalidateQueries(input: { queryKey: readonly string[] }): Promise<unknown>;
}) {
  return client.invalidateQueries({ queryKey: ADMIN_GOVERNANCE_QUERY_KEY });
}

export function GovernanceManagement() {
  const copy = useAdminCopy(governanceCopy);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<BoardMemberDraft | null>(null);

  const membersQuery = useQuery({
    queryKey: ADMIN_GOVERNANCE_QUERY_KEY,
    queryFn: () => fetchAdminJson<BoardMember[]>("/api/admin/governance"),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: BoardMemberInput) =>
      fetchAdminJson<{ member: BoardMember }>("/api/admin/governance", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setDraft(null);
      return invalidateGovernanceQueries(queryClient);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      fetchAdminJson<{ ok: true }>("/api/admin/governance", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      }),
    onSuccess: () => invalidateGovernanceQueries(queryClient),
  });

  const members = membersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{copy.title}</h1>
        <button
          type="button"
          className="btn-primary min-h-11 px-4"
          onClick={() => setDraft(draftFromMember())}
        >
          {copy.add}
        </button>
      </div>

      {membersQuery.isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{copy.loading}</p>
      ) : null}
      {membersQuery.isError ? (
        <LoadFailure
          error={membersQuery.error}
          onRetry={() => void membersQuery.refetch()}
          title={copy.loadFailed}
        />
      ) : null}

      {!membersQuery.isLoading && !membersQuery.isError ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">{copy.table.name}</th>
              <th className="py-2">{copy.table.position}</th>
              <th className="py-2">{copy.table.sortOrder}</th>
              <th className="py-2">{copy.table.effectiveDate}</th>
              <th className="py-2">{copy.table.status}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b">
                <td className="py-2">{member.name}</td>
                <td className="py-2">{member.roleTitle}</td>
                <td className="py-2">{member.sortOrder}</td>
                <td className="py-2">{copy.table.date(member.effectiveDate)}</td>
                <td className="py-2">
                  {member.isActive ? copy.table.inOffice : copy.table.steppedDown}
                </td>
                <td className="py-2">
                  <button type="button" onClick={() => setDraft(draftFromMember(member))}>
                    {copy.table.edit}
                  </button>
                  {member.isActive ? (
                    <button
                      type="button"
                      onClick={() => deactivateMutation.mutate(member.id)}
                      disabled={deactivateMutation.isPending}
                    >
                      {copy.table.stepDown}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {deactivateMutation.isError ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {copy.stepDownFailed}
        </p>
      ) : null}

      {draft ? (
        <BoardMemberForm
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={() => upsertMutation.mutate(toInput(draft))}
          onCancel={() => setDraft(null)}
          pending={upsertMutation.isPending}
          failed={upsertMutation.isError}
        />
      ) : null}
    </div>
  );
}

export function BoardMemberForm({
  draft,
  onDraftChange,
  onSubmit,
  onCancel,
  pending,
  failed,
}: {
  draft: BoardMemberDraft;
  onDraftChange: (draft: BoardMemberDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  failed: boolean;
}) {
  const copy = useAdminCopy(governanceCopy).form;
  return (
    <form
      className="space-y-3 border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="block">
        {copy.name}
        <input
          className="mt-1 block w-full border px-3 py-2"
          value={draft.name}
          onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
          required
        />
      </label>
      <label className="block">
        {copy.position}
        <input
          className="mt-1 block w-full border px-3 py-2"
          value={draft.roleTitle}
          onChange={(event) => onDraftChange({ ...draft, roleTitle: event.target.value })}
          required
        />
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
      <label className="block">
        {copy.effectiveDate}
        <input
          type="date"
          className="mt-1 block w-full border px-3 py-2"
          value={draft.effectiveDate}
          onChange={(event) => onDraftChange({ ...draft, effectiveDate: event.target.value })}
          required
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
