import { Download } from "lucide-react";

import { Button } from "../../ui/button";
import { getAdminAccessToken } from "./api";

type ExportBarProps = {
  search: URLSearchParams;
};

async function downloadCsv(path: string, filename: string) {
  const token = await getAdminAccessToken();
  const response = await fetch(path, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Export failed");

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportBar({ search }: ExportBarProps) {
  const query = search.toString();
  const suffix = query ? `?${query}` : "";

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => downloadCsv(`/api/admin/exports/supporters.csv${suffix}`, "supporters.csv")}
      >
        <Download className="h-4 w-4" />
        Supporters CSV
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => downloadCsv(`/api/admin/exports/donations.csv${suffix}`, "donations.csv")}
      >
        <Download className="h-4 w-4" />
        Donations CSV
      </Button>
    </div>
  );
}
