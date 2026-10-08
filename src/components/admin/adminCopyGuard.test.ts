import { describe, expect, test } from "bun:test";
import { findChineseRuns } from "./i18n/testing";

/**
 * The admin back office is shown in Chinese or English, so interface text must live in a
 * bilingual copy module (`copy.ts` or `*Copy.ts`, built with `defineAdminCopy`), where
 * `tsc` rejects a missing translation. This guard fails when Chinese text turns up
 * anywhere else under `src/components/admin` or `src/routes/admin`.
 *
 * It is a ratchet. `ADMIN_COPY_PENDING` lists the files that have not been migrated yet.
 * Each area task of the English-admin project deletes its own files from the list; a
 * file that no longer has Chinese must leave the list, so it only ever shrinks. New files
 * are not allowed on it.
 *
 * Chinese that is not interface text, such as a parsing pattern or a data constant, is
 * allowed on a line that carries `admin-copy-exempt: <reason>` in a comment, and on the
 * line below a comment-only line that carries it. The reason is required.
 */

export const ADMIN_COPY_PENDING: readonly string[] = [
  "src/components/admin/VolunteerAdminShell.tsx",
  "src/components/admin/content/AboutPagesManagement.tsx",
  "src/components/admin/content/AdoptionGuideReleaseManagement.tsx",
  "src/components/admin/content/AdoptionInformationManagement.tsx",
  "src/components/admin/content/AdoptionInstructionsManagement.tsx",
  "src/components/admin/content/AdoptionRulesManagement.tsx",
  "src/components/admin/content/AnimalReviewBulkPanel.tsx",
  "src/components/admin/content/AnnualReportManagement.tsx",
  "src/components/admin/content/CareTopicsManagement.tsx",
  "src/components/admin/content/CmsReviewBulkPanel.tsx",
  "src/components/admin/content/ContentCreateForm.tsx",
  "src/components/admin/content/ContentEditor.tsx",
  "src/components/admin/content/ContentManagement.tsx",
  "src/components/admin/content/ContentReview.tsx",
  "src/components/admin/content/ContentRevisionPanel.tsx",
  "src/components/admin/content/ContentTimeline.tsx",
  "src/components/admin/content/DocumentManagement.tsx",
  "src/components/admin/content/FaqAnswerTester.tsx",
  "src/components/admin/content/FaqManagement.tsx",
  "src/components/admin/content/FaqSearchGapsReport.tsx",
  "src/components/admin/content/GovernanceManagement.tsx",
  "src/components/admin/content/KnowledgeManagement.tsx",
  "src/components/admin/content/LinkedRecordPicker.tsx",
  "src/components/admin/content/NotificationDraftPanel.tsx",
  "src/components/admin/content/PaymentMethodsManagement.tsx",
  "src/components/admin/content/SocialCopyPanel.tsx",
  "src/components/admin/content/adoptionGuideReleaseLogic.ts",
  "src/components/admin/content/cmsStateLabels.ts",
  "src/components/admin/content/contentAdminLogic.ts",
  "src/components/admin/content/contentMediaUpload.ts",
  "src/components/admin/content/documentUpload.ts",
  "src/components/admin/content/editorState.ts",
  "src/components/admin/crm/ConsentEditor.tsx",
  "src/components/admin/crm/CrmAssignmentBulkPanel.tsx",
  "src/components/admin/crm/CrmContactFormatPreviewPanel.tsx",
  "src/components/admin/crm/CrmTagBulkPanel.tsx",
  "src/components/admin/crm/DonationDeliveryAction.tsx",
  "src/components/admin/crm/ExportBar.tsx",
  "src/components/admin/crm/ManualDonationDialog.tsx",
  "src/components/admin/crm/ManualGiftOutcome.tsx",
  "src/components/admin/crm/SupporterActivitySummary.tsx",
  "src/components/admin/crm/SupporterDetail.tsx",
  "src/components/admin/crm/SupporterFormDialog.tsx",
  "src/components/admin/crm/SupporterList.tsx",
  "src/components/admin/crm/SupporterProfileSidebar.tsx",
  "src/components/admin/crm/SupporterTimeline.tsx",
  "src/components/admin/crm/exportFailure.ts",
  "src/components/admin/crm/supporterTimelineFilters.ts",
  "src/components/admin/donations/BankMatchOperationReview.tsx",
  "src/components/admin/donations/BankStatementDryRunPanel.tsx",
  "src/components/admin/donations/DonationDeliveryWorklist.tsx",
  "src/components/admin/donations/PaymentsReconcile.tsx",
  "src/components/admin/donations/ReconcileDialog.tsx",
  "src/components/admin/donations/paymentsReconcileLogic.ts",
  "src/components/admin/internships/InternshipManagement.tsx",
  "src/components/admin/sponsorship/AnimalPicker.tsx",
  "src/components/admin/sponsorship/FinancePanel.tsx",
  "src/components/admin/sponsorship/PledgeDetailDrawer.tsx",
  "src/components/admin/sponsorship/PledgeReviewLane.tsx",
  "src/components/admin/sponsorship/ReminderDraftPanel.tsx",
  "src/components/admin/sponsorship/SponsorshipFollowupBulkPanel.tsx",
  "src/components/admin/sponsorship/pledgeReviewLogic.ts",
  "src/components/admin/volunteerWorkspace.ts",
  "src/components/admin/volunteers/ActivitySchedule.tsx",
  "src/components/admin/volunteers/GroupEnquiryManagement.tsx",
  "src/components/admin/volunteers/PolicyAdvancedFields.tsx",
  "src/components/admin/volunteers/PolicyChangeSummary.tsx",
  "src/components/admin/volunteers/PolicySourceFields.tsx",
  "src/components/admin/volunteers/QualificationProfileSearch.tsx",
  "src/components/admin/volunteers/VolunteerActivityWorkspace.tsx",
  "src/components/admin/volunteers/VolunteerDailySettings.tsx",
  "src/components/admin/volunteers/VolunteerDirectory.tsx",
  "src/components/admin/volunteers/VolunteerDraftForm.tsx",
  "src/components/admin/volunteers/VolunteerLegacyReconciliation.tsx",
  "src/components/admin/volunteers/VolunteerManagement.tsx",
  "src/components/admin/volunteers/VolunteerOperations.tsx",
  "src/components/admin/volunteers/VolunteerOverview.tsx",
  "src/components/admin/volunteers/VolunteerPersonDetail.tsx",
  "src/components/admin/volunteers/VolunteerPolicySettings.tsx",
  "src/components/admin/volunteers/VolunteerPolicySimulation.tsx",
  "src/components/admin/volunteers/VolunteerPolicySources.tsx",
  "src/components/admin/volunteers/VolunteerQualifications.tsx",
  "src/components/admin/volunteers/VolunteerRegistrationDetail.tsx",
  "src/components/admin/volunteers/VolunteerReviewBulkPanel.tsx",
  "src/components/admin/volunteers/VolunteerTasks.tsx",
  "src/components/admin/volunteers/WorkflowSections.tsx",
  "src/components/admin/volunteers/directorySearch.ts",
  "src/components/admin/volunteers/groupEnquiryAdminLogic.ts",
  "src/components/admin/volunteers/useUnsavedVolunteerDraft.ts",
  "src/components/admin/volunteers/volunteerAdminLogic.ts",
  "src/routes/admin/content/adoption-preview.tsx",
  "src/routes/admin/sponsorships.tsx",
  "src/routes/admin/volunteers/assessments.tsx",
  "src/routes/admin/volunteers/people.tsx",
  "src/routes/admin/volunteers/people/$id.tsx",
];

