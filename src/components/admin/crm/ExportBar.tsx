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
  | { phase: "error"; kind: ExportKind; snapshot: string; message: string }
  | { phase: "success"; kind: ExportKind };
type ExportCopy = {
  supportersCsv: string;
  donationsCsv: string;
  exporting: string;
  retry: string;
  downloaded: string;
};

class CsvExportError extends Error {}

async function downloadCsv(path: string, filename: string, language: ExportLanguage) {
  const token = await getAdminAccessToken();
  const response = await fetch(path, {
    headers: { authorization: "Bearer " + token },
  });
  if (!response.ok) throw new CsvExportError(await classifyExportFailure(response, language));
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
}: {
  copy: ExportCopy;
  state: ExportState;
  onExport(kind: ExportKind): void;
  onRetry(): void;
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
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {copy.retry}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ExportBar({ search }: ExportBarProps) {
  const { language, pageCopy } = useAdminPageCopy();
  const [state, setState] = useState<ExportState>({ phase: "idle" });
  const inFlight = useRef(false);
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
    retry: language === "zh" ? "重試相同條件" : "Retry same filters",
    downloaded: language === "zh" ? "下載已開始。" : "Download started.",
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
      setState({ phase: "error", kind, snapshot, message });
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <ExportBarView
      copy={copy}
      state={state}
      onExport={(kind) => void run(kind, searchKey)}
      onRetry={() => {
        if (state.phase === "error" && state.snapshot === searchKey)
          void run(state.kind, state.snapshot);
      }}
    />
  );
}
