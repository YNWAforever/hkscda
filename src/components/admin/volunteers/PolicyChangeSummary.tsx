import { policyChanges } from "./policyChanges";
const labels: Record<string, string> = {
  name: "名稱",
  template_key: "模板",
  shelter: "場地",
  scenario: "場次類別",
  timezone: "時區",
  schedule: "時段",
  weekdays: "服務星期",
  starts_at: "開始",
  ends_at: "結束",
  start_time: "開始時間",
  end_time: "結束時間",
  capacity: "容量",
  maximum: "上限",
  count_scope: "計數範圍",
  counting_scope: "計數範圍",
  roles: "職務名額",
  tier_quotas: "級別配額",
  daily_limits: "全日限制",
  release_rules: "晚期補位",
  eligibility: "資格要求",
  allowed_tiers: "允許級別",
  minimum_age: "最低年齡",
  credentials: "課程資格",
  booking: "報名窗口",
  windows: "報名窗口",
  reminders: "提醒",
  remarks: "備註",
  source: "來源",
  sources: "來源",
  terms: "條款",
  assessment: "評核",
  state: "設定狀態",
  value: "數值",
  keys: "資格項目",
  mode: "方式",
  group: "團體",
  individual: "個人",
  enabled: "啟用",
  role_count_model: "職務計數方式",
  newcomer: "新手",
  regular: "恆常",
  senior: "資深",
  label: "名稱",
  key: "識別碼",
  minimum: "最低名額",
  minutes: "分鐘",
  days: "日數",
  before: "之前",
  after: "之後",
  cancel: "取消",
  cancellation: "取消",
  booking_windows: "報名窗口",
  slot: "時段",
};
function display(value: unknown): string {
  if (value === undefined || value === null) return "未設定";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.length ? value.map(display).join("；") : "沒有項目";
  if (typeof value === "object")
    return Object.entries(value)
      .map(([k, v]) => `${labels[k] ?? k}：${display(v)}`)
      .join(" · ");
  return labels[String(value)] ?? String(value);
}
export function PolicyChangeSummary({ before, after }: { before: unknown; after: unknown }) {
  const changes = policyChanges(before ?? {}, after);
  return (
    <section className="mt-4 space-y-3" aria-label="政策修改比較">
      <h3 className="font-bold">修改比較 · {changes.length} 項</h3>
      {changes.length === 0 ? (
        <p>與比較版本相同。</p>
      ) : (
        <div className="space-y-2">
          {changes.map((c) => (
            <div
              key={c.path}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <h4 className="mb-2 font-semibold">
                {c.path
                  .split(".")
                  .map((x) => labels[x] ?? x)
                  .join(" / ")}
              </h4>
              <dl className="grid gap-3 md:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-[var(--color-text-muted)]">原設定</dt>
                  <dd className="break-words text-sm">{display(c.before)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-[var(--color-primary)]">此版本</dt>
                  <dd className="break-words text-sm">{display(c.after)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
