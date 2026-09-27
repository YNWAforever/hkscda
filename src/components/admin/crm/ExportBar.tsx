import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../ui/button";
import { useAdminPageCopy } from "../adminPageCopy";
import { getAdminAccessToken } from "./api";
import { classifyExportFailure, type ExportLanguage } from "./exportFailure";

type ExportBarProps = { search: URLSearchParams };
type ExportKind = "supporters" | "donations";
export type ExportState =
  | { phase: "idle" }
  | { phase: "exporting"; kind: ExportKind; snapshot: string }
  | { phase: "error"; kind: ExportKind; snapshot: string; message: string; overLimit?: boolean }
  | { phase: "success"; kind: ExportKind };
type BackgroundState =
  | { phase: "idle" | "creating" }
  | {
      phase: "pending" | "processing" | "ready";
      id: string;
      kind: ExportKind;
      total: number;
      processed: number;
    }
  | { phase: "error"; message: string };
const savedJobKey = "hkscda-crm-export-job";
function saveBackgroundJob(job: { id: string; kind: ExportKind; total: number }) {
  try {
    sessionStorage.setItem(savedJobKey, JSON.stringify(job));
  } catch {
    // An unavailable session store must not block export.
  }
}
function clearBackgroundJob() {
  try {
    sessionStorage.removeItem(savedJobKey);
  } catch {
    // The server still enforces job ownership and expiry.
  }
}
function restoreBackgroundJob(): BackgroundState | null {
  try {
    const raw = sessionStorage.getItem(savedJobKey);
    if (!raw) return null;
    const job = JSON.parse(raw) as { id?: unknown; kind?: unknown; total?: unknown };
    if (
      typeof job.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(job.id) ||
      (job.kind !== "supporters" && job.kind !== "donations") ||
      typeof job.total !== "number" ||
      !Number.isInteger(job.total) ||
      job.total < 0 ||
      job.total > 20000
    )
      return null;
    return { phase: "pending", id: job.id, kind: job.kind, total: job.total, processed: 0 };
  } catch {
    return null;
  }
}
type ExportCopy = {
  supportersCsv: string;
  donationsCsv: string;
  exporting: string;
  retry: string;
  downloaded: string;
  backgroundExport: string;
};

class CsvExportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function downloadCsv(path: string, filename: string, language: ExportLanguage) {
  const token = await getAdminAccessToken();
  const response = await fetch(path, {
    headers: { authorization: "Bearer " + token },
  });
  if (!response.ok)
    throw new CsvExportError(await classifyExportFailure(response, language), response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function ExportBarView({
  copy,
  state,
  onExport,
  onRetry,
  onBackground,
}: {
  copy: ExportCopy;
  state: ExportState;
  onExport(kind: ExportKind): void;
  onRetry(): void;
  onBackground?: () => void;
}) {
  const pending = state.phase === "exporting";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(["supporters", "donations"] as const).map((kind) => (
          <Button
            key={kind}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            aria-busy={pending && state.kind === kind}
            onClick={() => onExport(kind)}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {pending && state.kind === kind
              ? copy.exporting
              : kind === "supporters"
                ? copy.supportersCsv
                : copy.donationsCsv}
          </Button>
        ))}
      </div>
      {pending ? (
        <p role="status" aria-live="polite">
          {copy.exporting}
        </p>
      ) : null}
      {state.phase === "success" ? (
        <p role="status" aria-live="polite">
          {copy.downloaded}
        </p>
      ) : null}
      {state.phase === "error" ? (
        <div role="alert" className="space-y-2 text-sm text-[var(--color-error)]">
          <p>{state.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {copy.retry}
            </Button>
            {state.overLimit && onBackground ? (
              <Button type="button" variant="outline" size="sm" onClick={onBackground}>
                {copy.backgroundExport}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ExportBar({ search }: ExportBarProps) {
  const { language, pageCopy } = useAdminPageCopy();
  const [state, setState] = useState<ExportState>({ phase: "idle" });
  const inFlight = useRef(false);
  const [background, setBackground] = useState<BackgroundState>({ phase: "idle" });
  const polling = useRef(false);
  useEffect(() => {
    const saved = restoreBackgroundJob();
    if (saved) setBackground(saved);
  }, []);
  const backgroundId = "id" in background ? background.id : null;
  useEffect(() => {
    if (!backgroundId || (background.phase !== "pending" && background.phase !== "processing"))
      return;
    let active = true;
    const id = backgroundId;
    const timer = window.setInterval(async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const token = await getAdminAccessToken();
        const response = await fetch("/api/admin/exports/jobs/" + id, {
          headers: { authorization: "Bearer " + token },
        });
        if (!response.ok)
          throw new CsvExportError(
            await classifyExportFailure(response, language),
            response.status,
          );
        const job = (await response.json()) as {
          status: BackgroundState["phase"];
          kind: ExportKind;
          total: number;
          processed: number;
        };
        if (!active) return;
        if (job.status === "pending" || job.status === "processing" || job.status === "ready")
          setBackground({
            phase: job.status,
            id,
            kind: job.kind,
            total: job.total,
            processed: job.processed,
          });
        else {
          clearBackgroundJob();
          setBackground({
            phase: "error",
            message:
              language === "zh"
                ? "背景匯出未能完成，請重新建立。"
                : "Background export failed. Create it again.",
          });
        }
      } catch (error) {
        if (active) {
          if (error instanceof CsvExportError && (error.status === 401 || error.status === 403))
            clearBackgroundJob();
          setBackground({
            phase: "error",
            message:
              error instanceof CsvExportError
                ? error.message
                : language === "zh"
                  ? "無法更新匯出進度，請重新整理後再試。"
                  : "Could not refresh export progress. Reload and retry.",
          });
        }
      } finally {
        polling.current = false;
      }
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [background.phase, backgroundId, language]);
  const searchKey = search.toString();
  useEffect(() => {
    setState((current) =>
      current.phase === "error" && current.snapshot !== searchKey ? { phase: "idle" } : current,
    );
  }, [searchKey]);
  const copy: ExportCopy = {
    supportersCsv: pageCopy.common.supportersCsv,
    donationsCsv: pageCopy.common.donationsCsv,
    exporting: pageCopy.common.exporting,
    retry: language === "zh" ? "重試相同條件" : "Retry same filters",
    downloaded: language === "zh" ? "下載已開始。" : "Download started.",
    backgroundExport: language === "zh" ? "建立背景匯出" : "Create background export",
  };
  async function run(kind: ExportKind, snapshot: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ phase: "exporting", kind, snapshot });
    const suffix = snapshot ? "?" + snapshot : "";
    const filename = kind + ".csv";
    try {
      await downloadCsv("/api/admin/exports/" + filename + suffix, filename, language);
      setState({ phase: "success", kind });
    } catch (error) {
      const message =
        error instanceof CsvExportError
          ? error.message
          : error instanceof Error && error.message === "未登入"
            ? language === "zh"
              ? "請登入後再試。"
              : "Sign in before exporting."
            : language === "zh"
              ? "網絡或下載失敗，請檢查連線後重試。"
              : "Network or download failed. Check your connection and retry.";
      setState({
        phase: "error",
        kind,
        snapshot,
        message,
        overLimit: error instanceof CsvExportError && error.status === 413,
      });
    } finally {
      inFlight.current = false;
    }
  }
  async function createBackground() {
    if (state.phase !== "error" || !state.overLimit || inFlight.current) return;
    const { kind, snapshot } = state;
    inFlight.current = true;
    setBackground({ phase: "creating" });
    try {
      const token = await getAdminAccessToken();
      const response = await fetch("/api/admin/exports/jobs", {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify({ kind, filters: Object.fromEntries(new URLSearchParams(snapshot)) }),
      });
      if (!response.ok)
        throw new CsvExportError(await classifyExportFailure(response, language), response.status);
      const job = (await response.json()) as { id: string; kind: ExportKind; total: number };
      saveBackgroundJob(job);
      setBackground({
        phase: "pending",
        id: job.id,
        kind: job.kind,
        total: job.total,
        processed: 0,
      });
      setState({ phase: "idle" });
    } catch (error) {
      setBackground({
        phase: "error",
        message:
          error instanceof Error
            ? error.message
            : language === "zh"
              ? "無法建立背景匯出。"
              : "Could not create background export.",
      });
    } finally {
      inFlight.current = false;
    }
  }
  async function cancelBackground() {
    if (!("id" in background)) return;
    const { id } = background;
    try {
      const token = await getAdminAccessToken();
      const response = await fetch("/api/admin/exports/jobs/" + id, {
        method: "DELETE",
        headers: { authorization: "Bearer " + token },
      });
      if (!response.ok) throw new Error("cancel failed");
      clearBackgroundJob();
      setBackground({ phase: "idle" });
    } catch {
      setBackground({
        phase: "error",
        message:
          language === "zh"
            ? "取消失敗，請重新整理後再試。"
            : "Cancellation failed. Reload and retry.",
      });
    }
  }
  async function downloadBackground() {
    if (background.phase !== "ready") return;
    try {
      await downloadCsv(
        "/api/admin/exports/jobs/" + background.id + "/download",
        background.kind + ".csv",
        language,
      );
      setState({ phase: "success", kind: background.kind });
    } catch {
      setBackground({
        phase: "error",
        message:
          language === "zh"
            ? "下載失敗，請確認權限後再試。"
            : "Download failed. Check your access and retry.",
      });
    }
  }
  return (
    <div className="space-y-2">
      <ExportBarView
        copy={copy}
        state={state}
        onExport={(kind) => void run(kind, searchKey)}
        onBackground={() => void createBackground()}
        onRetry={() => {
          if (state.phase === "error" && state.snapshot === searchKey)
            void run(state.kind, state.snapshot);
        }}
      />
      {background.phase === "creating" ? (
        <p role="status">
          {language === "zh" ? "正在建立背景匯出…" : "Creating background export…"}
        </p>
      ) : null}
      {background.phase === "pending" ||
      background.phase === "processing" ||
      background.phase === "ready" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
          <span>
            {language === "zh"
              ? "背景匯出：" +
                background.processed +
                "/" +
                background.total +
                " 筆；" +
                (background.phase === "ready" ? "可下載" : "處理中")
              : "Background export: " +
                background.processed +
                "/" +
                background.total +
                " rows; " +
                (background.phase === "ready" ? "ready" : "processing")}
          </span>
          {background.phase === "ready" ? (
            <Button type="button" size="sm" onClick={() => void downloadBackground()}>
              {language === "zh" ? "下載完整 CSV" : "Download complete CSV"}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void cancelBackground()}>
            {language === "zh" ? "取消" : "Cancel"}
          </Button>
        </div>
      ) : null}
      {background.phase === "error" ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {background.message}
        </p>
      ) : null}
    </div>
  );
}
