import { animalReviewSelectionErrorText } from "../../../lib/contentReview/animalBulkSelection";
import { cmsReviewSelectionErrorText } from "../../../lib/contentReview/cmsBulkSelection";
import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";

/**
 * Copy for the source review of content and animal records: the review panel on a saved version
 * (used in the content editor and in the animal form), the review queue, and the two bulk
 * panels that send drafts for review. The bulk preview and result tables the panels open are in
 * `bulk/copy.ts`. The messages for a refused selection are written once, in the two
 * `lib/contentReview` selection modules, and read from there.
 */
export const reviewCopy = defineAdminCopy({
  zh: {
    /** The label of each classification in a select and in the queue. */
    classifications: {
      approved: "已核實可發布",
      demo: "示範資料（不可發布）",
      needs_review: "待核實",
    },
    panel: {
      legend: "此已儲存版本的來源審核",
      intro: "只按已核實來源分類。示範資料及未核實資料不可發布；每次儲存新版本均須重新審核。",
      classification: "分類",
      evidence: "核實來源及理由",
      record: "記錄此版本審核",
      recorded: "此版本的審核已記錄。公開內容尚未改動。",
      failed: "未能記錄；版本可能已變更，請重新載入後審核。",
    },
    queue: {
      summary: "內容來源審核佇列",
      intro:
        "分類不會自動撤下現有公開內容。示範內容須先列明記錄、原因及建議處理，再取得內容負責人批准。",
      kindLabel: "資料類型",
      kinds: { content: "宣傳內容", animal: "動物資料" },
      qualityLabel: "品質隊列",
      qualities: {
        all: "全部內容",
        demo: "示範內容",
        expired: "已過期內容",
        missing_source: "缺來源內容",
      },
      qualityNote: "品質隊列供逐項核實；批量草稿送審請返回「全部內容」。",
      loadFailed: "未能載入審核佇列。",
      retry: "重試",
      selectPage: "選取本頁",
      selectAll: (kind: "animal" | "content") =>
        `選取全部符合篩選的${kind === "animal" ? "動物資料" : "宣傳內容"}（最多 1000 筆）`,
      clear: "清除選取",
      collecting: "正在固定選取範圍…",
      selectRow: (kind: "animal" | "content") => `選取此${kind === "animal" ? "動物" : "CMS"}草稿`,
      rowTitle: (title: string, classification: string) => `${title} · ${classification}`,
      notes: {
        suggestUnpublish: " · 建議暫停公開（待授權）",
        demoPending: " · 示範內容待處理",
        expired: " · 有效期已過",
        missingSource: " · 來源未記錄",
      },
      open: "開啟及核實來源",
      pager: "審核資料",
      /** Why a selection could not be made, by the code the queue keeps. */
      selectionErrors: {
        select_failed: "無法選取",
        filter_changed: "篩選已變更；請重新選取",
        collect_failed: "無法固定選取範圍",
        content: {
          out_of_range: cmsReviewSelectionErrorText("out_of_range", "zh"),
          list_changed: cmsReviewSelectionErrorText("list_changed", "zh"),
          too_many: cmsReviewSelectionErrorText("too_many", "zh"),
        },
        animal: {
          out_of_range: animalReviewSelectionErrorText("out_of_range", "zh"),
          list_changed: animalReviewSelectionErrorText("list_changed", "zh"),
          too_many: animalReviewSelectionErrorText("too_many", "zh"),
        },
      },
    },
    bulk: {
      evidenceLabel: "送審來源及理由",
      selected: (count: number) => `已選 ${count} 筆（最多 1000）`,
      processing: "處理中…",
      preview: "建立送審預覽",
      reload: "重新讀取結果",
      reason: (evidence: string) => `本次理由：${evidence}`,
      /** A draft's classification before and after a bulk review. */
      states: { needs_review: "待核實", approved: "已核實", demo: "示範資料", other: "未分類" },
      cms: {
        panelLabel: "CMS 草稿批量送審",
        heading: "批量送交 CMS 草稿來源審核",
        intro:
          "只為未公開、未分類的已儲存草稿建立待核實記錄；不修改公開狀態、媒體或內容正文。 套用時逐筆重查職員權限、草稿版本及現有分類。",
        title: (count: number) => `CMS 草稿送審 · ${count} 筆`,
      },
      animal: {
        panelLabel: "動物草稿批量送審",
        heading: "批量送交動物草稿來源審核",
        intro:
          "只為未公開、未分類的已儲存草稿建立待核實記錄；不修改公開狀態、照片或動物配對。 套用時逐筆重查職員權限、草稿版本及現有分類。",
        title: (count: number) => `動物草稿送審 · ${count} 筆`,
      },
      /** The message for each way the panel can fail, by the code the panel keeps. */
      errors: {
        restore_failed: "未能讀取已保存的操作，請重新讀取結果。",
        reload_failed: "未能讀取已保存的操作，請稍後重新讀取結果。",
        preview_failed: "無法建立送審預覽",
        apply_failed: "無法套用；請重新讀取結果",
      },
    },
  },
  en: {
    classifications: {
      approved: "Verified and publishable",
      demo: "Demo data (cannot be published)",
      needs_review: "Awaiting verification",
    },
    panel: {
      legend: "Source review of this saved version",
      intro:
        "Classify the version only by verified sources. Demo data and unverified data cannot be published. Every new saved version must be reviewed again.",
      classification: "Classification",
      evidence: "Verified source and reason",
      record: "Record review of this version",
      recorded: "The review of this version is recorded. Public content has not changed.",
      failed:
        "Could not record the review. The version may have changed. Reload the page, then review again.",
    },
    queue: {
      summary: "Content source review queue",
      intro:
        "Classifying does not take down existing public content automatically. For demo content, first list the records, the reason and the proposed action, then get the content owner's approval.",
      kindLabel: "Record type",
      kinds: { content: "Content", animal: "Animal records" },
      qualityLabel: "Quality queue",
      qualities: {
        all: "All content",
        demo: "Demo content",
        expired: "Expired content",
        missing_source: "Content missing a source",
      },
      qualityNote:
        'The quality queue is for checking items one by one. To send drafts for review in bulk, go back to "All content".',
      loadFailed: "Could not load the review queue. Select Retry or refresh the page.",
      retry: "Retry",
      selectPage: "Select this page",
      selectAll: (kind: "animal" | "content") =>
        `Select all matching ${kind === "animal" ? "animal records" : "content"} (up to ${formatAdminNumber(1000, "en")})`,
      clear: "Clear selection",
      collecting: "Collecting the selection…",
      selectRow: (kind: "animal" | "content") =>
        `Select this ${kind === "animal" ? "animal" : "CMS"} draft`,
      rowTitle: (title: string, classification: string) => `${title} · ${classification}`,
      notes: {
        suggestUnpublish: " · Suggested to unpublish (needs authorisation)",
        demoPending: " · Demo content awaiting action",
        expired: " · Validity has expired",
        missingSource: " · Source not recorded",
      },
      open: "Open and verify the source",
      pager: "Review records",
      selectionErrors: {
        select_failed: "Could not select. Try again.",
        filter_changed: "The filter changed. Select again.",
        collect_failed: "Could not collect the selection. Try again.",
        content: {
          out_of_range: cmsReviewSelectionErrorText("out_of_range", "en"),
          list_changed: cmsReviewSelectionErrorText("list_changed", "en"),
          too_many: cmsReviewSelectionErrorText("too_many", "en"),
        },
        animal: {
          out_of_range: animalReviewSelectionErrorText("out_of_range", "en"),
          list_changed: animalReviewSelectionErrorText("list_changed", "en"),
          too_many: animalReviewSelectionErrorText("too_many", "en"),
        },
      },
    },
    bulk: {
      evidenceLabel: "Source and reason for review",
      selected: (count: number) =>
        `${formatAdminNumber(count, "en")} selected (up to ${formatAdminNumber(1000, "en")})`,
      processing: "Processing…",
      preview: "Preview submission",
      reload: "Reload result",
      reason: (evidence: string) => `Reason for this submission: ${evidence}`,
      states: {
        needs_review: "Awaiting verification",
        approved: "Verified",
        demo: "Demo data",
        other: "Unclassified",
      },
      cms: {
        panelLabel: "Bulk source review of CMS drafts",
        heading: "Send CMS drafts for source review in bulk",
        intro:
          "This only creates awaiting-verification records for saved drafts that are not public and not yet classified. It does not change public status, media or body text. When you apply, the staff permission, draft version and current classification are checked again for each draft.",
        title: (count: number) => `CMS drafts for review · ${pluralCount(count, "draft")}`,
      },
      animal: {
        panelLabel: "Bulk source review of animal drafts",
        heading: "Send animal drafts for source review in bulk",
        intro:
          "This only creates awaiting-verification records for saved drafts that are not public and not yet classified. It does not change public status, photos or animal matches. When you apply, the staff permission, draft version and current classification are checked again for each draft.",
        title: (count: number) => `Animal drafts for review · ${pluralCount(count, "draft")}`,
      },
      errors: {
        restore_failed: "Could not load the saved operation. Select Reload result to try again.",
        reload_failed:
          "Could not load the saved operation. Wait a moment, then select Reload result.",
        preview_failed: "Could not create the preview. Try again.",
        apply_failed:
          "Could not apply the submission. Select Reload result to check the current state.",
      },
    },
  },
});
