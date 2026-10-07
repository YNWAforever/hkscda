import { WorkflowSections } from "./WorkflowSections";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { SourceListing } from "../../../lib/volunteers/policy/sourceService";
const api = <T,>(body: unknown) =>
  fetchAdminJson<T>("/api/admin/volunteers/sources/", {
    method: "POST",
    body: JSON.stringify(body),
  });
const input = "min-h-11 min-w-0 w-full rounded border px-3 py-2";
type Preview = {
  preview_id: string;
  affected_templates: { template_key: string; name: string }[];
  effective_body: { name: string; capacity: { volunteers: { value?: number } } };
};
export function VolunteerPolicySources() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["volunteer-policy-sources"],
    queryFn: () => api<SourceListing>({ action: "list" }),
  });
  const [kind, setKind] = useState<"shelter" | "credential">("shelter"),
    [key, setKey] = useState(""),
    [label, setLabel] = useState(""),
    [timezone, setTimezone] = useState("Asia/Hong_Kong"),
    [location, setLocation] = useState(""),
    [reason, setReason] = useState("");
  const [scope, setScope] = useState("common"),
    [template, setTemplate] = useState(""),
    [publicationReason, setPublicationReason] = useState("");
  const [newRegistryKey, setNewRegistryKey] = useState(() => crypto.randomUUID());
  const [publicationKey, setPublicationKey] = useState(() => crypto.randomUUID());
  const existing = (kind === "shelter" ? q.data?.shelters : q.data?.credentials)?.find(
    (r) => r.key === key,
  );
  const save = useMutation({
    mutationFn: () =>
      api({
        action: "registry_save",
        kind,
        key: key || `${kind}-${newRegistryKey}`,
        label,
        ...(kind === "shelter" ? { timezone, location } : {}),
        expected_revision: existing?.revision ?? 0,
        reason,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["volunteer-policy-sources"] });
      setKey("");
      setNewRegistryKey(crypto.randomUUID());
      setLabel("");
      setReason("");
    },
  });
  const preview = useMutation({
    mutationFn: () =>
      api<Preview>({
        action: "preview_source",
        scope_key: scope,
        template_key: template,
        draft_revision: q.data?.drafts.find((d) => d.template_key === template)?.revision,
        expected_revision: q.data?.sources.find((s) => s.scope_key === scope)?.revision ?? 0,
      }),
  });
  const publish = useMutation({
    mutationFn: () =>
      api({
        action: "publish_source",
        preview_id: preview.data?.preview_id,
        idempotency_key: publicationKey,
        reason: publicationReason,
      }),
    onSuccess: () => {
      preview.reset();
      setPublicationReason("");
      setPublicationKey(crypto.randomUUID());
      void qc.invalidateQueries({ queryKey: ["volunteer-policy-sources"] });
      void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] });
    },
  });
  return (
    <section className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">共用來源、場地及資格</h1>
      <WorkflowSections
        sections={[
          { id: "source-registry", label: "場地與資格" },
          { id: "source-publish", label: "來源發布" },
        ]}
      />
      <p>共用預設 → 場地 → 模板。來源變更只影響之後的政策預覽；已發布場次保留原有完整版本。</p>
      <a className="underline" href="/admin/volunteers/settings">
        返回模板設定
      </a>
      <section className="space-y-3 rounded border p-4">
        <h2 id="source-registry" className="text-lg font-bold">
          管理場地及資格名稱
        </h2>
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="grid min-w-0 gap-1">
            類別
            <select
              aria-label="類別"
              className={input}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as "shelter" | "credential");
                setKey("");
                setLabel("");
              }}
            >
              <option value="shelter">服務場地</option>
              <option value="credential">資格／技能</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            新增或修改
            <select
              aria-label="新增或修改"
              className={input}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                const row = (kind === "shelter" ? q.data?.shelters : q.data?.credentials)?.find(
                  (r) => r.key === e.target.value,
                );
                setLabel(row?.label ?? "");
                if (
                  row &&
                  "timezone" in row &&
                  typeof row.timezone === "string" &&
                  "location" in row &&
                  typeof row.location === "string"
                ) {
                  setTimezone(row.timezone);
                  setLocation(row.location);
                }
              }}
            >
              <option value="">新增</option>
              {(kind === "shelter" ? q.data?.shelters : q.data?.credentials)?.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            顯示名稱
            <input
              required
              maxLength={150}
              className={input}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          {kind === "shelter" && (
            <>
              <label className="grid min-w-0 gap-1">
                時區
                <input
                  required
                  className={input}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
              </label>
              <label className="grid min-w-0 gap-1">
                地點
                <input
                  required
                  maxLength={200}
                  className={input}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>
            </>
          )}
          <label className="grid min-w-0 gap-1">
            更改原因
            <input
              required
              className={input}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={save.isPending} className={input}>
            儲存名稱與資料
          </button>
        </form>
        {save.error && <p role="alert">未能儲存，請核對資料或重新載入版本。</p>}
        {save.isSuccess && <p role="status">已儲存。</p>}
      </section>
      <section className="space-y-3 rounded border p-4">
        <h2 id="source-publish" className="text-lg font-bold">
          發布共用或場地來源
        </h2>
        <p>
          先在模板設定編輯並儲存所需完整規則，再選擇草稿作來源。場地來源可用「回復繼承」引用共用設定；模板可逐項引用場地或共用設定。
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid min-w-0 gap-1">
            來源層
            <select
              aria-label="來源層"
              className={input}
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                preview.reset();
              }}
            >
              <option value="common">共用預設</option>
              {q.data?.shelters.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            使用已儲存草稿
            <select
              aria-label="使用已儲存草稿"
              className={input}
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value);
                preview.reset();
              }}
            >
              <option value="">請選擇</option>
              {q.data?.drafts.map((d) => (
                <option key={d.template_key} value={d.template_key}>
                  {d.name}（草稿 {d.revision}）
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className={input}
          disabled={!template || preview.isPending}
          onClick={() => preview.mutate()}
        >
          預覽來源變更
        </button>
        {preview.error && <p role="alert">草稿未完整或版本已改變，請先返回模板設定核對。</p>}
        {preview.data && (
          <div className="space-y-3 rounded bg-[var(--color-surface-offset)] p-3">
            <p>
              來源：{preview.data.effective_body.name} · 義工容量{" "}
              {preview.data.effective_body.capacity.volunteers.value}
            </p>
            <p>
              引用此來源的模板：
              {preview.data.affected_templates.map((t) => t.name).join("、") || "目前沒有"}
            </p>
            <p>不會直接改動已發布場次；各模板須再預覽及發布才套用。</p>
            <label className="grid min-w-0 gap-1">
              發布原因
              <input
                className={input}
                required
                value={publicationReason}
                onChange={(e) => setPublicationReason(e.target.value)}
              />
            </label>
            <button
              className={input}
              disabled={!publicationReason.trim() || publish.isPending}
              onClick={() => publish.mutate()}
            >
              確認發布來源
            </button>
          </div>
        )}
        {publish.error && <p role="alert">來源已變更或預覽過期，請重新預覽。</p>}
        {publish.isSuccess && <p role="status">來源已發布。</p>}
      </section>
      {q.error && <p role="alert">未能載入設定。</p>}
    </section>
  );
}
