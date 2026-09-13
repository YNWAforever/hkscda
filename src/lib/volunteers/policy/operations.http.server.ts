import { z } from "zod";
import { createOperationService, type OperationCommand, type OperationResult } from "./operations";
const envelope = z.object({ command: z.unknown(), turnstileToken: z.string().optional() }).strict();
const messages: Record<string, string> = {
  group_window_closed: "已超出團體預約窗口，不能確認新的團體。",
  group_policy_conflict: "團體人數或現有義工資格／名額與目標政策衝突，請調整後重新預覽。",
  paired_policy_not_published: "尚未發布適用日期的配對 A／B 政策。",
  late_group_review_required: "已過團體凍結時間，請明確確認已核對臨時變更。",
  volunteer_terms_consent_required: "需要義工本人先同意目的場次的條款，職員不能代為同意。",
  overlapping_duty: "義工在目的時段已有重疊當值。",
  capacity_full: "目的場次名額已滿。",
  registration_not_reschedulable: "此報名已有出席事實、已開始或不可改期。",
  duplicate_group_request: "此團體已在該場次提出申請。",
  group_headcount_out_of_range: "團體人數超出政策範圍。",
};
export function createOperationHandlers(deps: {
  authenticate: (request: Request) => Promise<string>;
  execute: (actor: string, command: OperationCommand) => Promise<OperationResult>;
  verify?: (token: string | undefined, request: Request) => Promise<boolean>;
}) {
  const service = createOperationService(deps.execute);
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } });
  return {
    async POST(request: Request) {
      try {
        const actor = await deps.authenticate(request);
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "無效的要求內容" }, 400);
        }
        if (deps.verify) {
          const form = envelope.parse(raw);
          raw = form.command;
          if (
            (raw as { action?: unknown } | null)?.action !== "list" &&
            !(await deps.verify(form.turnstileToken, request))
          )
            return json({ error: "請完成驗證" }, 403);
        }
        const result = await service.command(actor, raw);
        const status =
          result.kind === "conflict"
            ? 409
            : result.kind === "denied"
              ? 422
              : result.kind === "not_found"
                ? 404
                : 200;
        return json(
          status === 200
            ? result
            : {
                ...result,
                error:
                  result.kind === "conflict"
                    ? "資料已更新，請重新預覽。"
                    : (messages[result.reason ?? ""] ?? "不能套用此變更，請核對現行政策與名單。"),
              },
          status,
        );
      } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError)
          return json({ error: "請檢查團體或改期欄位", issues: error.issues }, 400);
        if (typeof error === "object" && error && "code" in error) {
          if (error.code === "42501") return json({ error: "沒有此操作權限" }, 403);
          if (error.code === "22023")
            return json({ error: "此變更不符合現行政策，請重新預覽" }, 422);
        }
        console.error("Volunteer operation failed", error);
        return json({ error: "未能處理，請稍後重試" }, 500);
      }
    },
  };
}
