import { Download } from "lucide-react";
import { useState } from "react";

import type { CoordinatorExportKind } from "../../../lib/adoptions/types";
import { supabase } from "../../../lib/supabase";
import { Button } from "../../ui/button";
import { useAdminPageCopy } from "../adminPageCopy";
import { buildCoordinatorExportUrl, getCoordinatorExportFilename } from "./adopterWorkflowLogic";

type ExportButtonProps = {
  kind: CoordinatorExportKind;
  searchParams?: URLSearchParams;
  label?: string;
};

export function ExportButton({
  kind,
  searchParams = new URLSearchParams(),
  label,
}: ExportButtonProps) {
  const { pageCopy } = useAdminPageCopy();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  async function handleExport() {
    setError("");
    setIsExporting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(pageCopy.common.notSignedIn);

      const response = await fetch(buildCoordinatorExportUrl(kind, searchParams), {
        headers: { authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : pageCopy.common.exportFailed);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = getCoordinatorExportFilename(
        kind,
        response.headers.get("content-disposition"),
      );
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : pageCopy.common.exportFailed);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => void handleExport()}
        disabled={isExporting}
      >
        <Download className="h-4 w-4" />
        {isExporting ? pageCopy.common.exporting : (label ?? pageCopy.common.export)}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-[var(--color-error)]">
          {error}
        </p>
      )}
    </div>
  );
}
