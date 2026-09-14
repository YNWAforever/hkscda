import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import {
  policySourcePaths,
  type PolicySourcePath,
} from "../../../lib/volunteers/policy/sourcePaths";
import type { PolicyDraft } from "../../../lib/volunteers/policy/schemas";
const labels: Record<string, string> = {
  timezone: "時區",
  schedule: "時間及日期",
  start_time: "開始時間",
  end_time: "結束時間",
  weekdays: "星期",
  location: "地點",
  effective_from: "生效日起",
  effective_until: "生效日止",
  excluded_dates: "除外日期",
  enabled: "開放",
  generation_days: "預先生成日數",
  capacity: "容量",
  volunteers: "義工",
  visitors: "訪客",
  shared_total: "共用總容量",
  group_in_shared_total: "團體計入共用容量",
  group_size: "團體人數",
  role_count_model: "領隊計數方式",
  eligibility: "資格",
  allowed_tiers: "可報級別",
  credentials: "所需技能",
  valid_at: "資格有效時間",
  min_age: "最低年齡",
  missing_credentials_message: "資格不足提示",
  roles: "職務名額",
  tier_quotas: "級別配額",
  daily_limits: "每日配額",
  release_rules: "補位規則",
  booking: "預約規則",
  individual_open: "個人開放",
  individual_close: "個人截止",
  group_open: "團體開放",
  group_close: "團體截止",
  group_freeze: "團體凍結",
  late_group_change: "臨時團體變更",
  scenario: "團體情況",
  scenario_templates: "配對政策",
  auto_approve: "自動批准",
  allow_waitlist: "開放候補",
  waitlist_limit: "候補上限",
  cancellation_close: "取消截止",
  remarks: "備註",
  label: "欄位名稱",
  hint: "提示",
  required: "必填",
  max_length: "字數上限",
  allow_free_text: "自由文字",
  options: "選項",
  terms: "條款",
  version_id: "條款版本",
  reconsent: "重新同意",
};
function lookup(body: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (v, k) =>
        typeof v === "object" && v !== null ? (v as Record<string, unknown>)[k] : undefined,
      body,
    );
}
function describe(value: unknown): string {
  if (value === undefined) return "未設定";
  if (value === null) return "未指定";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return `${value.length} 項`;
  if (typeof value === "object" && value) {
    const v = value as Record<string, unknown>;
    if (v.state === "value") return String(v.value);
    if (v.state === "unlimited") return "無上限";
    if (v.state === "unresolved" || v.state === "inherit") return "待設定";
  }
  return "已設定";
}
export function PolicySourceFields({
  policy,
  onChange,
}: {
  policy: PolicyDraft;
  onChange: (update: (p: PolicyDraft) => void) => void;
}) {
  const queryPolicy = useDebouncedValue(policy, 300);
  const result = useQuery({
    queryKey: ["volunteer-policy-effective", queryPolicy],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      fetchAdminJson<{ body: PolicyDraft; provenance: Record<string, string> }>(
        "/api/admin/volunteers/sources/",
        { method: "POST", signal, body: JSON.stringify({ action: "resolve", body: queryPolicy }) },
      ),
  });
  const origin = (path: string) => {
    const sources = result.data?.provenance ?? {};
    const key = Object.keys(sources)
      .filter((p) => path === p || path.startsWith(p + "."))
      .sort((a, b) => b.length - a.length)[0];
    return (
      (
        { common: "共用", shelter: "場地", template: "此模板", inherited: "繼承來源" } as Record<
          string,
          string
        >
      )[sources[key]] ??
      (policy.inheritance?.some((p) => path === p || path.startsWith(p + "."))
        ? "繼承來源"
        : "此模板")
    );
  };
  const setInherited = (path: PolicySourcePath, inherit: boolean) =>
    onChange((p) => {
      p.inheritance = inherit
        ? [...new Set([...(p.inheritance ?? []), path])]
        : (p.inheritance ?? []).filter((x) => x !== path);
      if (!inherit && result.data) {
        const parts = path.split(".");
        let target = p as unknown as Record<string, unknown>;
        for (const k of parts.slice(0, -1)) target = target[k] as Record<string, unknown>;
        const value = lookup(result.data.body, path);
        if (value !== undefined) target[parts.at(-1)!] = structuredClone(value);
      }
    });
  return (
    <details className="rounded border p-4">
      <summary className="cursor-pointer font-bold">每項設定來源及回復繼承</summary>
      <p className="my-3 text-sm">
        勾選即沿用場地來源，場地引用共用時再向上解析。取消勾選會將目前有效值複製為此模板覆寫；0、無上限及清除覆寫各自獨立。
        <a className="ml-2 underline" href="/admin/volunteers/sources">
          管理共用／場地來源
        </a>
      </p>
      {(queryPolicy !== policy || result.isFetching) && (
        <p role="status" className="text-sm text-muted-foreground">
          正在更新有效設定…
        </p>
      )}
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>設定</th>
              <th>來源</th>
              <th>有效值</th>
              <th>回復繼承</th>
            </tr>
          </thead>
          <tbody>
            {policySourcePaths.map((path) => (
              <tr key={path} className="border-t">
                <td className="py-2">
                  {path
                    .split(".")
                    .map((x) => labels[x] ?? x)
                    .join(" · ")}
                </td>
                <td>{origin(path)}</td>
                <td>{describe(lookup(result.data?.body, path))}</td>
                <td>
                  <input
                    aria-label={`繼承 ${path
                      .split(".")
                      .map((x) => labels[x] ?? x)
                      .join(" ")}`}
                    type="checkbox"
                    disabled={queryPolicy !== policy || result.isFetching || !result.data}
                    checked={policy.inheritance?.includes(path) ?? false}
                    onChange={(e) => setInherited(path, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.error && <p role="alert">部分欄位未完整，請先補齊草稿。</p>}
    </details>
  );
}
