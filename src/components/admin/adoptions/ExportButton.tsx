import { Download } from "lucide-react";

import type { CoordinatorExportKind } from "../../../lib/adoptions/types";
import { Button } from "../../ui/button";
import { buildCoordinatorExportUrl } from "./adopterWorkflowLogic";

type ExportButtonProps = {
  kind: CoordinatorExportKind;
  searchParams?: URLSearchParams;
  label?: string;
};

export function ExportButton({
  kind,
  searchParams = new URLSearchParams(),
  label = "Export",
}: ExportButtonProps) {
  return (
    <Button asChild type="button" variant="outline">
      <a href={buildCoordinatorExportUrl(kind, searchParams)}>
        <Download className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}
