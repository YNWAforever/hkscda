import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { DirectoryDetail } from "../../../lib/volunteers/directory/types";
import {
  directoryQuery,
  directoryStatuses,
  directoryTiers,
  type DirectorySearch,
} from "./directorySearch";
import { attendanceStatusLabels, registrationStatusLabels } from "./volunteerAdminLogic";
const card =
  "min-w-0 space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5";
const action =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-border)] px-4 py-2 font-medium text-[var(--color-primary)] focus-visible:outline-2";
function date(value: string | null) {
  if (!value) return "未記錄";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium", timeZone: "Asia/Hong_Kong" }).format(
        parsed,
      );
}
function label(labels: Record<string, string>, value: string) {
  return labels[value] || `其他狀態（${value}）`;
}
function AttendanceFact({ fact }: { fact: Record<string, unknown> }) {
  return (
    <span>
      {typeof fact.attendanceStatus === "string"
        ? label(attendanceStatusLabels, fact.attendanceStatus)
        : "未記錄出席狀態"}
      {typeof fact.volunteerHours === "number"
        ? ` · ${fact.volunteerHours} 小時`
        : " · 服務時數未記錄"}
    </span>
  );
}
export function PersonRecords({
  data,
  search,
  initialTab = "identity",
}: {
  data: DirectoryDetail;
  search: DirectorySearch;
  initialTab?: string;
}) {
  const { profile, coverage } = data;
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap gap-3">
        <a className={action} href={`/admin/volunteers/people?${directoryQuery(search)}`}>
          返回名冊
        </a>
        <a
          className={`${action} bg-[var(--color-primary)] text-[var(--color-primary-foreground)]`}
          href={`/admin/volunteers/qualifications?profile_id=${encodeURIComponent(profile.id)}`}
        >
          核實身份與資格
        </a>
      </div>
      <header className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="break-words text-2xl font-semibold">
            {profile.display_name || "未填姓名"}
          </h2>
          <span className="rounded-full bg-[var(--color-muted)] px-3 py-1 text-sm">
            {directoryStatuses[profile.status]}
          </span>
          <span className="text-sm">{directoryTiers[profile.tier]}</span>
        </div>
        <p className="break-all">
          {profile.account_linked ? profile.linked_email || "未提供電郵" : "帳戶未連結"}
        </p>
        <p>
          帳戶電郵：
          {!profile.account_linked
            ? "未連結"
            : profile.email_verified
              ? "電郵已驗證"
              : "電郵未驗證"}{" "}
          · 職員身份核實：
          {profile.verified_at ? `已核實（${date(profile.verified_at)}）` : "待核實"}
        </p>
        <p className="break-all text-xs text-[var(--color-muted-foreground)]">
          身份編號：{profile.id}
        </p>
      </header>
      <aside className="rounded-xl bg-[var(--color-muted)] p-4 text-sm">
        <p className="font-medium">紀錄覆蓋範圍</p>
        <p className="mt-1">
          {coverage.history_coverage_start
            ? `歷史覆蓋起點：${date(coverage.history_coverage_start)}`
            : "未設定歷史覆蓋起點"}
          。只顯示已連結此身份的紀錄；未連結的舊資料不會按姓名推測合併。每類最多顯示{" "}
          {coverage.records_limit} 筆；缺少紀錄不代表沒有服務或資格。
        </p>
      </aside>
      <Tabs defaultValue={initialTab} className="min-w-0">
        <TabsList
          className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4"
          aria-label="個人紀錄分類"
        >
          {[
            ["identity", "身份與資格"],
            ["registrations", "報名"],
            ["attendance", "出席與服務紀錄"],
            ["audit", "核實紀錄"],
          ].map(([value, text]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-h-11 whitespace-normal motion-reduce:transition-none"
            >
              {text}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="identity" className="mt-4 space-y-4">
          <section className={card}>
            <h3 className="text-lg font-semibold">身份資料</h3>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-[var(--color-muted-foreground)]">出生日期</dt>
                <dd>{date(profile.birth_date)}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--color-muted-foreground)]">加入日期</dt>
                <dd>{date(profile.joined_on)}</dd>
              </div>
            </dl>
            <p className="text-sm">
              電郵驗證與職員身份核實分開處理；更改身份及資格請使用核實工作區並提供證據。
            </p>
          </section>
          <section className={card}>
            <h3 className="text-lg font-semibold">資格證據</h3>
            <p className="text-sm">
              顯示 {data.credentials.length} / {coverage.credential_total} 筆
            </p>
            {data.credentials.length === 0 ? (
              <p>沒有已記錄的資格證據。</p>
            ) : (
              <ul className="space-y-4">
                {data.credentials.map((item) => (
                  <li key={item.id} className="border-t border-[var(--color-border)] pt-3">
                    <h4 className="font-semibold">
                      {item.label} {item.revoked_at && "· 已撤銷"}
                    </h4>
                    <p>
                      有效期間：{date(item.valid_from)} 至{" "}
                      {item.valid_until ? date(item.valid_until) : "未設定到期日"}
                    </p>
                    {item.revoked_at && <p>撤銷日期：{date(item.revoked_at)}</p>}
                    <p className="whitespace-pre-wrap break-words">
                      證據：{item.evidence || "未提供"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
        <TabsContent value="registrations" className="mt-4 space-y-4">
          <p>
            顯示 {data.registrations.length} / {coverage.registration_total} 筆報名
          </p>
          {data.registrations.length === 0 ? (
            <p className={card}>尚未有已連結的報名。此義工仍可在名冊中查閱及核實。</p>
          ) : (
            data.registrations.map((item) => (
              <article key={item.id} className={card}>
                <h3 className="font-semibold">{item.title}</h3>
                <p>
                  {date(item.starts_at)} · {label(registrationStatusLabels, item.status)}
                </p>
                <p>
                  出席：{label(attendanceStatusLabels, item.attendance_status)} · 服務時數：
                  {item.volunteer_hours === null ? "未記錄" : `${item.volunteer_hours} 小時`}
                </p>
                <a
                  className={action}
                  href={`/admin/volunteers/registrations/${encodeURIComponent(item.id)}`}
                >
                  查看報名及處理
                </a>
              </article>
            ))
          )}
        </TabsContent>
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <p>
            顯示 {data.attendance_events.length} / {coverage.attendance_event_total}{" "}
            筆出席事實紀錄；時數只取已記錄數值，不由場次長度推算。
          </p>
          {data.attendance_events.length === 0 ? (
            <p className={card}>沒有已連結的出席事實紀錄。不能據此推算服務年資或時數。</p>
          ) : (
            data.attendance_events.map((item) => (
              <article key={item.id} className={card}>
                <h3 className="font-semibold">
                  {item.command === "correct" ? "出席更正" : "出席紀錄"} · {date(item.recorded_at)}
                </h3>
                <p>
                  更改前：
                  <AttendanceFact fact={item.before_fact} />
                </p>
                <p>
                  更改後：
                  <AttendanceFact fact={item.after_fact} />
                </p>
                <p className="whitespace-pre-wrap break-words">
                  原因：{item.reason || "未記錄原因"}
                </p>
                <a
                  className={action}
                  href={`/admin/volunteers/registrations/${encodeURIComponent(item.registration_id)}`}
                >
                  查看相關報名
                </a>
              </article>
            ))
          )}
        </TabsContent>
        <TabsContent value="audit" className="mt-4 space-y-4">
          <p>
            顯示 {data.verification_history.length} / {coverage.verification_event_total} 筆核實紀錄
          </p>
          {data.verification_history.length === 0 ? (
            <p className={card}>沒有已連結的核實紀錄。請以現有身份資料及證據核對。</p>
          ) : (
            data.verification_history.map((item) => (
              <article key={item.id} className={card}>
                <h3 className="font-semibold">{date(item.created_at)}</h3>
                <p>
                  {label(
                    {
                      claim: "帳戶連結",
                      verify: "身份核實",
                      suspend: "身份暫停",
                      credential: "資格授予",
                      revoke: "資格撤銷",
                      update_profile: "身份更新",
                    },
                    item.event_type,
                  )}
                </p>
                <p className="whitespace-pre-wrap break-words">{item.reason || "未記錄原因"}</p>
                <p className="break-all text-xs">處理職員：{item.actor_user_id}</p>
              </article>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
export function VolunteerPersonDetail({
  profileId,
  search,
}: {
  profileId: string;
  search: DirectorySearch;
}) {
  const query = useQuery({
    queryKey: ["volunteer-directory", "person", profileId],
    queryFn: () =>
      fetchAdminJson<DirectoryDetail>(
        `/api/admin/volunteers/people?profile_id=${encodeURIComponent(profileId)}`,
      ),
  });
  if (query.isPending) return <p role="status">正在載入個人紀錄…</p>;
  if (query.isError)
    return (
      <div role="alert" className={card}>
        <p>未能載入個人紀錄。身份可能不存在，或目前未能連線。</p>
        <button className={action} onClick={() => void query.refetch()}>
          重新載入
        </button>
        <a className={action} href={`/admin/volunteers/people?${directoryQuery(search)}`}>
          返回名冊
        </a>
      </div>
    );
  return <PersonRecords data={query.data} search={search} />;
}
