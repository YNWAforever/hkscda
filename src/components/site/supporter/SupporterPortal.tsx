import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { signOutCurrentSession } from "../../../lib/supabase";
import { sameBrowserSession } from "../../../lib/supporters/recoverySession";
import type { PortalRecords } from "../../../lib/supporters/portal.server";

function money(cents: number) {
  return new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(cents / 100);
}

export function SupporterRecordSummary({
  records,
  onReceipt,
  onPreference,
  preferenceSaving,
}: {
  records: PortalRecords;
  onReceipt: (receiptId: string) => void;
  onPreference: (status: "opt_in" | "opt_out") => void;
  preferenceSaving: boolean;
}) {
  const empty =
    !records.adoption.length &&
    !records.sponsorship.length &&
    !records.donations.length &&
    !records.receipts.length;
  return (
    <div className="mt-6 space-y-7">
      {empty && (
        <p role="status">
          未找到可安全關聯的紀錄。如曾提交申請或付款，請保留原有狀態連結並聯絡職員協助核對。
        </p>
      )}
      <section aria-labelledby="supporter-adoption">
        <h2 id="supporter-adoption" className="text-xl font-semibold">
          領養申請
        </h2>
        {records.adoption.length ? (
          <ul className="mt-3 space-y-2">
            {records.adoption.map((row) => (
              <li key={row.id} className="rounded-lg border p-3">
                個案建立於 {new Date(row.createdAt).toLocaleDateString("zh-HK")}
                。詳情請使用原有狀態連結。
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">沒有可顯示的領養個案。</p>
        )}
      </section>
      <section aria-labelledby="supporter-sponsor">
        <h2 id="supporter-sponsor" className="text-xl font-semibold">
          助養
        </h2>
        {records.sponsorship.length ? (
          <ul className="mt-3 space-y-2">
            {records.sponsorship.map((row) => (
              <li key={row.id} className="rounded-lg border p-3">
                {new Date(row.createdAt).toLocaleDateString("zh-HK")} · {money(row.amountCents)} ·{" "}
                {row.status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">沒有可顯示的助養紀錄。</p>
        )}
      </section>
      <section aria-labelledby="supporter-donations">
        <h2 id="supporter-donations" className="text-xl font-semibold">
          捐款與收條
        </h2>
        {records.donations.length ? (
          <ul className="mt-3 space-y-2">
            {records.donations.map((row) => (
              <li key={row.id} className="rounded-lg border p-3">
                {new Date(row.createdAt).toLocaleDateString("zh-HK")} · {money(row.amountCents)} ·{" "}
                {row.status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">沒有可顯示的捐款紀錄。</p>
        )}
        {records.receipts.length > 0 && (
          <ul className="mt-3 space-y-2">
            {records.receipts.map((row) => (
              <li key={row.id} className="rounded-lg border p-3">
                收條 {row.receiptNo} · {money(row.totalAmountCents)}
                {row.downloadable ? (
                  <button
                    type="button"
                    className="btn-secondary ml-3 min-h-11"
                    onClick={() => onReceipt(row.id)}
                  >
                    下載收條
                  </button>
                ) : (
                  <span className="ml-3">PDF 準備中，請聯絡職員。</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="supporter-preferences">
        <h2 id="supporter-preferences" className="text-xl font-semibold">
          通訊偏好
        </h2>
        <p className="mt-2">
          推廣電郵：
          {records.marketingEmail === "opt_in"
            ? "已同意"
            : records.marketingEmail === "opt_out"
              ? "已退出"
              : "未確認"}
          。 交易收據及個案通知不受此推廣偏好控制。
        </p>
        <p className="mt-2">不會因登入而自動加入推廣名單。</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {records.marketingEmail !== "opt_in" && (
            <button
              type="button"
              className="btn-secondary min-h-11"
              disabled={preferenceSaving}
              onClick={() => onPreference("opt_in")}
            >
              同意接收推廣電郵
            </button>
          )}
          {records.marketingEmail !== "opt_out" && (
            <button
              type="button"
              className="btn-secondary min-h-11"
              disabled={preferenceSaving}
              onClick={() => onPreference("opt_out")}
            >
              停止接收推廣電郵
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function SupporterPortal({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const currentToken = useRef(accessToken);
  const observedToken = useRef(accessToken);
  if (observedToken.current !== accessToken) {
    observedToken.current = accessToken;
    currentToken.current = accessToken;
  }
  const [loaded, setLoaded] = useState<{ token: string; records: PortalRecords } | null>(null);
  const [error, setError] = useState("");
  const [logoutFailure, setLogoutFailure] = useState<{ token: string; message: string } | null>(
    null,
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const visibleError =
    logoutFailure && sameBrowserSession(logoutFailure.token, accessToken)
      ? logoutFailure.message
      : error;
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const records = loaded?.token === accessToken ? loaded.records : null;

  useEffect(() => {
    currentToken.current = accessToken;
    setPreferenceSaving(false);
    const controller = new AbortController();
    setLoaded(null);
    setError("");
    void fetch("/api/supporter/records", {
      headers: { authorization: "Bearer " + accessToken },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("records");
        const data = (await response.json()) as PortalRecords;
        if (
          !Array.isArray(data.adoption) ||
          !Array.isArray(data.sponsorship) ||
          !Array.isArray(data.donations) ||
          !Array.isArray(data.receipts)
        ) {
          throw new Error("records");
        }
        if (!controller.signal.aborted && currentToken.current === accessToken)
          setLoaded({ token: accessToken, records: data });
      })
      .catch(() => {
        if (!controller.signal.aborted && currentToken.current === accessToken)
          setError("暫時無法載入紀錄，請稍後再試。");
      });
    return () => {
      if (currentToken.current === accessToken) currentToken.current = "";
      controller.abort();
      queryClient.clear();
    };
  }, [accessToken, queryClient]);

  async function downloadReceipt(receiptId: string) {
    setError("");
    try {
      const response = await fetch("/api/supporter/receipts/" + encodeURIComponent(receiptId), {
        headers: { authorization: "Bearer " + accessToken },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("receipt");
      const { url } = (await response.json()) as { url?: string };
      if (!url || currentToken.current !== accessToken) return;
      const target = new URL(url);
      if (target.protocol !== "https:" && target.hostname !== "127.0.0.1") throw new Error("url");
      window.location.assign(target.toString());
    } catch {
      if (currentToken.current === accessToken) {
        setError("收條暫時無法下載，請稍後再試或聯絡職員。");
      }
    }
  }

  async function updatePreference(status: "opt_in" | "opt_out") {
    if (preferenceSaving || !records) return;
    setPreferenceSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supporter/preferences", {
        method: "POST",
        headers: {
          authorization: "Bearer " + accessToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({ marketingEmail: status }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("preference");
      const result = (await response.json()) as { status?: string };
      if (currentToken.current !== accessToken) return;
      if (result.status === "unlinked") {
        setError("未找到可安全關聯的支持者紀錄，請聯絡職員核對通訊偏好。");
        return;
      }
      if (result.status !== status) throw new Error("preference");
      setLoaded((previous) =>
        previous?.token === accessToken
          ? { token: accessToken, records: { ...previous.records, marketingEmail: status } }
          : previous,
      );
    } catch {
      if (currentToken.current === accessToken) {
        setError("暫時無法更新通訊偏好，請稍後再試。");
      }
    } finally {
      if (currentToken.current === accessToken) setPreferenceSaving(false);
    }
  }

  async function signOut() {
    setLogoutFailure(null);
    currentToken.current = "";
    setLoaded(null);
    queryClient.clear();
    try {
      const { error: signOutError } = await signOutCurrentSession(accessToken);
      if (signOutError) throw signOutError;
      if (mounted.current) setLogoutFailure(null);
    } catch {
      if (mounted.current)
        setLogoutFailure({
          token: accessToken,
          message: "暫時未能退出，登入仍然有效。請重試或聯絡職員協助。",
        });
    }
  }

  return (
    <section className="mt-8" aria-busy={!records && !visibleError}>
      <h2 className="text-2xl font-semibold">我的紀錄</h2>
      <button type="button" className="btn-secondary mt-4 min-h-11" onClick={() => void signOut()}>
        退出
      </button>
      {!records && !visibleError && (
        <p role="status" className="mt-4">
          載入中…
        </p>
      )}
      {visibleError && (
        <p role="alert" className="mt-4 text-[var(--color-error)]">
          {visibleError}
        </p>
      )}
      {records && (
        <SupporterRecordSummary
          records={records}
          onReceipt={(id) => void downloadReceipt(id)}
          onPreference={(status) => void updatePreference(status)}
          preferenceSaving={preferenceSaving}
        />
      )}
    </section>
  );
}
