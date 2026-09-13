import { useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, MapPin } from "lucide-react";
import type { VolunteerMe } from "../../../lib/volunteers/policy/booking";
import {
  attendanceLabels,
  formatSessionRange,
  registrationSection,
  statusLabels,
  tierLabels,
} from "./centreModel";
export function VolunteerRecords({
  me,
  mode,
  busy,
  onCancel,
  onBrowse,
}: {
  me: VolunteerMe;
  mode: "bookings" | "record";
  busy: boolean;
  onCancel: (id: string) => Promise<void>;
  onBrowse: () => void;
}) {
  const [filter, setFilter] = useState<"upcoming" | "past" | "closed">("upcoming");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const now = new Date();
  const section = mode === "record" ? "past" : filter;
  const entries = me.registrations.filter((r) => registrationSection(r, now) === section);
  return (
    <div className="volunteer-records">
      <div className="volunteer-section-heading">
        <div>
          <p className="eyebrow">每一次到來，都有意義</p>
          <h3>{mode === "record" ? "我的服務紀錄" : "我的預約"}</h3>
        </div>
        <button className="btn-secondary" onClick={onBrowse}>
          預約下一次服務
        </button>
      </div>
      {mode === "record" && (
        <>
          <div className="volunteer-stats">
            <div>
              <CheckCircle2 />
              <strong>{me.history?.verified_sessions ?? "—"}</strong>
              <span>已核實出席場次</span>
            </div>
            <div>
              <Clock3 />
              <strong>{me.profile ? (tierLabels[me.profile.tier] ?? "待確認") : "待核實"}</strong>
              <span>目前義工級別</span>
            </div>
          </div>
          <p className="volunteer-muted">
            {me.history?.history_coverage_start
              ? `完整紀錄由 ${me.history.history_coverage_start} 起計。`
              : "較早歷史尚待核實，未有紀錄不代表零出席。"}{" "}
            預約獲批不代表已出席；出席以職員核實紀錄為準。
          </p>
          <details className="volunteer-detail">
            <summary>已核實課程及技能（{me.history?.credentials.length ?? 0}）</summary>
            {me.history?.credentials.length ? (
              <ul>
                {me.history.credentials.map((c) => (
                  <li key={c.id}>
                    {c.label} ·{" "}
                    {c.revoked ? "已撤銷" : c.currently_valid ? "目前有效" : "未生效或已到期"}
                    {c.valid_until ? ` · 有效至 ${c.valid_until}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p>尚未有已核實課程或技能紀錄。</p>
            )}
          </details>
        </>
      )}
      {mode === "bookings" && (
        <div className="volunteer-segment" aria-label="預約狀態篩選">
          {(
            [
              ["upcoming", "即將參與"],
              ["past", "過往場次"],
              ["closed", "已取消／未獲批准"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} aria-pressed={section === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {!entries.length ? (
        <div className="volunteer-empty">
          <CalendarDays size={32} />
          <h4>{section === "upcoming" ? "暫未有即將參與的預約" : "這裡暫未有紀錄"}</h4>
          <p>
            {section === "upcoming"
              ? "選擇合適的場次，確認後便可在這裡追蹤審核及候補狀態。"
              : "完成服務後，已核實的紀錄會在這裡顯示；如需核對較早資料，請聯絡職員。"}
          </p>
        </div>
      ) : (
        <div className="volunteer-record-list">
          {entries.map((r) => (
            <article key={r.id} className="volunteer-record-card">
              <div className="volunteer-card-top">
                <span className={`volunteer-chip status-${r.status}`}>
                  {statusLabels[r.status] ?? "狀態待確認"}
                </span>
                <span className="volunteer-muted">
                  {attendanceLabels[r.attendance_status] ?? "出席待核實"}
                </span>
              </div>
              <h4>{r.activity?.title ?? "義工活動（詳情待確認）"}</h4>
              <p className="volunteer-card-line">
                <CalendarDays size={17} />
                {formatSessionRange(r.activity?.starts_at, r.activity?.ends_at)}
              </p>
              {r.activity?.location && (
                <p className="volunteer-card-line">
                  <MapPin size={17} />
                  {r.activity.location}
                </p>
              )}
              <p className="volunteer-muted">預約編號：{r.id.slice(0, 8).toUpperCase()}</p>
              {section === "upcoming" &&
                ["approved", "pending", "waitlisted"].includes(r.status) &&
                !["attended", "completed"].includes(r.attendance_status) && (
                  <div className="volunteer-record-actions">
                    {cancelling === r.id ? (
                      <div role="group" aria-label="確認取消預約">
                        <p>確定取消這次預約？名額可能會讓給其他義工。</p>
                        <button
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => setCancelling(null)}
                        >
                          保留預約
                        </button>
                        <button
                          className="btn-primary"
                          disabled={busy}
                          onClick={async () => {
                            await onCancel(r.activity_id);
                            setCancelling(null);
                          }}
                        >
                          確認取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <a className="btn-secondary" href="/volunteer/operations">
                          申請改期
                        </a>
                        <button
                          className="volunteer-text-button"
                          disabled={busy}
                          onClick={() => setCancelling(r.id)}
                        >
                          取消預約
                        </button>
                      </>
                    )}
                  </div>
                )}
            </article>
          ))}
        </div>
      )}
      <p className="volunteer-muted">
        顯示最近 {me.registrations.length}{" "}
        筆預約紀錄。較早紀錄或資料更正請聯絡職員；此頁不會改寫出席歷史。
      </p>
    </div>
  );
}
