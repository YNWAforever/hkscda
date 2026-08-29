import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { BoardMember, BoardMemberInput } from "../../../lib/governance/types";

export const ADMIN_GOVERNANCE_QUERY_KEY = ["admin-governance"] as const;

type BoardMemberDraft = {
  id?: string;
  name: string;
  roleTitle: string;
  sortOrder: number;
  effectiveDate: string;
};

function draftFromMember(member?: BoardMember): BoardMemberDraft {
  return {
    id: member?.id,
    name: member?.name ?? "",
    roleTitle: member?.roleTitle ?? "",
    sortOrder: member?.sortOrder ?? 0,
    effectiveDate: member?.effectiveDate ?? new Date().toISOString().slice(0, 10),
  };
}

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
        <h1 className="text-xl font-bold">團隊與管治</h1>
        <button
          type="button"
          className="btn-primary min-h-11 px-4"
          onClick={() => setDraft(draftFromMember())}
        >
          新增成員
        </button>
      </div>

      {membersQuery.isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">載入中…</p>
      ) : null}
      {membersQuery.isError ? (
        <p role="alert" className="text-sm text-red-600">
          未能載入團隊名單，請重新整理頁面。
        </p>
      ) : null}

      {!membersQuery.isLoading && !membersQuery.isError ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">姓名</th>
              <th className="py-2">職銜</th>
              <th className="py-2">排序</th>
              <th className="py-2">生效日期</th>
              <th className="py-2">狀態</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b">
                <td className="py-2">{member.name}</td>
                <td className="py-2">{member.roleTitle}</td>
                <td className="py-2">{member.sortOrder}</td>
                <td className="py-2">{member.effectiveDate}</td>
                <td className="py-2">{member.isActive ? "在任" : "已卸任"}</td>
                <td className="py-2">
                  <button type="button" onClick={() => setDraft(draftFromMember(member))}>
                    編輯
                  </button>
                  {member.isActive ? (
                    <button
                      type="button"
                      onClick={() => deactivateMutation.mutate(member.id)}
                      disabled={deactivateMutation.isPending}
                    >
                      卸任
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {deactivateMutation.isError ? (
        <p role="alert" className="text-sm text-red-600">
          卸任操作失敗，請再試一次。
        </p>
      ) : null}

      {draft ? (
        <form
          className="space-y-3 border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            upsertMutation.mutate(toInput(draft));
          }}
        >
          <label className="block">
            姓名
            <input
              className="mt-1 block w-full border px-3 py-2"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
            />
          </label>
          <label className="block">
            職銜
            <input
              className="mt-1 block w-full border px-3 py-2"
              value={draft.roleTitle}
              onChange={(event) => setDraft({ ...draft, roleTitle: event.target.value })}
              required
            />
          </label>
          <label className="block">
            排序
            <input
              type="number"
              className="mt-1 block w-full border px-3 py-2"
              value={draft.sortOrder}
              onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })}
            />
          </label>
          <label className="block">
            生效日期
            <input
              type="date"
              className="mt-1 block w-full border px-3 py-2"
              value={draft.effectiveDate}
              onChange={(event) => setDraft({ ...draft, effectiveDate: event.target.value })}
              required
            />
          </label>
          {upsertMutation.isError ? (
            <p role="alert" className="text-sm text-red-600">
              儲存失敗，請檢查資料後再試一次。
            </p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="submit"
              className="btn-primary min-h-11 px-4"
              disabled={upsertMutation.isPending}
            >
              儲存
            </button>
            <button
              type="button"
              className="btn-secondary min-h-11 px-4"
              onClick={() => setDraft(null)}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
