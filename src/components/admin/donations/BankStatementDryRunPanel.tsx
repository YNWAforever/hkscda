import { useEffect, useState } from "react";

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
      <div className="max-h-[32rem] overflow-auto rounded-md border border-[var(--color-border)]">
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

const operationStorageKey = "hkscda-finance-bank-match-operation";
const operationUrl = "/api/admin/finance/bank-match-operations";

export function BankStatementDryRunPanel() {
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

  useEffect(() => {
    const operationId = sessionStorage.getItem(operationStorageKey);
    if (!operationId) return;
    let active = true;
    void fetchAdminJson<BankMatchOperation>(
      `${operationUrl}?operationId=${encodeURIComponent(operationId)}`,
    )
      .then((saved) => {
        if (active) setOperation(saved);
      })
      .catch(() => {
        if (active) setOperationError("未能恢復上次確認快照；請核對權限或重新預覽。");
      });
    return () => {
      active = false;
    };
  }, []);

  async function preview() {
    if (!file) return;
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
      const text = await file.text();
      const response = await fetchAdminJson<BankStatementDryRunResult>(
        "/api/admin/finance/bank-statement-preview",
        { method: "POST", body: JSON.stringify({ csvText: text }) },
      );
      setCsvText(text);
      setResult(response);
      setPage(1);
    } catch {
      setError("無法預覽對帳檔；請檢查格式或聯絡財務管理員。");
    } finally {
      setPending(false);
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
    if (!csvText || selectedOrdinals.length === 0 || operationPending) return;
    setOperationPending(true);
    setOperationError("");
    try {
      const saved = await fetchAdminJson<BankMatchOperation>(operationUrl, {
        method: "POST",
        body: JSON.stringify({ csvText, selectedOrdinals }),
      });
      setOperation(saved);
      sessionStorage.setItem(operationStorageKey, saved.operationId);
    } catch {
      setOperationError("無法建立確認預覽；請檢查所選項目、權限及目前付款狀態。");
    } finally {
      setOperationPending(false);
    }
  }

  async function refreshOperation(operationId: string) {
    const saved = await fetchAdminJson<BankMatchOperation>(
      `${operationUrl}?operationId=${encodeURIComponent(operationId)}`,
    );
    setOperation(saved);
    return saved;
  }

  async function applyOne(ordinal: number) {
    const item = operation?.items.find((entry) => entry.ordinal === ordinal);
    if (!operation || !item || item.status !== "pending" || applyingOrdinal !== null) return;
    if (
      !window.confirm(
        `請核對銀行參考 ${item.bankReference}、付款 ${item.paymentId} 及 ${centsToHkd(item.amountCents)}，確定只確認此筆入帳？`,
      )
    )
      return;
    setApplyingOrdinal(ordinal);
    setOperationError("");
    try {
      await fetchAdminJson(operationUrl, {
        method: "PATCH",
        body: JSON.stringify({ operationId: operation.operationId, ordinal }),
      });
      await refreshOperation(operation.operationId);
    } catch {
      setOperationError("未能確認或更新此筆結果；請先重新讀取快照，勿重複使用另一銀行參考入帳。");
    } finally {
      setApplyingOrdinal(null);
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
            disabled={selectedOrdinals.length === 0 || operationPending}
            onClick={() => void createOperation()}
          >
            {operationPending ? "正在建立…" : "建立逐組確認預覽"}
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
      {operation ? (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void refreshOperation(operation.operationId).catch(() =>
                setOperationError("未能重新讀取快照。"),
              )
            }
          >
            重新讀取確認結果
          </Button>
          <BankMatchOperationReview
            operation={operation}
            onApply={(ordinal) => void applyOne(ordinal)}
            pendingOrdinal={applyingOrdinal}
          />
        </>
      ) : null}
    </section>
  );
}
