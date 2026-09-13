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
const tierLabels: Record<string, string> = {
  newcomer: "新手義工",
  regular: "恆常義工",
  senior: "資深義工",
};
const reasons: Record<string, string> = {
  verified_profile_required: "請先完成義工身份核實。",
  capacity_full: "名額已滿，可按活動政策申請候補。",
  overlap: "你已有重疊時段的報名。",
  terms_required: "請閱讀及同意條款。",
  terms_version_changed: "條款已更新，請重新載入及閱讀。",
  invalid_remarks: "請依活動要求填寫備註。",
  window_closed: "目前不在報名時段內。",
};
async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error ?? body.message ?? reasons[body.reason] ?? "未能提交，請重新檢查報名資格及名額。",
    );
  return body as T;
}
export function PolicySignup() {
  const [sessions, setSessions] = useState<PolicySession[]>([]);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [terms, setTerms] = useState<{ id: string; body: string; published_at: string }[]>([]);
  const [token, setToken] = useState("");
  const [me, setMe] = useState<VolunteerMe | null>(null);
  const [selected, setSelected] = useState("");
  const [role, setRole] = useState("volunteer");
  const [remarks, setRemarks] = useState("");
  const [acceptedVersion, setAcceptedVersion] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState<BookingResult | null>(null);
  const [challenge, setChallenge] = useState("");
  const [challengeReset, setChallengeReset] = useState(0);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const alreadyBooked = me?.registrations.some(
    (r) => r.activity_id === selected && ["pending", "approved", "waitlisted"].includes(r.status),
  );
  const session = sessions.find((entry) => entry.id === selected);
  const sessionTerms =
    terms.find((entry) => entry.id === session?.policy.terms.version_id) ??
    (session?.policy.terms.version_id ? undefined : terms[0]);
  const accepted = acceptedVersion !== null && acceptedVersion === sessionTerms?.id;
  const refreshMe = async () => {
    const response = await fetch(`${endpoint}?view=me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setMe(await readJson<VolunteerMe>(response));
  };
  useEffect(() => {
    let current = true;
    Promise.all([
      fetch(endpoint).then(readJson<{ sessions: PolicySession[] }>),
      fetch(`${endpoint}?view=terms`).then(readJson<{ terms: typeof terms }>),
    ])
      .then(([a, t]) => {
        if (current) {
          setSessions(a.sessions);
          setTerms(t.terms);
        }
      })
      .catch(() => {
        if (current) setError("未能載入已核實義工場次，請重新載入頁面。");
      });
    return () => {
      current = false;
    };
  }, [refreshEpoch]);
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
      Math.max(100, Math.min(30000, ...transitions)),
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
      void client.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? ""));
      const { data } = client.auth.onAuthStateChange((_event, value) =>
        setToken(value?.access_token ?? ""),
      );
      return () => data.subscription.unsubscribe();
    } catch {
      setError("登入服務暫時未能使用。");
    }
  }, []);
  useEffect(() => {
    let current = true;
    setMe(null);
    if (token)
      void fetch(`${endpoint}?view=me`, { headers: { Authorization: `Bearer ${token}` } })
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
  }, [token]);
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
              ? "報名已記錄。"
              : result.kind === "accepted"
                ? "已確認此場次最新條款。"
                : "已提交身份資料，請等待職員核實。",
      );
      await refreshMe();
      setRefreshEpoch((n) => n + 1);
    } finally {
      setChallenge("");
      setChallengeReset((value) => value + 1);
    }
  };
  const changeSelection = (value: string) => {
    setSelected(value);
    const next = sessions.find((entry) => entry.id === value);
    setRole(next?.policy.roles[0]?.key ?? "volunteer");
    setRemarks("");
    setAcceptedVersion(null);
    retry.current = null;
  };
  return (
    <section
      aria-labelledby="verified-signup-title"
      className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
    >
      <h2 id="verified-signup-title" className="text-2xl font-bold">
        已核實義工場次
      </h2>
      <a className="inline-block min-h-11 py-2 underline" href="/volunteer/operations">
        團體申請及我的改期
      </a>
      <p>登入後使用你的已核實義工身份報名。資格及名額依活動當前政策確認。</p>
      {error && (
        <p role="alert" className="text-[var(--color-error)]">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!token ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            電郵
            <input
              className={field}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button
            className={button}
            disabled={busy || !email}
            onClick={() =>
              void run(async () => {
                const { error } = await getSupabaseClient().auth.signInWithOtp({
                  email,
                  options: { emailRedirectTo: window.location.href },
                });
                if (error) throw error;
                setNotice("驗證電郵已發出，請按電郵連結或輸入驗證碼。");
              })
            }
          >
            傳送登入電郵
          </button>
          <label>
            電郵驗證碼
            <input
              className={field}
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button
            className={button}
            disabled={busy || !code || !email}
            onClick={() =>
              void run(async () => {
                const { error } = await getSupabaseClient().auth.verifyOtp({
                  email,
                  token: code,
                  type: "email",
                });
                if (error) throw error;
              })
            }
          >
            驗證並登入
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            className="underline"
            onClick={() =>
              void run(async () => {
                const { error } = await getSupabaseClient().auth.signOut();
                if (error) throw error;
              })
            }
          >
            登出
          </button>
          {!me ? (
            <p>正在確認義工身份…</p>
          ) : !me.profile ? (
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
          ) : (
            <p>
              {me.profile.display_name} · {tierLabels[me.profile.tier] ?? me.profile.tier} ·{" "}
              {me.profile.status === "active" ? "身份已核實" : "等待職員核實或處理，暫未能報名。"}
            </p>
          )}
          {me?.history && (
            <div className="space-y-2">
              <p>
                已記錄及核實出席：{me.history.verified_sessions}場。
                {me.history.history_coverage_start
                  ? `完整紀錄由${me.history.history_coverage_start}起計。`
                  : "較早歷史尚待核實，未有紀錄的月份不視為零出席。"}
              </p>
              <h3 className="font-semibold">我的已核實課程及技能</h3>
              {me.history.credentials.length ? (
                <ul>
                  {me.history.credentials.map((c) => (
                    <li key={c.id}>
                      {c.label} ·{" "}
                      {c.revoked ? "已撤銷" : c.currently_valid ? "目前有效" : "目前未生效或已到期"}
                      {c.valid_until &&
                        ` · 有效至${new Date(c.valid_until).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })}`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>尚未有已核實課程或技能紀錄。</p>
              )}
            </div>
          )}
          <button className="underline" disabled={busy} onClick={() => void run(refreshMe)}>
            重新確認身份及報名
          </button>
        </div>
      )}
      <label className="block">
        選擇場次
        <select
          className={field}
          value={selected}
          onChange={(event) => changeSelection(event.target.value)}
        >
          <option value="">請選擇</option>
          {sessions.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title} ·{" "}
              {new Date(entry.starts_at).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })}
            </option>
          ))}
        </select>
      </label>
      {sessions.length === 0 && <p>目前未有已發布的核實義工場次。</p>}
      {session && (
        <form
          className="space-y-4"
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
            {session.location} · 香港時間 · 總名額 {session.capacity} · 適用級別：
            {session.policy.eligibility.allowed_tiers.map((tier) => tierLabels[tier]).join("、")}
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
                : (reasons[availability.reason ?? ""] ??
                  availability.message ??
                  "目前未符合此場次要求，提交時會再次核實。")}
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
              >
                {sessionTerms.body}
              </div>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  required
                  checked={accepted}
                  onChange={(event) => {
                    setAcceptedVersion(event.target.checked ? (sessionTerms?.id ?? null) : null);
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
              !sessionTerms ||
              (turnstileEnabled && !challenge)
            }
          >
            {alreadyBooked ? "確認此場次最新條款" : "提交報名／候補"}
          </button>
        </form>
      )}
      {token && (
        <TurnstileWidget
          resetKey={challengeReset}
          onVerify={setChallenge}
          onExpire={() => setChallenge("")}
        />
      )}
      {me && me.registrations.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bold">我的報名</h3>
          {me.registrations.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap justify-between gap-2 border-t border-[var(--color-border)] py-2"
            >
              <span>
                {sessions.find((session) => session.id === entry.activity_id)?.title ?? "義工活動"}{" "}
                ·{" "}
                {(
                  {
                    approved: "已確認",
                    pending: "待審核",
                    waitlisted: "候補",
                    cancelled: "已取消",
                    rejected: "未獲批准",
                  } as Record<string, string>
                )[entry.status] ?? entry.status}
              </span>
              {["approved", "pending", "waitlisted"].includes(entry.status) &&
                !["attended", "completed"].includes(entry.attendance_status) && (
                  <button
                    className="underline"
                    disabled={busy || (turnstileEnabled && !challenge)}
                    onClick={() =>
                      void run(() => command({ action: "cancel", activity_id: entry.activity_id }))
                    }
                  >
                    取消報名
                  </button>
                )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
