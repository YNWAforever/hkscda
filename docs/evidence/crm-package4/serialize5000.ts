import { heapStats } from "bun:jsc";
import {
  buildSupporterCsv,
  buildDonationCsv,
  type DonationExportRow,
} from "../../../src/lib/crm/csv";
import type { SupporterSummary } from "../../../src/lib/crm/types";
import { writeFileSync } from "node:fs";
const rows = 5000;
const supporters: SupporterSummary[] = Array.from({ length: rows }, (_, index) => ({
  id: `fixture-${String(index).padStart(5, "0")}`,
  name: `Synthetic supporter ${index}`,
  email: `fixture-${index}@example.invalid`,
  phone: null,
  language: "en",
  tags: ["synthetic"],
  roles: ["donor"],
  deletedAt: null,
  lastGiftAt: "2026-09-05T00:00:00Z",
  lastGiftAmountCents: 10000,
  lifetimeAmountCents: 10000,
  donationCount: 1,
  receiptNeeded: true,
  emailConsent: "opt_out",
  whatsappConsent: "opt_out",
}));
const donations: DonationExportRow[] = supporters.map((s, index) => ({
  supporterId: s.id,
  supporterName: s.name,
  supporterEmail: s.email,
  donationId: `gift-${String(index).padStart(5, "0")}`,
  amountCents: 10000,
  purpose: "general",
  customPurpose: null,
  status: "succeeded",
  method: "manual",
  receiptRequested: true,
  receiptNo: `LOCAL-${index}`,
  createdAt: "2026-09-05T00:00:00Z",
}));
const results = [];
for (const kind of ["supporters", "donations"] as const) {
  Bun.gc(true);
  await Bun.sleep(1);
  const before = process.memoryUsage().heapUsed;
  const jscBefore = heapStats();
  const started = performance.now();
  const json = JSON.stringify({
    total: rows,
    overflow: false,
    [kind]: kind === "supporters" ? supporters : donations,
  });
  const decoded = JSON.parse(json);
  const csv =
    kind === "supporters"
      ? buildSupporterCsv(decoded.supporters)
      : buildDonationCsv(decoded.donations);
  const elapsed = performance.now() - started;
  await Bun.sleep(1);
  const heapDelta = process.memoryUsage().heapUsed - before;
  const jscAfter = heapStats();
  const lines = csv.split("\n"),
    headers = lines[0].split(","),
    idColumn = headers.indexOf(kind === "supporters" ? "supporter_id" : "donation_id");
  const ids = lines.slice(1).map((line) => line.split(",")[idColumn]);
  if (ids.length !== rows || new Set(ids).size !== rows)
    throw new Error("Missing or duplicate exported ID");
  const expected =
    kind === "supporters" ? supporters.map((s) => s.id) : donations.map((d) => d.donationId);
  if (ids.some((id, i) => id !== expected[i])) throw new Error("Export ID mismatch");
  results.push({
    kind,
    rows,
    decodedJsonBytes: Buffer.byteLength(json),
    generatedCsvBytes: Buffer.byteLength(csv),
    serializerElapsedMs: elapsed,
    observedHeapDeltaBytes: heapDelta,
    observedJscHeapDeltaBytes: jscAfter.heapSize - jscBefore.heapSize,
    observedJscExtraMemoryDeltaBytes: jscAfter.extraMemorySize - jscBefore.extraMemorySize,
    uniqueIdsVerified: ids.length,
  });
}
const report = {
  fixture: "crm-local-serialization-v1",
  runtime: Bun.version,
  scope:
    "Local synthetic JSON encode/decode and CSV serialization only; not database latency, PostgREST transport, staging memory, or representative admin benchmark.",
  results,
};
writeFileSync(
  new URL("./serialization-5000.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
