/** Task10 inert evidence boundaries: all required values must be exactly true. */
import contracts from "./task-10-receipt-contracts.json";
export type ReceiptType = keyof typeof contracts;
export function receiptFailures(
  receipt: Record<string, unknown>,
  type: ReceiptType,
  mode: string,
): string[] {
  const contract = contracts[type];
  const flags = [
    ...contract.flags,
    ...(type === "composition" && mode === "component" ? contracts.composition.componentFlags : []),
  ];
  const failed = flags.filter((k) => receipt[k] !== true);
  if (
    receipt.receiptType !== type ||
    receipt.mode !== mode ||
    !(contract.modes as string[]).includes(mode)
  )
    failed.push("receiptIdentity");
  if (receipt.error !== undefined && receipt.error !== null && receipt.error !== "")
    failed.push("error");
  if (!Array.isArray(receipt.failedFinalFlags) || receipt.failedFinalFlags.length !== 0)
    failed.push("failedFinalFlags");
  if ("testExit" in contract && receipt.testExit !== contract.testExit) failed.push("testExit");
  if (type === "auth-component" && receipt.actualCandidateResult !== "55000")
    failed.push("actualCandidateResult");
  if (
    type === "truncate" &&
    receipt.actualTruncateResult !== (mode === "hosted-restrict" ? "0A000" : "42501")
  )
    failed.push("actualTruncateResult");
  if (
    type === "composition" &&
    JSON.stringify(receipt.requiredFinalFlags) !== JSON.stringify(contracts.composition.flags)
  )
    failed.push("requiredFinalFlags");
  if (type === "gates") {
    const gates = receipt.gates as { gate: string; exit: unknown }[] | undefined;
    if (
      !Array.isArray(gates) ||
      JSON.stringify(gates.map((g) => g.gate).sort()) !==
        JSON.stringify(["build", "lint", "tests", "typecheck"]) ||
      gates.some((g) => g.exit !== 0)
    )
      failed.push("gates");
  }
  return [...new Set(failed)];
}
export function assertReceipt(
  receipt: Record<string, unknown>,
  type: ReceiptType,
  mode: string,
): void {
  const failed = receiptFailures(receipt, type, mode);
  if (failed.length) throw Error("Task10 ineligible " + type + "/" + mode + ":" + failed.join(","));
}
/** Call only after cleanup and preservation observations; retain failed receipts. */
export function completeReceipt(
  receipt: Record<string, unknown>,
  type: ReceiptType,
  mode: string,
): number {
  receipt.receiptType = type;
  receipt.mode = mode;
  // Preserve an existing failure list; a consumer never trusts a self-reported list.
  receipt.failedFinalFlags = Array.isArray(receipt.failedFinalFlags)
    ? receipt.failedFinalFlags
    : [];
  const failed = receiptFailures(receipt, type, mode);
  receipt.failedFinalFlags = failed;
  if (failed.length)
    receipt.error = [receipt.error, "Required evidence failed:" + failed.join(",")]
      .filter(Boolean)
      .join("; ");
  return failed.length ? 1 : 0;
}
