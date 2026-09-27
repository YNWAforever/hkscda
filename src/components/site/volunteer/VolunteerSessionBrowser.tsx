import { useEffect, useState } from "react";
import { CalendarDays, MapPin, ArrowRight, Search } from "lucide-react";
import type { PolicySession } from "../../../lib/volunteers/policy/booking";
import { formatSessionRange, shelterLabel } from "./centreModel";
export function VolunteerSessionBrowser({
  sessions,
  filter,
  onFilter,
  hasMore,
  selected,
  onSelect,
  loading,
  error,
  onRetry,
}: {
  sessions: PolicySession[];
  filter?: { query: string; shelter: string; date: string; page: number };
  onFilter?: (value: { query: string; shelter: string; date: string; page: number }) => void;
  hasMore?: boolean;
  selected: string;
  onSelect: (id: string) => void;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [shelter, setShelter] = useState("all");
  const [date, setDate] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (
        onFilter &&
        (filter?.query !== query || filter?.shelter !== shelter || filter?.date !== date)
      )
        onFilter({ query, shelter, date, page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, shelter, date, filter, onFilter]);
  const visible = sessions;
  const filtered = Boolean(
    filter?.query.trim() || (filter?.shelter && filter.shelter !== "all") || filter?.date,
  );
  const clearFilters = () => {
    setQuery("");
    setShelter("all");
    setDate("");
    onFilter?.({ query: "", shelter: "all", date: "", page: 1 });
  };
  const shelters = [
    ...new Set([
      "cat",
      "dog",
      "adoption",
      ...sessions.flatMap((s) => (s.shelter ? [s.shelter] : [])),
    ]),
  ];
  return (
    <div className="volunteer-session-browser">
      <div className="volunteer-section-heading">
        <div>
          <p className="eyebrow">一起為牠們出一分力</p>
          <h3>尋找合適的服務時段</h3>
        </div>
        <span className="volunteer-chip">香港時間</span>
      </div>
      <div className="volunteer-filters">
        <label>
          <span>
            <Search size={16} />
            搜尋場次
          </span>
          <input
            type="search"
            placeholder="活動名稱或地點"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span>服務地點</span>
          <select value={shelter} onChange={(e) => setShelter(e.target.value)}>
            <option value="all">所有貓狗舍</option>
            {shelters.map((s) => (
              <option key={s} value={s}>
                {shelterLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>服務日期</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {error ? (
        <div role="alert" className="volunteer-empty">
          <h4>{error}</h4>
          <p>這不代表沒有服務機會；你的已有預約仍可在「我的預約」查看。</p>
          <button className="btn-secondary" onClick={onRetry}>
            重新載入場次
          </button>
        </div>
      ) : loading ? (
        <p role="status" className="volunteer-empty">
          正在載入服務場次…
        </p>
      ) : !sessions.length ? (
        <div className="volunteer-empty">
          <CalendarDays size={32} />
          {filtered ? (
            <>
              <h4>沒有符合篩選條件的場次</h4>
              <p>請調整搜尋條件；這不代表所有服務場次都已額滿或停辦。</p>
              <button type="button" className="btn-secondary" onClick={clearFilters}>
                清除篩選
              </button>
            </>
          ) : (
            <>
              <h4>目前沒有已發布的服務場次</h4>
              <p>
                目前未有已發布的核實義工場次。你可先登入及完成身份登記；場次須由職員核准發布後才可預約。
              </p>
              <a className="btn-secondary" href="mailto:info@hkscda.com">
                聯絡義工團隊
              </a>
              <button type="button" className="btn-secondary" onClick={onRetry}>
                重新查看場次
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="volunteer-muted">
            本頁顯示 {visible.length} 個場次 · 名額與資格會在確認時再次核實
          </p>
          {!visible.length ? (
            <div className="volunteer-empty">
              <p>沒有符合篩選條件的場次。</p>
              <button
                className="btn-secondary"
                onClick={() => {
                  setQuery("");
                  setShelter("all");
                  setDate("");
                }}
              >
                清除篩選
              </button>
            </div>
          ) : (
            <div className="volunteer-session-grid">
              {visible.map((s) => (
                <button
                  type="button"
                  className={`volunteer-session-card ${selected === s.id ? "is-selected" : ""}`}
                  key={s.id}
                  data-session-id={s.id}
                  aria-pressed={selected === s.id}
                  onClick={() => onSelect(s.id)}
                >
                  <span className="volunteer-card-top">
                    <span className="volunteer-chip">
                      {s.shelter ? shelterLabel(s.shelter) : "義工服務"}
                    </span>
                    <span className="volunteer-muted">
                      {s.summary?.window_state === "not_yet_open"
                        ? "尚未開放"
                        : s.summary?.window_state === "window_closed"
                          ? "報名截止"
                          : s.summary && s.summary.remaining === 0
                            ? "名額已滿"
                            : "查看報名詳情"}
                    </span>
                  </span>
                  <h4>{s.title}</h4>
                  <span className="volunteer-card-line">
                    <CalendarDays size={17} />
                    {formatSessionRange(s.starts_at, s.ends_at)}
                  </span>
                  <span className="volunteer-card-line">
                    <MapPin size={17} />
                    {s.location || "地點待公布"}
                  </span>
                  <span className="volunteer-card-footer">
                    <span>
                      {s.summary
                        ? `尚餘 ${s.summary.remaining} 位 · 候補 ${s.summary.waitlisted} 人`
                        : `總名額 ${s.capacity} 位`}
                    </span>
                    <ArrowRight size={20} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {onFilter && filter && (
        <nav aria-label="場次分頁" className="flex gap-3 items-center">
          <button
            className="btn-secondary"
            disabled={loading || filter.page === 1}
            onClick={() => onFilter({ ...filter, page: filter.page - 1 })}
          >
            上一頁
          </button>
          <span>第 {filter.page} 頁</span>
          <button
            className="btn-secondary"
            disabled={loading || !hasMore}
            onClick={() => onFilter({ ...filter, page: filter.page + 1 })}
          >
            下一頁
          </button>
        </nav>
      )}
    </div>
  );
}
