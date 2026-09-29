export type ExportLanguage = "zh" | "en";

export async function classifyExportFailure(
  response: Response,
  language: ExportLanguage,
): Promise<string> {
  if (response.status === 401)
    return language === "zh" ? "登入已過期，請重新登入後再試。" : "Sign in again before exporting.";
  if (response.status === 403)
    return language === "zh"
      ? "你沒有權限匯出這些資料。"
      : "You do not have permission to export this data.";
  if (response.status === 413) {
    const body = await response.json().catch(() => null);
    const total =
      typeof body?.total === "number" && Number.isSafeInteger(body.total)
        ? body.total.toLocaleString(language === "zh" ? "zh-HK" : "en-US")
        : null;
    return language === "zh"
      ? "符合" +
          (total ? " " + total + " 筆" : "的") +
          "資料超過 5,000 筆即時匯出上限。請縮小篩選後重試；背景匯出尚未啟用。"
      : (total ? total + " matching rows exceed" : "Results exceed") +
          " the 5,000-row immediate export limit. Narrow your filters and retry; background export is not enabled yet.";
  }
  if (response.status >= 500)
    return language === "zh"
      ? "伺服器未能完成匯出，請稍後重試。"
      : "The server could not finish the export. Retry later.";
  return language === "zh" ? "匯出未完成，請重試。" : "Export did not finish. Please retry.";
}
