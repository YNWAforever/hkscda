import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../ui/button";
import { useAdminPageCopy } from "../adminPageCopy";
import { useAdminCopy } from "../i18n/copy";
import { getAdminAccessToken } from "./api";
import { exportCopy } from "./exportCopy";
import {
  classifyExportFailure,
  CsvExportError,
  failureOfCreateError,
  failureOfExportError,
  type ExportFailure,
} from "./exportFailure";

type ExportBarProps = { search: URLSearchParams; busy?: boolean };
type ExportKind = "supporters" | "donations";
export type ExportState =
  | { phase: "idle" }
  | { phase: "exporting"; kind: ExportKind; snapshot: string }
  | {
      phase: "error";
      kind: ExportKind;
      snapshot: string;
      failure: ExportFailure;
      overLimit?: boolean;
    }
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
  | { phase: "error"; failure: ExportFailure };
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
  /** The message for a failure, in the language the bar is shown in. */
  failure: (failure: ExportFailure) => string;
};

async function downloadCsv(path: string, filename: string) {
  const token = await getAdminAccessToken();
  const response = await fetch(path, {
    headers: { authorization: "Bearer " + token },
  });
  if (!response.ok)
    throw new CsvExportError(await classifyExportFailure(response), response.status);
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
  busy = false,
}: {
  copy: ExportCopy;
  busy?: boolean;
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
            disabled={pending || busy}
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
          <p>{copy.failure(state.failure)}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRetry}>
              {copy.retry}
            </Button>
            {state.overLimit && onBackground ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={onBackground}
              >
                {copy.backgroundExport}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ExportBar({ search, busy = false }: ExportBarProps) {
  const { pageCopy } = useAdminPageCopy();
  const text = useAdminCopy(exportCopy);
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
          throw new CsvExportError(await classifyExportFailure(response), response.status);
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
          setBackground({ phase: "error", failure: { code: "background_failed" } });
        }
      } catch (error) {
        if (active) {
          if (error instanceof CsvExportError && (error.status === 401 || error.status === 403))
            clearBackgroundJob();
          setBackground({
            phase: "error",
            failure: error instanceof CsvExportError ? error.failure : { code: "progress_failed" },
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
  }, [background.phase, backgroundId]);
  const searchKey = search.toString();
  useEffect(() => {
    setState((current) =>
      current.phase === "error" && current.snapshot !== searchKey ? { phase: "idle" } : current,
    );
  }, [searchKey, state]);
  const copy: ExportCopy = {
    supportersCsv: pageCopy.common.supportersCsv,
    donationsCsv: pageCopy.common.donationsCsv,
    exporting: pageCopy.common.exporting,
    retry: text.retry,
    downloaded: text.downloaded,
    backgroundExport: text.backgroundExport,
    failure: text.failure,
  };
  async function run(kind: ExportKind, snapshot: string) {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setState({ phase: "exporting", kind, snapshot });
    const suffix = snapshot ? "?" + snapshot : "";
    const filename = kind + ".csv";
    try {
      await downloadCsv("/api/admin/exports/" + filename + suffix, filename);
      setState({ phase: "success", kind });
    } catch (error) {
      setState({
        phase: "error",
        kind,
        snapshot,
        failure: failureOfExportError(error),
        overLimit: error instanceof CsvExportError && error.status === 413,
      });
    } finally {
      inFlight.current = false;
    }
  }
  async function createBackground() {
    if (busy || state.phase !== "error" || !state.overLimit || inFlight.current) return;
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
        throw new CsvExportError(await classifyExportFailure(response), response.status);
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
      setBackground({ phase: "error", failure: failureOfCreateError(error) });
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
      setBackground({ phase: "error", failure: { code: "cancel_failed" } });
    }
  }
  async function downloadBackground() {
    if (background.phase !== "ready") return;
    try {
      await downloadCsv(
        "/api/admin/exports/jobs/" + background.id + "/download",
        background.kind + ".csv",
      );
      setState({ phase: "success", kind: background.kind });
    } catch {
      setBackground({ phase: "error", failure: { code: "download_failed" } });
    }
  }
  return (
    <div className="space-y-2">
      <ExportBarView
        copy={copy}
        busy={busy}
        state={state}
        onExport={(kind) => void run(kind, searchKey)}
        onBackground={() => void createBackground()}
        onRetry={() => {
          if (state.phase === "error" && state.snapshot === searchKey)
            void run(state.kind, state.snapshot);
        }}
      />
      {background.phase === "creating" ? <p role="status">{text.creatingBackground}</p> : null}
      {background.phase === "pending" ||
      background.phase === "processing" ||
      background.phase === "ready" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
          <span>
            {text.progress(background.processed, background.total, background.phase === "ready")}
          </span>
          {background.phase === "ready" ? (
            <Button type="button" size="sm" onClick={() => void downloadBackground()}>
              {text.downloadComplete}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void cancelBackground()}>
            {text.cancel}
          </Button>
        </div>
      ) : null}
      {background.phase === "error" ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {text.failure(background.failure)}
        </p>
      ) : null}
    </div>
  );
}
