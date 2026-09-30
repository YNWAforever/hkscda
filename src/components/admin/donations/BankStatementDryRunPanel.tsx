import { useEffect, useRef, useState } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { BankMatchOperation } from "../../../lib/donations/bankMatchConfirmation";
import {
  BANK_STATEMENT_HEADER,
  BANK_STATEMENT_MAX_BYTES,
  type BankStatementDryRunResult,
  type BankStatementPreviewRow,
} from "../../../lib/donations/bankStatementDryRun";
import { centsToHkd } from "../../../lib/donations/domain";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { BankMatchOperationReview } from "./BankMatchOperationReview";

const PAGE_SIZE = 25;

const statusCopy: Record<BankStatementPreviewRow["status"], string> = {
  invalid: "資料無效",
  duplicate_file: "檔內重複",
  already_credited: "相同銀行參考已入帳",
  candidate_exact: "付款參考相符候選",
  candidate_amount_only: "只按金額候選",
  ambiguous: "多個候選，須人工核對",
  unmatched: "沒有候選",
};

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
  const start = (page - 1) * PAGE_SIZE;
  const rows = result.rows.slice(start, start + PAGE_SIZE);
  return (
    <div className="space-y-3 text-sm text-[var(--color-panel)]">
      <p role="status">
        共 {result.summary.total} 筆；資料無效 {result.summary.invalid}、檔內重複{" "}
        {result.summary.duplicate}、已入帳 {result.summary.credited}、有候選{" "}
        {result.summary.candidates}、沒有候選 {result.summary.unmatched}。
      </p>
      <p className="text-xs text-[var(--color-text-muted)]">
        檔案 SHA-256：{result.fileSha256} · 預覽時間：{result.generatedAt}
        。結果不會儲存；付款事實改變後須重新上載並核對。
      </p>
      <div
        role="region"
        aria-label="銀行候選預覽表格"
        tabIndex={0}
        className="max-h-[32rem] overflow-auto rounded-md border border-[var(--color-border)]"
      >
        <table className="w-full min-w-[44rem] text-left">
          <caption className="sr-only">銀行對帳檔第 {page} 頁候選預覽</caption>
          <thead className="bg-[var(--color-surface)]">
            <tr>
              {onToggle ? (
                <th scope="col" className="p-2">
                  選取
                </th>
              ) : null}
              <th scope="col" className="p-2">
                行
              </th>
              <th scope="col" className="p-2">
                銀行參考／日期
              </th>
              <th scope="col" className="p-2">
                金額
              </th>
              <th scope="col" className="p-2">
                結果及候選
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
                        aria-label={`選取第 ${row.ordinal} 行作確認預覽`}
                        checked={selectedOrdinals.includes(row.ordinal)}
                        onChange={() => onToggle(row.ordinal)}
                      />
                    ) : null}
                  </td>
                ) : null}
                <td className="p-2">{row.ordinal}</td>
                <td className="p-2">
                  <span className="block break-all">{row.bankReference || "—"}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{row.receivedOn}</span>
                </td>
                <td className="p-2">
                  {row.amountCents === null ? "—" : centsToHkd(row.amountCents)}
                </td>
                <td className="p-2">
                  <span className="font-medium">{statusCopy[row.status]}</span>
                  {row.invalidReason && <span className="block">原因：{row.invalidReason}</span>}
                  {row.candidateCount > 0 && (
                    <span className="block">候選 {row.candidateCount} 筆；僅顯示前 5 筆</span>
                  )}
                  {row.candidates.map((candidate) => (
                    <span key={candidate.id} className="block break-all text-xs">
                      {candidate.id} · {candidate.provider.toUpperCase()} ·{" "}
                      {candidate.providerRef || "無付款參考"}
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

export function BankStatementDryRunPanel({ actorUserId }: { actorUserId: string }) {
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
  const [error, setError] = useState("");
  const [operationError, setOperationError] = useState("");
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
            setOperationError("未能恢復上次確認快照；請先重新讀取確認結果。");
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
  }, [operationStorageKey]);

  async function preview() {
    if (!file || pending) return;
    const generation = ++requestGeneration.current;
    setResult(null);
    setCsvText(null);
    setSelectedOrdinals([]);
    setError("");
    if (file.size > BANK_STATEMENT_MAX_BYTES) {
      setError("檔案超過 256 KiB 上限。");
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
      const response = await fetchAdminJson<BankStatementDryRunResult>(
        "/api/admin/finance/bank-statement-preview",
        { method: "POST", body: JSON.stringify({ csvText: text }) },
      );
      if (requestGeneration.current !== generation) return;
      setCsvText(text);
      setResult(response);
      setPage(1);
    } catch {
      if (requestGeneration.current === generation)
        setError("無法預覽對帳檔；請檢查 UTF-8 格式或聯絡財務管理員。");
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
    setOperationError("");
    try {
      const saved = await fetchAdminJson<BankMatchOperation>(operationUrl, {
        method: "POST",
        body: JSON.stringify({ csvText, selectedOrdinals }),
      });
      if (!current()) return;
      setOperation(saved);
      setRecoveryId(saved.operationId);
      sessionStorage.setItem(operationStorageKey, saved.operationId);
    } catch {
      if (current()) setOperationError("無法建立確認預覽；請檢查所選項目、權限及目前付款狀態。");
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
    setOperationError("");
    try {
      const saved = await fetchAdminJson<BankMatchOperation>(
        `${operationUrl}?operationId=${encodeURIComponent(operationId)}`,
      );
      if (!current()) return;
      setOperation(saved);
      setOperationReadFailed(false);
    } catch {
      if (current()) {
        setOperationReadFailed(true);
        setOperationError("未能重新讀取快照；請稍後再試。");
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
        `請核對銀行參考 ${item.bankReference}、付款 ${item.paymentId}、付款參考 ${item.paymentHint} 及 ${centsToHkd(item.amountCents)}，確定只確認此筆入帳？`,
      )
    )
      return;
    const generation = ++operationGeneration.current;
    const current = () => mounted.current && operationGeneration.current === generation;
    operationBusy.current = true;
    setApplyingOrdinal(ordinal);
    setOperationError("");
    try {
      await fetchAdminJson(operationUrl, {
        method: "PATCH",
        body: JSON.stringify({ operationId: operation.operationId, ordinal }),
      });
      if (!current()) return;
      const saved = await fetchAdminJson<BankMatchOperation>(
        `${operationUrl}?operationId=${encodeURIComponent(operation.operationId)}`,
      );
      if (current()) {
        setOperation(saved);
        setOperationReadFailed(false);
      }
    } catch {
      if (current()) {
        setOperationReadFailed(true);
        setOperationError("未能確認或更新此筆結果；請先重新讀取快照，勿重複使用另一銀行參考入帳。");
      }
    } finally {
      if (current()) {
        operationBusy.current = false;
        setApplyingOrdinal(null);
      }
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
      <h3 className="font-semibold text-[var(--color-panel)]">銀行對帳檔預覽與逐組確認</h3>
      <p className="text-sm text-[var(--color-text-muted)]">
        第一步只作預覽與候選搜尋，不會確認入帳、退款或發送通知。銀行原始格式須先轉成內部標準
        CSV；每檔最多 1,000 筆，僅接受 HKD
        入款。只有建立快照後逐筆確認，才會記錄入帳及可恢復的收條工作。
      </p>
      <p className="break-all text-xs text-[var(--color-text-muted)]">
        標準欄位：<code>{BANK_STATEMENT_HEADER}</code>
      </p>
      <div className="space-y-1">
        <Label htmlFor="bank-statement-csv">選擇標準 CSV</Label>
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
            setError("");
          }}
        />
      </div>
      <Button type="button" variant="outline" disabled={!file || pending} onClick={preview}>
        {pending ? "正在核對…" : "產生唯讀預覽"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {error}
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
          <p role="status">
            已選取 {selectedOrdinals.length} 筆付款參考相符候選；其他結果不能建立入帳快照。
          </p>
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
            {operationPending ? "正在處理快照…" : "建立逐組確認預覽"}
          </Button>
          {result.rows.length > PAGE_SIZE ? (
            <nav aria-label="銀行預覽分頁" className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                上一頁
              </Button>
              <span>
                第 {page} / {Math.ceil(result.rows.length / PAGE_SIZE)} 頁
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={page * PAGE_SIZE >= result.rows.length}
                onClick={() => setPage(page + 1)}
              >
                下一頁
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
      {operationError ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {operationError}
        </p>
      ) : null}
      {recoveryId ? (
        <Button
          type="button"
          variant="outline"
          disabled={operationPending || applyingOrdinal !== null}
          onClick={() => void refreshOperation(recoveryId)}
        >
          重新讀取確認結果
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