const EXEMPTION_MARKER = /admin-copy-exempt:\s*\S/;
/** A line that is only a comment, so a marker on it can cover the line below. */
const COMMENT_ONLY_LINE = /^\s*(\/\/|\/\*|\*|\{\/\*)/;

const ADMIN_SOURCE_GLOBS = ["src/routes/admin/**/*.{ts,tsx}", "src/components/admin/**/*.{ts,tsx}"];

export type SourceFile = { path: string; text: string };

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function isTestFile(path: string): boolean {
  return path.includes(".test.");
}

/**
 * Files named like a copy module that hold helpers, not copy. `i18n/copy.ts` is the
 * entry point for `defineAdminCopy` and the hooks, so the guard scans it like any other
 * file and it needs no `defineAdminCopy(` call.
 */
const COPY_HELPER_FILES: ReadonlySet<string> = new Set(["src/components/admin/i18n/copy.ts"]);

/** Copy modules are where both languages are meant to be written out. */
export function isCopyModule(path: string): boolean {
  if (COPY_HELPER_FILES.has(path)) return false;
  const name = fileName(path);
  return name === "copy.ts" || name.endsWith("Copy.ts");
}

/**
 * True when `text` calls `defineAdminCopy`, with or without type arguments. Comments are
 * removed first, so a mention in a comment does not count, and so does an `import`.
 */
export function callsDefineAdminCopy(text: string): boolean {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  return /\bdefineAdminCopy\s*(?:<[^()]*>)?\s*\(/.test(code);
}

/** A file the guard checks: admin source that is neither a test nor a copy module. */
export function isScanned(path: string): boolean {
  return !isTestFile(path) && !isCopyModule(path);
}

/** 1-based numbers of the lines that have Chinese and no exemption marker. */
function uncoveredLines(text: string): number[] {
  const lines = text.split(/\r?\n/);
  const found: number[] = [];
  lines.forEach((line, index) => {
    if (findChineseRuns(line).length === 0) return;
    const above = index > 0 ? lines[index - 1] : "";
    const exempt =
      EXEMPTION_MARKER.test(line) ||
      (COMMENT_ONLY_LINE.test(above) && EXEMPTION_MARKER.test(above));
    if (!exempt) found.push(index + 1);
  });
  return found;
}

/**
 * `path:line` for every line with unexempted Chinese in a scanned file that is not on the
 * pending list.
 */
export function findUncoveredChinese(
  files: readonly SourceFile[],
  pending: readonly string[],
): string[] {
  const pendingPaths = new Set(pending);
  const hits: string[] = [];
  for (const file of files) {
    if (!isScanned(file.path) || pendingPaths.has(file.path)) continue;
    for (const line of uncoveredLines(file.text)) hits.push(`${file.path}:${line}`);
  }
  return hits;
}

/**
 * Pending paths that no longer belong on the list: the file is gone, is not scanned, or
 * has no unexempted Chinese left.
 */
export function findStalePending(
  files: readonly SourceFile[],
  pending: readonly string[],
): string[] {
  const scanned = new Map(files.filter((file) => isScanned(file.path)).map((f) => [f.path, f]));
  return pending.filter((path) => {
    const file = scanned.get(path);
    return !file || uncoveredLines(file.text).length === 0;
  });
}

async function adminSourceFiles(): Promise<SourceFile[]> {
  const paths = (
    await Promise.all(
      ADMIN_SOURCE_GLOBS.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan("."))),
    )
  )
    .flat()
    .map((path) => path.split("\\").join("/"))
    .sort();
  return Promise.all(paths.map(async (path) => ({ path, text: await Bun.file(path).text() })));
}

