import { volunteerErrorMessage } from "../../../lib/volunteers/apiResult";
import { VerifiedEmailSignIn } from "./VerifiedEmailSignIn";
import { VolunteerSessionBrowser } from "./VolunteerSessionBrowser";
import { VolunteerRecords } from "./VolunteerRecords";
import { tierLabels, formatSessionRange, registrationSection } from "./centreModel";
import { CalendarDays, ClipboardList, HeartHandshake, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  BookingResult,
  PolicySession,
  VolunteerMe,
} from "../../../lib/volunteers/policy/booking";
import { getSupabaseClient } from "../../../lib/supabase";
import { TurnstileWidget, turnstileEnabled } from "../TurnstileWidget";

const endpoint = "/api/volunteer/policy";
const field =
  "block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2";
const button =
  "rounded-md bg-[var(--color-primary)] px-4 py-2 font-semibold text-[var(--color-surface)] disabled:opacity-50";
async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(volunteerErrorMessage(body, response.status));
  return body as T;
}
export function PolicySignup() {
  const [tab, setTab] = useState<"sessions" | "bookings" | "record">("sessions");
  const [sessionError, setSessionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionFilter, setSessionFilter] = useState({
    query: "",
    shelter: "all",
    date: "",
    page: 1,
  });
  const [hasMore, setHasMore] = useState(false);
  const [memberPages, setMemberPages] = useState({ upcoming_page: 1, history_page: 1 });
  const [sessions, setSessions] = useState<PolicySession[]>([]);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const termCache = useRef(new Map<string, { id: string; body: string; published_at: string }>());
  const [terms, setTerms] = useState<{ id: string; body: string; published_at: string }[]>([]);
  const [token, setToken] = useState("");
  const [me, setMe] = useState<VolunteerMe | null>(null);
  const [selected, setSelected] = useState("");
  const [role, setRole] = useState("volunteer");
  const [remarks, setRemarks] = useState("");
  const [acceptedVersion, setAcceptedVersion] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState<BookingResult | null>(null);
  const [challenge, setChallenge] = useState("");
  const [challengeReset, setChallengeReset] = useState(0);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const upcomingCount =
    me?.upcoming_total ??
    me?.registrations.filter((entry) => registrationSection(entry, new Date()) === "upcoming")
      .length ??
    0;
  const alreadyBooked = me?.registrations.some(
    (r) => r.activity_id === selected && ["pending", "approved", "waitlisted"].includes(r.status),
  );
  const session = sessions.find((entry) => entry.id === selected);
  const sessionTerms =
    terms.find((entry) => entry.id === session?.policy.terms.version_id) ??
    (session?.policy.terms.version_id ? undefined : terms[0]);
  const accepted = acceptedVersion !== null && acceptedVersion === sessionTerms?.id;
  const refreshMe = async () => {
    const response = await fetch(
      `${endpoint}?view=me&${new URLSearchParams({ upcoming_page: String(memberPages.upcoming_page), history_page: String(memberPages.history_page) })}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    setMe(await readJson<VolunteerMe>(response));
  };
  useEffect(() => {
    let current = true;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(sessionFilter.page),
      query: sessionFilter.query,
    });
    if (sessionFilter.shelter !== "all") params.set("shelter", sessionFilter.shelter);
    if (sessionFilter.date) params.set("date", sessionFilter.date);
    fetch(`${endpoint}?${params}`)
      .then(readJson<{ sessions: PolicySession[]; has_more: boolean }>)
      .then(async (a) => {
        const termParams = new URLSearchParams({ view: "terms" });
        for (const id of new Set(
          a.sessions.flatMap((row) =>
            row.policy.terms.version_id ? [row.policy.terms.version_id] : [],
          ),
        ))
          termParams.append("id", id);
        const pinnedIds = termParams.getAll("id");
        const needsLatest = a.sessions.some((row) => !row.policy.terms.version_id);
        const cached = pinnedIds.every((id) => termCache.current.has(id));
        const missingParams = new URLSearchParams({ view: "terms" });
        for (const id of pinnedIds) if (!termCache.current.has(id)) missingParams.append("id", id);
        const fetched =
          cached && !needsLatest
            ? []
            : (await fetch(`${endpoint}?${missingParams}`).then(readJson<{ terms: typeof terms }>))
                .terms;
        const t = {
          terms: [
            ...fetched,
            ...pinnedIds.flatMap((id) => {
              const term = termCache.current.get(id);
              return term && !fetched.some((row) => row.id === id) ? [term] : [];
            }),
          ],
        };
        for (const term of t.terms) termCache.current.set(term.id, term);
        if (current) {
          setSessions(a.sessions);
          setHasMore(a.has_more);
          setTerms(t.terms);
          setSessionError("");
          setLoading(false);
        }
      })
      .catch(() => {
        if (current) {
          setLoading(false);
          setSessionError("暫時未能載入場次，請稍後再試。");
        }
      });
    return () => {
      current = false;
    };
  }, [refreshEpoch, sessionFilter]);
  useEffect(() => {
    const transitions = sessions
      .flatMap((s) =>
        s.summary?.next_transition_at
          ? [Date.parse(s.summary.next_transition_at) - Date.now() + 100]
          : [],
      )
      .filter((ms) => ms > 0);
    const timer = window.setTimeout(
      () => setRefreshEpoch((n) => n + 1),
      Math.max(100, Math.min(300000, ...transitions)),
    );
    const refresh = () => setRefreshEpoch((n) => n + 1);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [sessions]);
  useEffect(() => {
    try {
      const client = getSupabaseClient();
      void client.auth
        .getSession()
        .then(({ data }) => {
          setToken(data.session?.access_token ?? "");
          setAuthLoading(false);
        })
        .catch(() => {
          setAuthLoading(false);
          setError("登入服務暫時未能使用，請重新載入。");
        });
      const { data } = client.auth.onAuthStateChange((_event, value) =>
        setToken(value?.access_token ?? ""),
      );
      return () => data.subscription.unsubscribe();
    } catch {
      setAuthLoading(false);
      setError("登入服務暫時未能使用。");
    }
  }, []);
  useEffect(() => {
    let current = true;
    setMe(null);
    if (token)
      void fetch(
        `${endpoint}?view=me&${new URLSearchParams({ upcoming_page: String(memberPages.upcoming_page), history_page: String(memberPages.history_page) })}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
        .then(readJson<VolunteerMe>)
        .then((value) => {
          if (current) setMe(value);
        })
        .catch((error) => {
          if (current) setError(error instanceof Error ? error.message : "未能載入身份");
        });
    return () => {
      current = false;
    };
  }, [token, memberPages]);
  useEffect(() => {
    let current = true;
    setAvailability(null);
    if (token && selected && me?.profile?.status === "active")
      void fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ command: { action: "availability", activity_id: selected, role } }),
      })
        .then(readJson<BookingResult>)
        .then((value) => {
          if (current) setAvailability(value);
        })
        .catch((error) => {
          if (current) setError(error instanceof Error ? error.message : "未能查詢名額");
        });
    return () => {
      current = false;
    };
  }, [token, selected, role, me, refreshEpoch]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (error) {
      setError(error instanceof Error ? error.message : "未能處理，請重試。");
    } finally {
      setBusy(false);
    }
  };
  const command = async (input: Record<string, unknown>) => {
    const fingerprint = JSON.stringify(input);
    if (!retry.current || retry.current.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: crypto.randomUUID() };
    const payload =
      input.action === "claim" ? input : { ...input, idempotency_key: retry.current.key };
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ command: payload, turnstileToken: challenge || undefined }),
      });
      const result = await readJson<BookingResult>(response);
      setNotice(
        result.kind === "cancelled"
          ? "報名已取消。"
          : result.status === "waitlisted"
            ? "已加入候補。"
            : result.kind === "booked"
              ? result.status === "approved"
                ? "預約已確認，可在我的預約查看安排。"
                : "預約已送出，等待職員審核。"
              : result.kind === "accepted"
                ? "已確認此場次最新條款。"
                : "已提交身份資料，請等待職員核實。",
      );
      await refreshMe();
      if (result.kind === "booked" || result.kind === "cancelled") setTab("bookings");
      setRefreshEpoch((n) => n + 1);
    } finally {
      setChallenge("");
      setChallengeReset((value) => value + 1);
    }
  };
  const changeSelection = (value: string) => {
    setSelected(value);
    setTab("sessions");
    window.setTimeout(() => document.getElementById("booking-confirmation")?.focus(), 0);
    const next = sessions.find((entry) => entry.id === value);
    setRole(next?.policy.roles[0]?.key ?? "volunteer");
    setRemarks("");
    setAcceptedVersion(null);
    retry.current = null;
  };
  return (
    <section
      id="volunteer-centre"
      aria-labelledby="verified-signup-title"
      className="volunteer-centre"
    >
      <div className="volunteer-centre-heading">
        <div>
          <p className="eyebrow">YOUR VOLUNTEER SPACE</p>
          <h2 id="verified-signup-title">我的義工中心</h2>
          <p>從第一次登記，到每一次服務，都在這裡。</p>
        </div>
        <span className="volunteer-chip">
          <HeartHandshake size={16} />
          一起照顧牠們
        </span>
      </div>
      {error && (
        <div role="alert" className="volunteer-alert">
          <p>{error}</p>
          <button
            className="volunteer-text-button"
            onClick={() => {
              setError("");
              setRefreshEpoch((n) => n + 1);
              if (token) void run(refreshMe);
            }}
          >
            重新載入
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="volunteer-notice">
          {notice}
        </div>
      )}
      {authLoading ? (
        <p role="status" className="volunteer-empty">
          正在確認登入狀態…
        </p>
      ) : !token ? (
        <div className="volunteer-welcome" id="volunteer-login">
          <div>
            <span className="volunteer-step-label">首次加入／再次回來</span>
            <h3>用一個電郵，開始你的義工旅程。</h3>
            <p>驗證電郵後可登記身份、預約服務及查看紀錄，毋須另設密碼。</p>
            <ol className="volunteer-steps">
              <li>
                <span>1</span>驗證電郵
              </li>
              <li>
                <span>2</span>登記及核實身份
              </li>
              <li>
                <span>3</span>預約服務
              </li>
            </ol>
          </div>
          <VerifiedEmailSignIn />
        </div>
      ) : (
        <div className="volunteer-member">
          <div className="volunteer-member-heading">
            <div>
              <p className="eyebrow">歡迎回來</p>
              <h3>{me?.profile?.display_name ?? "一起開始義工旅程"}</h3>
              <p>
                {me?.profile
                  ? (tierLabels[me.profile.tier] ?? "義工") +
                    " · " +
                    (me.profile.status === "active" ? "身份已核實" : "等待職員核實或處理")
                  : "電郵已驗證 · 義工身份尚待完成"}
              </p>
            </div>
            <button
              className="volunteer-text-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const { error } = await getSupabaseClient().auth.signOut();
                  if (error) throw error;
                  setMe(null);
                  setNotice("");
                  setTab("sessions");
                })
              }
            >
              登出
            </button>
          </div>
          {!me ? (
            <p role="status">正在確認義工身份…</p>
          ) : !me.profile ? (
            <div className="volunteer-onboarding">
              <h3>
                <UserRound size={20} />
                完成首次登記
              </h3>{" "}
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(() =>
                    command({ action: "claim", display_name: name, birth_date: birthDate }),
                  );
                }}
              >
                <p>首次使用請提交義工身份資料，由職員核實後即可報名。</p>
                <label>
                  姓名
                  <input
                    className={field}
                    required
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  出生日期
                  <input
                    className={field}
                    required
                    type="date"
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                  />
                </label>
                <button className={button} disabled={busy || (turnstileEnabled && !challenge)}>
                  提交核實
                </button>
              </form>
            </div>
          ) : me.profile.status !== "active" ? (
            <div className="volunteer-notice">
              <strong>資料已收到，待職員核實</strong>
              <p>你可以先瀏覽場次及查看已有紀錄；身份核實後，符合政策的場次便可預約。</p>
              <button
                className="volunteer-text-button"
                disabled={busy}
                onClick={() => void run(refreshMe)}
              >
                查看最新核實狀態
              </button>
            </div>
          ) : null}
        </div>
      )}
      <nav className="volunteer-nav" aria-label="義工中心功能">
        <button
          aria-current={tab === "sessions" ? "page" : undefined}
          onClick={() => setTab("sessions")}
        >
          <CalendarDays size={20} />
          預約場次
        </button>
        <button
          aria-current={tab === "bookings" ? "page" : undefined}
          onClick={() => setTab("bookings")}
        >
          <ClipboardList size={20} />
          我的預約
          {upcomingCount > 0 ? <span className="volunteer-count">{upcomingCount}</span> : null}
        </button>
        <button
          aria-current={tab === "record" ? "page" : undefined}
          onClick={() => setTab("record")}
        >
          <HeartHandshake size={20} />
          服務紀錄
        </button>
      </nav>
      <div className="volunteer-panel">
        {tab === "sessions" ? (
          <>
            <VolunteerSessionBrowser
              filter={sessionFilter}
              onFilter={(filter) => {
                setSelected("");
                setSessionFilter(filter);
              }}
              hasMore={hasMore}
              sessions={sessions}
              selected={selected}
              onSelect={changeSelection}
              loading={loading}
              error={sessionError}
              onRetry={() => setRefreshEpoch((n) => n + 1)}
            />
            {session && (
              <div className="volunteer-confirmation">
                <h3 id="booking-confirmation" tabIndex={-1}>
                  確認預約 · {session.title}
                </h3>
                {!token && (
                  <p className="volunteer-notice">請先完成上方電郵登入，再確認身份及預約。</p>
                )}{" "}
                <form
                  className="volunteer-booking-form space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (sessionTerms)
                      void run(() =>
                        command({
                          action: alreadyBooked ? "accept_terms" : "book",
                          activity_id: session.id,
                          ...(alreadyBooked ? {} : { role, remarks }),
                          accept_terms: accepted,
                          terms_version_id: sessionTerms.id,
                        }),
                      );
                  }}
                >
                  <p>
                    {formatSessionRange(session.starts_at, session.ends_at)} · 香港時間
                    <br />
                    {session.location} · 總名額 {session.capacity} · 適用級別：
                    {session.policy.eligibility.allowed_tiers
                      .map((tier) => tierLabels[tier])
                      .join("、")}
                  </p>
                  {session.summary && (
                    <div className="space-y-1 rounded bg-muted p-3" aria-live="polite">
                      <p>
                        已確認 {session.summary.confirmed}／{session.capacity} · 尚餘{" "}
                        {session.summary.remaining} · 候補 {session.summary.waitlisted}
                      </p>
                      <p>
                        {session.summary.window_state === "not_yet_open"
                          ? "個人報名尚未開放"
                          : session.summary.window_state === "window_closed"
                            ? "個人報名已截止"
                            : "現於個人報名時間內；仍須核實級別、崗位及配額。"}
                      </p>
                      {session.summary.opens_at && (
                        <p>
                          開放：
                          {new Date(session.summary.opens_at).toLocaleString("zh-HK", {
                            timeZone: session.summary.timezone,
                          })}
                          （{session.summary.timezone}）
                        </p>
                      )}
                      {session.summary.closes_at && (
                        <p>
                          截止：
                          {new Date(session.summary.closes_at).toLocaleString("zh-HK", {
                            timeZone: session.summary.timezone,
                          })}
                          （{session.summary.timezone}）
                        </p>
                      )}
                    </div>
                  )}
                  <p>
                    參與年齡：
                    {typeof session.policy.eligibility.min_age === "number"
                      ? `${session.policy.eligibility.min_age} 歲或以上`
                      : "請先向職員確認"}
                    。
                  </p>
                  {session.policy.roles.length > 0 && (
                    <label className="block">
                      崗位
                      <select
                        className={field}
                        value={role}
                        onChange={(event) => {
                          setRole(event.target.value);
                          retry.current = null;
                        }}
                      >
                        {session.policy.roles.map((entry) => (
                          <option key={entry.key} value={entry.key}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {availability && (
                    <p role="status">
                      {availability.allowed
                        ? "目前可報名"
                        : volunteerErrorMessage(
                            {
                              reason: availability.reason,
                              message: availability.message,
                            },
                            422,
                          )}
                      {typeof availability.remaining === "number"
                        ? ` · 剩餘 ${availability.remaining} 位`
                        : ""}
                    </p>
                  )}
                  <label className="block">
                    {session.policy.remarks.label}
                    {session.policy.remarks.required ? "（必填）" : ""}
                    {session.policy.remarks.allow_free_text ? (
                      <textarea
                        className={field}
                        required={!alreadyBooked && session.policy.remarks.required}
                        maxLength={session.policy.remarks.max_length}
                        value={remarks}
                        onChange={(event) => {
                          setRemarks(event.target.value);
                          retry.current = null;
                        }}
                      />
                    ) : (
                      <select
                        className={field}
                        required={!alreadyBooked && session.policy.remarks.required}
                        value={remarks}
                        onChange={(event) => {
                          setRemarks(event.target.value);
                          retry.current = null;
                        }}
                      >
                        <option value="">請選擇</option>
                        {session.policy.remarks.options.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    )}
                  </label>
                  <p>{session.policy.remarks.hint}</p>
                  {sessionTerms ? (
                    <>
                      <div
                        className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border border-[var(--color-border)] p-3"
                        aria-label="義工條款全文"
                        tabIndex={0}
                      >
                        {sessionTerms.body}
                      </div>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          required
                          checked={accepted}
                          onChange={(event) => {
                            setAcceptedVersion(
                              event.target.checked ? (sessionTerms?.id ?? null) : null,
                            );
                            retry.current = null;
                          }}
                        />
                        我已閱讀並同意以上義工條款
                      </label>
                    </>
                  ) : (
                    <p>條款尚未提供，暫未開放報名。</p>
                  )}
                  <button
                    className={button}
                    disabled={
                      busy ||
                      me?.profile?.status !== "active" ||
                      !accepted ||
                      (!alreadyBooked &&
                        availability?.allowed === false &&
                        availability.waitlist_allowed !== true) ||
                      !sessionTerms ||
                      (turnstileEnabled && !challenge)
                    }
                  >
                    {busy ? "正在確認…" : alreadyBooked ? "確認此場次最新條款" : "確認並提交預約"}
                  </button>
                </form>
              </div>
            )}
          </>
        ) : !token ? (
          <div className="volunteer-empty">
            <UserRound size={32} />
            <h3>登入後，查看屬於你的紀錄</h3>
            <p>你的預約、出席及資格資料只會向已驗證身份顯示。</p>
            <a className="btn-primary" href="#volunteer-login">
              登入／首次登記
            </a>
          </div>
        ) : me ? (
          <VolunteerRecords
            onPage={(bucket, page) =>
              setMemberPages((current) => ({
                ...current,
                [bucket === "upcoming" ? "upcoming_page" : "history_page"]: page,
              }))
            }
            me={me}
            mode={tab}
            busy={busy || (turnstileEnabled && !challenge)}
            onCancel={(id) => run(() => command({ action: "cancel", activity_id: id }))}
            onBrowse={() => setTab("sessions")}
          />
        ) : (
          <p role="status">正在載入你的紀錄…</p>
        )}
        {token && (
          <TurnstileWidget
            resetKey={challengeReset}
            onVerify={setChallenge}
            onExpire={() => setChallenge("")}
          />
        )}
      </div>
      <div className="volunteer-centre-footer">
        <a href="/volunteer/operations">團體申請及改期服務 →</a>
        <a href="/internships">獸醫學生實習申請 →</a>
      </div>
    </section>
  );
}
