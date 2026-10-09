import { useEffect, useRef, useState } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { BankMatchOperation } from "../../../lib/donations/bankMatchConfirmation";
import {
  BANK_STATEMENT_HEADER,
  BANK_STATEMENT_MAX_BYTES,
  type BankStatementDryRunResult,
} from "../../../lib/donations/bankStatementDryRun";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useAdminCopy } from "../i18n/copy";
import { BankMatchOperationReview } from "./BankMatchOperationReview";
import { bankPanelCopy, bankPreviewCopy } from "./bankCopy";
import { donationFormatCopy } from "./formatCopy";

const PAGE_SIZE = 25;

export function BankStatementDryRunPreview({
  result,
  page,
  selectedOrdinals = [],
  onToggle,
}: {
  result: BankStatementDryRunResult;
  page: number;
  selectedOrdinals?: number[];
  onToggle?: (ordinal: number) => void;
}) {
  const copy = useAdminCopy(bankPreviewCopy);
  const format = useAdminCopy(donationFormatCopy);
  const start = (page - 1) * PAGE_SIZE;
  const rows = result.rows.slice(start, start + PAGE_SIZE);
  return (
    <div className="space-y-3 text-sm text-[var(--color-panel)]">
      <p role="status">{copy.summary(result.summary)}</p>
      <p className="text-xs text-[var(--color-text-muted)]">
        {copy.fileLine(result.fileSha256, format.timestamp(result.generatedAt))}
      </p>
      <div
        role="region"
        aria-label={copy.regionLabel}
        tabIndex={0}
        className="max-h-[32rem] overflow-auto rounded-md border border-[var(--color-border)]"
      >
        <table className="w-full min-w-[44rem] text-left">
          <caption className="sr-only">{copy.caption(page)}</caption>
          <thead className="bg-[var(--color-surface)]">
            <tr>
              {onToggle ? (
                <th scope="col" className="p-2">
                  {copy.columns.select}
                </th>
              ) : null}
              <th scope="col" className="p-2">
                {copy.columns.row}
              </th>
              <th scope="col" className="p-2">
                {copy.columns.reference}
              </th>
              <th scope="col" className="p-2">
                {copy.columns.amount}
              </th>
              <th scope="col" className="p-2">
                {copy.columns.result}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ordinal} className="border-t border-[var(--color-border)] align-top">
                {onToggle ? (
                  <td className="p-2">
                    {row.status === "candidate_exact" &&
                    row.candidateCount === 1 &&
                    row.candidates.length === 1 ? (
                      <input
                        type="checkbox"
                        aria-label={copy.selectRow(row.ordinal)}
                        checked={selectedOrdinals.includes(row.ordinal)}
                        onChange={() => onToggle(row.ordinal)}
                      />
                    ) : null}
                  </td>
                ) : null}
                <td className="p-2">{row.ordinal}</td>
                <td className="p-2">
                  <span className="block break-all">{row.bankReference || "—"}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {format.day(row.receivedOn)}
                  </span>
                </td>
                <td className="p-2">
                  {row.amountCents === null ? "—" : format.money(row.amountCents)}
                </td>
                <td className="p-2">
                  <span className="font-medium">{copy.statuses[row.status]}</span>
                  {row.invalidReason && (
                    <span className="block">{copy.invalidReason(row.invalidReason)}</span>
                  )}
                  {row.candidateCount > 0 && (
                    <span className="block">{copy.candidateCount(row.candidateCount)}</span>
                  )}
                  {row.candidates.map((candidate) => (
                    <span key={candidate.id} className="block break-all text-xs">
                      {candidate.id} · {candidate.provider.toUpperCase()} ·{" "}
                      {candidate.providerRef || copy.noPaymentReference}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const operationStoragePrefix = "hkscda-finance-bank-match-operation";
const operationUrl = "/api/admin/finance/bank-match-operations";

/** Why the preview of the file failed. Kept as a code and written when the panel renders. */
type PreviewError = "file_too_large" | "preview_failed";
/** Why the confirmation snapshot could not be made, read or applied. */
type OperationError = "restore_failed" | "create_failed" | "refresh_failed" | "apply_failed";

export function BankStatementDryRunPanel({ actorUserId }: { actorUserId: string }) {
  const copy = useAdminCopy(bankPanelCopy);
  const format = useAdminCopy(donationFormatCopy);
  const fetchForActor = <T,>(path: string, init?: RequestInit) =>
    fetchAdminJson<T>(path, init, actorUserId);
  const operationStorageKey = `${operationStoragePrefix}:${actorUserId}`;
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [result, setResult] = useState<BankStatementDryRunResult | null>(null);
  const [selectedOrdinals, setSelectedOrdinals] = useState<number[]>([]);
  const [operation, setOperation] = useState<BankMatchOperation | null>(null);
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(false);
  const [operationPending, setOperationPending] = useState(false);
  const [applyingOrdinal, setApplyingOrdinal] = useState<number | null>(null);
  const [error, setError] = useState<PreviewError | null>(null);
  const [operationError, setOperationError] = useState<OperationError | null>(null);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [operationReadFailed, setOperationReadFailed] = useState(false);
  const requestGeneration = useRef(0);
  const operationGeneration = useRef(0);
  const operationBusy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const counters = [operationGeneration, requestGeneration];
    const generation = ++operationGeneration.current;
    const operationId = sessionStorage.getItem(operationStorageKey);
    if (operationId) {
      setRecoveryId(operationId);
      operationBusy.current = true;
      setOperationPending(true);
      void fetchAdminJson<BankMatchOperation>(
        `${operationUrl}?operationId=${encodeURIComponent(operationId)}`,
        undefined,
        actorUserId,
      )
        .then((saved) => {
          if (mounted.current && operationGeneration.current === generation) {
            setOperation(saved);
            setOperationReadFailed(false);
          }
        })
        .catch(() => {
          if (mounted.current && operationGeneration.current === generation) {
            setOperationReadFailed(true);
            setOperationError("restore_failed");
          }
        })
        .finally(() => {
          if (mounted.current && operationGeneration.current === generation) {
            operationBusy.current = false;
            setOperationPending(false);
          }
        });
    }
    return () => {
      mounted.current = false;
      // These refs are request counters; invalidate their latest values on cleanup.
      for (const counter of counters) counter.current++;
      operationBusy.current = false;
    };
  }, [operationStorageKey, actorUserId]);

  async function preview() {
    if (!file || pending) return;
    const generation = ++requestGeneration.current;
    setResult(null);
    setCsvText(null);
    setSelectedOrdinals([]);
    setError(null);
    if (file.size > BANK_STATEMENT_MAX_BYTES) {
      setError("file_too_large");
      return;
    }
    setPending(true);
    try {
      // Preserve the BOM and reject malformed UTF-8 so the server's UTF-8
      // checksum identifies exactly the selected file bytes.
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        await file.arrayBuffer(),
      );
      if (requestGeneration.current !== generation) return;
      const response = await fetchForActor<BankStatementDryRunResult>(
        "/api/admin/finance/bank-statement-preview",
        { method: "POST", body: JSON.stringify({ csvText: text }) },
      );
      if (requestGeneration.current !== generation) return;
      setCsvText(text);
      setResult(response);
      setPage(1);
    } catch {
      if (requestGeneration.current === generation) setError("preview_failed");
    } finally {
      if (requestGeneration.current === generation) setPending(false);
    }
  }

  function toggle(ordinal: number) {
    setSelectedOrdinals((current) =>
      current.includes(ordinal)
        ? current.filter((value) => value !== ordinal)
        : [...current, ordinal],
    );
  }

  async function createOperation() {
    if (!csvText || selectedOrdinals.length === 0 || operationBusy.current || operationReadFailed)
      return;
    const generation = ++operationGeneration.current;
    const current = () => mounted.current && operationGeneration.current === generation;
    operationBusy.current = true;
    setOperationPending(true);
    setOperationError(null);
    try {
      const saved = await fetchForActor<BankMatchOperation>(operationUrl, {
        method: "POST",
        body: JSON.stringify({ csvText, selectedOrdinals }),
      });
      if (!current()) return;
      setOperation(saved);
      setRecoveryId(saved.operationId);
      sessionStorage.setItem(operationStorageKey, saved.operationId);
    } catch {
      if (current()) setOperationError("create_failed");
    } finally {
      if (current()) {
        operationBusy.current = false;
        setOperationPending(false);
      }
    }
  }

  async function refreshOperation(operationId: string) {
    if (operationBusy.current) return;
    const generation = ++operationGeneration.current;
    const current = () => mounted.current && operationGeneration.current === generation;
    operationBusy.current = true;
    setOperationPending(true);
    setOperationError(null);
    try {
      const saved = await fetchForActor<BankMatchOperation>(
        `${operationUrl}?operationId=${encodeURIComponent(operationId)}`,
      );
      if (!current()) return;
      setOperation(saved);
      setOperationReadFailed(false);
    } catch {
      if (current()) {
        setOperationReadFailed(true);
        setOperationError("refresh_failed");
      }
    } finally {
      if (current()) {
        operationBusy.current = false;
        setOperationPending(false);
      }
    }
  }

  async function applyOne(ordinal: number) {
    const item = operation?.items.find((entry) => entry.ordinal === ordinal);
    if (
      !operation ||
      !item ||
      item.status !== "pending" ||
      operationBusy.current ||
      operationReadFailed
    )
      return;
    if (
      !window.confirm(
        copy.confirmApply(
          item.bankReference,
          item.paymentId,
          item.paymentHint,
          format.money(item.amountCents),
        ),
      )
    )
      return;
    const generation = ++operationGeneration.current;
    const current = () => mounted.current && operationGeneration.current === generation;
    operationBusy.current = true;
    setApplyingOrdinal(ordinal);
    setOperationError(null);
    try {
      await fetchForActor(operationUrl, {
        method: "PATCH",
        body: JSON.stringify({ operationId: operation.operationId, ordinal }),
      });
      if (!current()) return;
      const saved = await fetchForActor<BankMatchOperation>(
        `${operationUrl}?operationId=${encodeURIComponent(operation.operationId)}`,
      );
      if (current()) {
        setOperation(saved);
        setOperationReadFailed(false);
      }
    } catch {
      if (current()) {
        setOperationReadFailed(true);
        setOperationError("apply_failed");
      }
    } finally {
      if (current()) {
        operationBusy.current = false;
        setApplyingOrdinal(null);
      }
    }
  }

  const previewErrorText = error === "file_too_large" ? copy.fileTooLarge : copy.previewFailed;
  const operationErrorText = {
    restore_failed: copy.restoreFailed,
    create_failed: copy.createFailed,
    refresh_failed: copy.refreshFailed,
    apply_failed: copy.applyFailed,
  };

  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
      <h3 className="font-semibold text-[var(--color-panel)]">{copy.heading}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      <p className="break-all text-xs text-[var(--color-text-muted)]">
        {copy.standardColumns}
        <code>{BANK_STATEMENT_HEADER}</code>
      </p>
      <div className="space-y-1">
        <Label htmlFor="bank-statement-csv">{copy.chooseFile}</Label>
        <Input
          id="bank-statement-csv"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            requestGeneration.current++;
            setPending(false);
            setPage(1);
            setFile(event.target.files?.[0] ?? null);
            setCsvText(null);
            setResult(null);
            setSelectedOrdinals([]);
            setError(null);
          }}
        />
      </div>
      <Button type="button" variant="outline" disabled={!file || pending} onClick={preview}>
        {pending ? copy.checking : copy.preview}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {previewErrorText}
        </p>
      ) : null}
      {result ? (
        <>
          <BankStatementDryRunPreview
            result={result}
            page={page}
            selectedOrdinals={selectedOrdinals}
            onToggle={toggle}
          />
          <p role="status">{copy.selected(selectedOrdinals.length)}</p>
          <Button
            type="button"
            variant="outline"
            disabled={
              selectedOrdinals.length === 0 ||
              operationPending ||
              applyingOrdinal !== null ||
              operationReadFailed
            }
            onClick={() => void createOperation()}
          >
            {operationPending ? copy.processingSnapshot : copy.createOperation}
          </Button>
          {result.rows.length > PAGE_SIZE ? (
            <nav aria-label={copy.pagerLabel} className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {copy.previous}
              </Button>
              <span>{copy.pageOf(page, Math.ceil(result.rows.length / PAGE_SIZE))}</span>
              <Button
                type="button"
                variant="outline"
                disabled={page * PAGE_SIZE >= result.rows.length}
                onClick={() => setPage(page + 1)}
              >
                {copy.next}
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
      {operationError ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {operationErrorText[operationError]}
        </p>
      ) : null}
      {recoveryId ? (
        <Button
          type="button"
          variant="outline"
          disabled={operationPending || applyingOrdinal !== null}
          onClick={() => void refreshOperation(recoveryId)}
        >
          {copy.reload}
        </Button>
      ) : null}
      {operation ? (
        <BankMatchOperationReview
          key={operation.operationId}
          operation={operation}
          onApply={(ordinal) => void applyOne(ordinal)}
          pendingOrdinal={applyingOrdinal}
          disabled={operationPending || operationReadFailed}
        />
      ) : null}
    </section>
  );
}