describe("admin copy guard", () => {
  test("admin code has no Chinese outside copy modules, except pending files", async () => {
    const hits = findUncoveredChinese(await adminSourceFiles(), ADMIN_COPY_PENDING);
    expect(
      hits,
      "Move this text into a bilingual copy module (copy.ts or *Copy.ts, using defineAdminCopy), " +
        "or mark text that is not interface text with `// admin-copy-exempt: <reason>`.",
    ).toEqual([]);
  });

  test("every pending file still contains Chinese", async () => {
    const stale = findStalePending(await adminSourceFiles(), ADMIN_COPY_PENDING);
    expect(
      stale,
      "These files are on ADMIN_COPY_PENDING but no longer need to be. Delete them from the list.",
    ).toEqual([]);
  });

  test("every copy module is built with defineAdminCopy", async () => {
    // The guard does not read copy modules, so a plain-object `Copy.ts` would escape both
    // the guard and the tsc check that the two languages have the same keys.
    const modules = (await adminSourceFiles()).filter(
      (file) => !isTestFile(file.path) && isCopyModule(file.path),
    );
    expect(modules.length).toBeGreaterThanOrEqual(2);
    expect(
      modules.filter((file) => !callsDefineAdminCopy(file.text)).map((file) => file.path),
      "These copy modules do not call defineAdminCopy(), so tsc cannot check that en matches zh. Build them with defineAdminCopy({ zh, en }).",
    ).toEqual([]);
  });

  test("the scan sees the whole admin tree", async () => {
    const files = (await adminSourceFiles()).filter((file) => isScanned(file.path));
    // If the glob ever returns nothing, the checks above pass vacuously.
    expect(files.length).toBeGreaterThanOrEqual(150);
    expect(files.some((file) => file.path.startsWith("src/routes/admin/"))).toBe(true);
    expect(files.some((file) => file.path.startsWith("src/components/admin/"))).toBe(true);
  });

  test("the pending list is sorted, has no duplicates and names scanned admin files", () => {
    expect([...ADMIN_COPY_PENDING]).toEqual([...new Set(ADMIN_COPY_PENDING)].sort());
    for (const path of ADMIN_COPY_PENDING) {
      expect(path, path).toMatch(/^src\/(components|routes)\/admin\/.+\.tsx?$/);
      expect(isScanned(path), path).toBe(true);
    }
  });
});

