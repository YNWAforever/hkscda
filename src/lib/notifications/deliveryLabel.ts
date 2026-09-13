export function deliveryLabel(state: string | null | undefined): string | null {
  const labels: Record<string, string> = {
    delivered: "已送達收件伺服器",
    bounced: "退信：需要跟進",
    failed: "服務商回報失敗：需要跟進",
    complained: "收件人投訴：停止重發並跟進",
    delivery_delayed: "服務商仍在嘗試送達",
  };
  return state ? (labels[state] ?? "送達狀態待核實") : null;
}
