import type { ConsentUpdate } from "./schemas";
import type { ConsentChannel, ConsentHistoryRow, ConsentStatus } from "./types";

export function latestConsentByChannel(rows: ConsentHistoryRow[]) {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return {
    email: sorted.find((row) => row.channel === "email") ?? null,
    whatsapp: sorted.find((row) => row.channel === "whatsapp") ?? null,
  };
}

export function buildConsentRowsForUpdate(input: {
  supporterId: string;
  update: ConsentUpdate;
  now?: () => Date;
}) {
  const timestamp = input.update.timestamp ?? (input.now ?? (() => new Date()))().toISOString();
  const rows: Array<{
    supporter_id: string;
    channel: ConsentChannel;
    status: ConsentStatus;
    source: string;
    timestamp: string;
  }> = [];

  if (input.update.email !== undefined) {
    rows.push({
      supporter_id: input.supporterId,
      channel: "email",
      status: input.update.email ? "opt_in" : "opt_out",
      source: input.update.source,
      timestamp,
    });
  }

  if (input.update.whatsapp !== undefined) {
    rows.push({
      supporter_id: input.supporterId,
      channel: "whatsapp",
      status: input.update.whatsapp ? "opt_in" : "opt_out",
      source: input.update.source,
      timestamp,
    });
  }

  return rows;
}