describe("findUncoveredChinese", () => {
  const withChinese = 'export const label = "儲存";\n';

  test("the guard reports a new file with hard-coded Chinese", () => {
    const files: SourceFile[] = [
      { path: "src/components/admin/NewThing.tsx", text: `import x from "x";\n${withChinese}` },
      { path: "src/components/admin/Clean.tsx", text: 'export const label = "Save";\n' },
    ];
    expect(findUncoveredChinese(files, [])).toEqual(["src/components/admin/NewThing.tsx:2"]);
  });

  test("does not report a file on the pending list", () => {
    const files: SourceFile[] = [{ path: "src/components/admin/Old.tsx", text: withChinese }];
    expect(findUncoveredChinese(files, ["src/components/admin/Old.tsx"])).toEqual([]);
  });

  test("does not report a line that carries the exemption marker", () => {
    const text = [
      'const a = "年"; // admin-copy-exempt: date unit',
      "const gap = 1;",
      'const b = "月";',
      "",
    ].join("\n");
    expect(findUncoveredChinese([{ path: "src/routes/admin/x.ts", text }], [])).toEqual([
      "src/routes/admin/x.ts:3",
    ]);
  });

  test("does not report the line after a marker comment, but only that line", () => {
    const text = [
      "// admin-copy-exempt: matches the legacy CSV header",
      'const header = "姓名";',
      'const other = "電話";',
      "",
    ].join("\n");
    expect(findUncoveredChinese([{ path: "src/routes/admin/x.ts", text }], [])).toEqual([
      "src/routes/admin/x.ts:3",
    ]);
  });

  test("a marker at the end of a line of code does not cover the next line", () => {
    const text = ['const a = "年"; // admin-copy-exempt: date unit', 'const b = "月";', ""].join(
      "\n",
    );
    expect(findUncoveredChinese([{ path: "src/routes/admin/x.ts", text }], [])).toEqual([
      "src/routes/admin/x.ts:2",
    ]);
  });

  test("requires a reason after the marker", () => {
    const text = 'const a = "年"; // admin-copy-exempt:\n';
    expect(findUncoveredChinese([{ path: "src/routes/admin/x.ts", text }], [])).toEqual([
      "src/routes/admin/x.ts:1",
    ]);
  });

  test("accepts the marker inside a JSX comment", () => {
    const text = "{/* admin-copy-exempt: fixture name */}\n<p>小白</p>\n";
    expect(findUncoveredChinese([{ path: "src/routes/admin/x.tsx", text }], [])).toEqual([]);
  });

  test("reports Chinese in a comment, and Chinese punctuation", () => {
    const text = '// 備註\nconst a = "Done。";\n';
    expect(findUncoveredChinese([{ path: "src/routes/admin/x.ts", text }], [])).toEqual([
      "src/routes/admin/x.ts:1",
      "src/routes/admin/x.ts:2",
    ]);
  });

  test("skips copy modules and test files", () => {
    const files: SourceFile[] = [
      { path: "src/components/admin/crm/copy.ts", text: withChinese },
      { path: "src/components/admin/adminPageCopy.ts", text: withChinese },
      { path: "src/components/admin/crm/Thing.test.tsx", text: withChinese },
    ];
    expect(findUncoveredChinese(files, [])).toEqual([]);
  });

  test("does not skip a file that only looks like a copy module", () => {
    const files: SourceFile[] = [
      { path: "src/components/admin/crm/copycat.ts", text: withChinese },
      { path: "src/components/admin/crm/Copy.tsx", text: withChinese },
    ];
    expect(findUncoveredChinese(files, [])).toHaveLength(2);
  });

  test("scans the copy helpers and the copy-module helper files", () => {
    expect(isCopyModule("src/components/admin/i18n/copy.ts")).toBe(false);
    expect(isCopyModule("src/components/admin/i18n/copyModule.ts")).toBe(false);
    expect(isCopyModule("src/components/admin/i18n/adminCommonCopy.ts")).toBe(true);
    expect(isCopyModule("src/components/admin/adminPageCopy.ts")).toBe(true);
    expect(isCopyModule("src/components/admin/crm/copy.ts")).toBe(true);
    const files: SourceFile[] = [{ path: "src/components/admin/i18n/copy.ts", text: withChinese }];
    expect(findUncoveredChinese(files, [])).toEqual(["src/components/admin/i18n/copy.ts:1"]);
  });
});

describe("callsDefineAdminCopy", () => {
  test("accepts a plain call and a call with type arguments", () => {
    expect(callsDefineAdminCopy("export const a = defineAdminCopy({ zh: {}, en: {} });")).toBe(
      true,
    );
    expect(callsDefineAdminCopy("export const a = defineAdminCopy<Copy>({ zh, en });")).toBe(true);
    expect(callsDefineAdminCopy("defineAdminCopy<Record<A, B>>(\n  { zh, en })")).toBe(true);
  });

  test("rejects a plain object, an import and a mention in a comment", () => {
    expect(callsDefineAdminCopy("export const a = { zh: {}, en: {} } as const;")).toBe(false);
    expect(callsDefineAdminCopy('import { defineAdminCopy } from "./copy";')).toBe(false);
    expect(
      callsDefineAdminCopy("// build this with defineAdminCopy(...)\nexport const a = {};"),
    ).toBe(false);
    expect(callsDefineAdminCopy("/* defineAdminCopy( */ export const a = {};")).toBe(false);
  });
});

describe("findStalePending", () => {
  test("names pending files that are clean, exempt, missing or not scanned", () => {
    const files: SourceFile[] = [
      { path: "src/components/admin/Done.tsx", text: 'export const label = "Save";\n' },
      {
        path: "src/components/admin/OnlyExempt.tsx",
        text: 'const a = "年"; // admin-copy-exempt: date unit\n',
      },
      { path: "src/components/admin/Still.tsx", text: 'export const label = "儲存";\n' },
      { path: "src/components/admin/crm/copy.ts", text: 'export const label = "儲存";\n' },
    ];
    const pending = [
      "src/components/admin/Done.tsx",
      "src/components/admin/Gone.tsx",
      "src/components/admin/OnlyExempt.tsx",
      "src/components/admin/Still.tsx",
      "src/components/admin/crm/copy.ts",
    ];
    expect(findStalePending(files, pending)).toEqual([
      "src/components/admin/Done.tsx",
      "src/components/admin/Gone.tsx",
      "src/components/admin/OnlyExempt.tsx",
      "src/components/admin/crm/copy.ts",
    ]);
  });
});
