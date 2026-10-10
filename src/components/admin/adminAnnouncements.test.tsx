import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { BulkReview } from "./bulk/BulkReview";
import { DataTable } from "./DataTable";
import { focusPageHeading } from "./focusPageHeading";
import { TablePager } from "./TablePager";

/**
 * Admin screens announce changes to a screen reader:
 *  - a result count sits in `aria-live="polite"` with `aria-atomic="true"`, so the whole
 *    phrase ("12 supporters") is read, not only the digits that changed;
 *  - a failure that appears after the page is up is `role="alert"`;
 *  - a transient success ("Draft saved") is `role="status"`;
 *  - one element never has both roles.
 */

const LIVE_COUNT =
  /aria-live="polite"[^>]*aria-atomic="true"|aria-atomic="true"[^>]*aria-live="polite"/;

describe("result counts are live regions", () => {
  test("TablePager announces its range as one phrase", () => {
    const markup = renderToStaticMarkup(
      <TablePager page={2} pageSize={25} total={100} onPageChange={() => {}} />,
    );
    const region = /<p[^>]*>([^<]*)<\/p>/.exec(markup);
    expect(region?.[0]).toMatch(LIVE_COUNT);
    expect(region?.[1]).toContain("100");
  });

  test("DataTable puts a supplied result count in a live region", () => {
    const markup = renderToStaticMarkup(
      <DataTable
        columns={[{ id: "a", header: "A", cell: (row: { id: string }) => row.id }]}
        rows={[{ id: "r1" }]}
        getRowKey={(row) => row.id}
        resultCount="1 record"
      />,
    );
    const region = /<p[^>]*>1 record<\/p>/.exec(markup);
    expect(region?.[0]).toMatch(LIVE_COUNT);
  });

  test("DataTable without a count renders no live region", () => {
    const markup = renderToStaticMarkup(
      <DataTable
        columns={[{ id: "a", header: "A", cell: (row: { id: string }) => row.id }]}
        rows={[{ id: "r1" }]}
        getRowKey={(row) => row.id}
      />,
    );
    expect(markup).not.toContain("aria-live");
  });

  test("the bulk preview count is a live region", () => {
    const markup = renderToStaticMarkup(
      <BulkReview
        title="Preview"
        operationId="op-1"
        expiresAt="2099-01-01T00:00:00.000Z"
        items={[
          { entityId: "a", before: "x", after: "y", status: "pending", reasonCode: null },
          { entityId: "b", before: "x", after: "y", status: "skipped", reasonCode: "same" },
        ]}
        busy={false}
        onApply={() => {}}
      />,
    );
    const region = /<p[^>]*role="status"[^>]*>[^<]*<\/p>/.exec(markup);
    expect(region?.[0]).toMatch(LIVE_COUNT);
  });
});

type TagSite = {
  file: string;
  /** The tag that ends just before the first match of this pattern. */
  before?: RegExp;
  /** The first tag that starts at or after the end of the first match of this pattern. */
  after?: RegExp;
};

/** Index and text of every opening tag in `text`, with braces and strings respected. */
function openingTags(text: string): { start: number; end: number; tag: string }[] {
  const tags: { start: number; end: number; tag: string }[] = [];
  for (const match of text.matchAll(/<([A-Za-z][\w.]*)(?=[\s>/])/g)) {
    const start = match.index ?? 0;
    let depth = 0;
    let quote: string | null = null;
    let end = text.length;
    for (let i = start; i < text.length; i += 1) {
      const char = text[i];
      if (quote) {
        if (char === "\\") i += 1;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0 && text[i - 1] !== "=") {
        end = i + 1;
        break;
      }
    }
    tags.push({ start, end, tag: text.slice(start, end) });
  }
  return tags;
}

async function tagAt(site: TagSite): Promise<string> {
  const text = await Bun.file(site.file).text();
  const tags = openingTags(text);
  if (site.before) {
    const hit = site.before.exec(text);
    if (!hit) throw new Error(`${site.file}: ${site.before} not found`);
    const earlier = tags.filter((tag) => tag.end <= hit.index);
    return earlier[earlier.length - 1]?.tag ?? "";
  }
  if (site.after) {
    const hit = site.after.exec(text);
    if (!hit) throw new Error(`${site.file}: ${site.after} not found`);
    const limit = hit.index + hit[0].length;
    return tags.find((tag) => tag.start >= limit)?.tag ?? "";
  }
  throw new Error("a site needs `before` or `after`");
}

const ADMIN = "src/components/admin/";

const LIVE_SITES: TagSite[] = [
  { file: `${ADMIN}adoptions/AdopterList.tsx`, before: /pageCopy\.common\.totalCount\(total\)/ },
  { file: `${ADMIN}adoptions/CaseList.tsx`, before: /pageCopy\.common\.totalCount\(total\)/ },
  {
    file: `${ADMIN}adoptions/CoordinatorReports.tsx`,
    before: /pageCopy\.common\.totalRecords\(total\)/,
  },
  { file: `${ADMIN}adoptions/IntakeInbox.tsx`, before: /pageCopy\.common\.totalCount\(total\)/ },
  { file: `${ADMIN}sponsorship/PledgeReviewLane.tsx`, before: /copy\.totalCount\(total\)/ },
  { file: `${ADMIN}adoptions/StatusAdmin.tsx`, before: /pageCopy\.common\.rowsCount\(/ },
  { file: `${ADMIN}adoptions/TaskPanel.tsx`, before: /pageCopy\.common\.scheduledOrCompleted\(/ },
  { file: `${ADMIN}adoptions/ManualCaseIntake.tsx`, before: /pageCopy\.common\.searchMatches\(/ },
  {
    file: `${ADMIN}adoptions/AnimalPipeline.tsx`,
    before: /(?=<Badge[^>]*>\s*\{copy\.counts\.shown)/,
  },
  // Bulk "N selected" counts.
  { file: `${ADMIN}adoptions/AdoptionAssignmentBulkPanel.tsx`, before: /copy\.selectedCount\(/ },
  { file: `${ADMIN}crm/CrmAssignmentBulkPanel.tsx`, before: /copy\.selectedCount\(/ },
  { file: `${ADMIN}crm/CrmContactFormatPreviewPanel.tsx`, before: /copy\.selectedCount\(/ },
  { file: `${ADMIN}crm/CrmTagBulkPanel.tsx`, before: /copy\.selectedCount\(/ },
  { file: `${ADMIN}sponsorship/SponsorshipFollowupBulkPanel.tsx`, before: /copy\.selectedCount\(/ },
  { file: `${ADMIN}content/CmsReviewBulkPanel.tsx`, before: /copy\.selected\(selectedIds/ },
  { file: `${ADMIN}content/AnimalReviewBulkPanel.tsx`, before: /copy\.selected\(selectedIds/ },
  {
    file: `${ADMIN}volunteers/VolunteerReviewBulkPanel.tsx`,
    before: /copy\.selected\(selectedIds/,
  },
];

const ALERT_SITES: TagSite[] = [
  { file: `${ADMIN}AnimalForm.tsx`, before: /\{errors\.name\.message\}/ },
  { file: `${ADMIN}AnimalForm.tsx`, before: /\{errors\.age\.message\}/ },
  { file: `${ADMIN}AnimalForm.tsx`, after: /message\?\.tone === "error" && \(\s*/ },
  {
    file: "src/routes/admin/content/adoption-preview.tsx",
    before: /\{copy\.failed\}\s*<\/p>[\s\S]{0,60}?return <AdoptionInstructionsContent/,
  },
  {
    file: `${ADMIN}crm/ConsentEditor.tsx`,
    before: /adminErrorMessage\(mutation\.error, language\)/,
  },
  {
    file: `${ADMIN}crm/ManualDonationDialog.tsx`,
    before: /adminErrorMessage\(mutation\.error, language\)/,
  },
  {
    file: `${ADMIN}crm/SupporterDetail.tsx`,
    before: /adminErrorMessage\(issueReceiptMutation\.error/,
  },
  { file: `${ADMIN}donations/PaymentsReconcile.tsx`, before: /\?\? copy\.exportFailed/ },
  { file: `${ADMIN}donations/PaymentsReconcile.tsx`, before: /\{actionError\}/ },
  {
    file: `${ADMIN}donations/ReconcileDialog.tsx`,
    before: /adminErrorMessage\(mutation\.error, language\)/,
  },
  { file: `${ADMIN}access/AccessManagement.tsx`, after: /\{error && \(\s*/ },
  { file: `${ADMIN}content/NotificationDraftPanel.tsx`, before: /common\.clipboardFailed\(/ },
  { file: `${ADMIN}content/SocialCopyPanel.tsx`, before: /common\.clipboardFailed\(/ },
  {
    file: `${ADMIN}volunteers/VolunteerPolicySettings.tsx`,
    after: /\{preview\.issues\.length > 0 && \(\s*/,
  },
  {
    file: `${ADMIN}content/ContentEditor.tsx`,
    after: /if \(visibleErrors\.length === 0\) return null;\s*return \(\s*/,
  },
];

const STATUS_SITES: TagSite[] = [
  { file: `${ADMIN}AnimalForm.tsx`, before: /message\?\.tone === "status" \? message\.text/ },
];

describe("announcements on the admin screens", () => {
  test.each(LIVE_SITES.map((site) => [`${site.file} ${site.before ?? site.after}`, site] as const))(
    "live count: %s",
    async (_name, site) => {
      expect(await tagAt(site)).toMatch(LIVE_COUNT);
    },
  );

  test.each(
    ALERT_SITES.map((site) => [`${site.file} ${site.before ?? site.after}`, site] as const),
  )("alert: %s", async (_name, site) => {
    expect(await tagAt(site)).toContain('role="alert"');
  });

  test.each(
    STATUS_SITES.map((site) => [`${site.file} ${site.before ?? site.after}`, site] as const),
  )("status: %s", async (_name, site) => {
    expect(await tagAt(site)).toContain('role="status"');
  });

  test("the animal form shows a saved draft in the success colour, never the error colour", async () => {
    const status = await tagAt(STATUS_SITES[0]);
    expect(status).toContain("--color-success");
    expect(status).not.toContain("--color-error");
    const alert = await tagAt({
      file: `${ADMIN}AnimalForm.tsx`,
      after: /message\?\.tone === "error" && \(\s*/,
    });
    expect(alert).toContain("--color-error");
    const source = await Bun.file(`${ADMIN}AnimalForm.tsx`).text();
    expect(source).toContain("setNotice(formCopy.draft.saved)");
    expect(source).not.toContain("setError(formCopy.draft.saved)");
  });

  test("no admin element has both role=alert and role=status (or a polite live region)", async () => {
    const paths = [
      ...(await Array.fromAsync(new Bun.Glob("src/components/admin/**/*.tsx").scan("."))),
      ...(await Array.fromAsync(new Bun.Glob("src/routes/admin/**/*.tsx").scan("."))),
    ].filter((path) => !path.includes(".test."));
    expect(paths.length).toBeGreaterThan(100);
    const both: string[] = [];
    for (const path of paths) {
      for (const { tag } of openingTags(await Bun.file(path).text())) {
        const alert = /role=("alert"|\{?"alert"\}?)/.test(tag);
        if (alert && (/role="status"/.test(tag) || /aria-live="polite"/.test(tag)))
          both.push(`${path}: ${tag.slice(0, 80)}`);
      }
    }
    expect(both).toEqual([]);
  });
});

type FakeHeading = {
  tabIndex: number;
  attributes: Set<string>;
  focused: number;
  hasAttribute: (name: string) => boolean;
  focus: () => void;
};

function fakeHeading(initial?: { tabindex: number }): FakeHeading {
  const attributes = new Set<string>(initial ? ["tabindex"] : []);
  return {
    tabIndex: initial ? initial.tabindex : -1,
    attributes,
    focused: 0,
    hasAttribute: (name) => attributes.has(name),
    focus() {
      this.focused += 1;
    },
  };
}

function fakeDocument(heading: FakeHeading | null) {
  const selectors: string[] = [];
  const doc = {
    querySelector(selector: string) {
      selectors.push(selector);
      return heading;
    },
  } as unknown as Pick<Document, "querySelector">;
  return { doc, selectors };
}

describe("focusPageHeading", () => {
  test("focuses the first h1 in main and makes it focusable first", () => {
    const heading = fakeHeading();
    const { doc, selectors } = fakeDocument(heading);
    expect(focusPageHeading(doc)).toBe(true);
    expect(selectors).toEqual(["main h1"]);
    expect(heading.tabIndex).toBe(-1);
    expect(heading.focused).toBe(1);
  });

  test("leaves a tabindex the page already set", () => {
    const heading = fakeHeading({ tabindex: 0 });
    const { doc } = fakeDocument(heading);
    expect(focusPageHeading(doc)).toBe(true);
    expect(heading.tabIndex).toBe(0);
    expect(heading.focused).toBe(1);
  });

  test("does nothing and reports it when the page has no h1", () => {
    const { doc } = fakeDocument(null);
    expect(focusPageHeading(doc)).toBe(false);
  });
});

describe("fix round 1", () => {
  test("adoption guide readiness is a polite status, never an alert", async () => {
    const path = `${ADMIN}content/AdoptionGuideReleaseManagement.tsx`;
    const source = await Bun.file(path).text();
    const from = source.indexOf("copy.sections.preview");
    const previewSection = source.slice(from, source.indexOf("</EditorSection>", from));
    expect(previewSection).not.toContain('role="alert"');
    const editorSection = source.slice(source.indexOf("function EditorSection"));
    expect(editorSection.slice(0, editorSection.indexOf("</section>"))).not.toContain(
      'role="alert"',
    );
    const wrapper = await tagAt({ file: path, before: /readiness && !readiness\.ready \? \(/ });
    expect(wrapper).toContain('role="status"');
    const list = await tagAt({ file: path, after: /readiness && !readiness\.ready \? \(\s*/ });
    expect(list).toStartWith("<ul");
    expect(list).not.toContain("role=");
    // The blocker and the summary list sit inside the one status wrapper.
    const block = /<div role="status"[^>]*>([\s\S]*?)\n\s*<\/div>\s*<\/EditorSection>/.exec(source);
    expect(block?.[1]).toContain("readiness.issues.map");
    expect(block?.[1]).toContain("workflow.blocker");
  });

  test("no source file references the undefined --color-danger token", async () => {
    const hits: string[] = [];
    for (const path of await Array.fromAsync(new Bun.Glob("src/**/*.{ts,tsx,css}").scan("."))) {
      if (path.includes(".test.")) continue;
      if ((await Bun.file(path).text()).includes("var(--color-danger)")) hits.push(path);
    }
    expect(hits).toEqual([]);
  });

  test("the animal form status region is always mounted and separate from the alert", async () => {
    const source = await Bun.file(`${ADMIN}AnimalForm.tsx`).text();
    expect(source).toContain('message?.tone === "status" ? message.text : ""');
    const status = await tagAt({
      file: `${ADMIN}AnimalForm.tsx`,
      before: /message\?\.tone === "status" \? message\.text/,
    });
    expect(status).toContain('role="status"');
    // A repeat preview clears the message first, so the same text is announced again.
    expect(source).toMatch(
      /async function previewDraft\(\) \{\s*if \(dirty \|\| saving\) return;[\s\S]*?setMessage\(null\);/,
    );
  });

  test("the policy publish issues share one alert container", async () => {
    const source = await Bun.file(`${ADMIN}volunteers/VolunteerPolicySettings.tsx`).text();
    const from = source.indexOf("preview.issues.length > 0");
    const block = source.slice(from, source.indexOf("PolicyChangeSummary", from));
    expect(block.match(/role="alert"/g)?.length).toBe(1);
    const issue = await tagAt({
      file: `${ADMIN}volunteers/VolunteerPolicySettings.tsx`,
      before: /copy\.publish\.issueLine\(/,
    });
    expect(issue).not.toContain("role=");
  });

  test("touching button rows have a gap", async () => {
    for (const [file, anchor] of [
      [`${ADMIN}content/FaqManagement.tsx`, /\{copy\.edit\}\s*<\/Button>/],
      [`${ADMIN}content/GovernanceManagement.tsx`, /\{copy\.table\.edit\}\s*<\/Button>/],
      [`${ADMIN}content/ContentEditor.tsx`, /\{copy\.conflict\.compare\}\s*<\/Button>/],
    ] as const) {
      const source = await Bun.file(file).text();
      const before = source.slice(0, anchor.exec(source)?.index ?? 0);
      const wrapper = /<div className="([^"]*)">(?![\s\S]*<div )/.exec(before.slice(-700));
      expect(wrapper?.[1], file).toContain("gap-2");
    }
  });

  test("main actions use the primary Button variant", async () => {
    for (const [file, label] of [
      [`${ADMIN}content/AdoptionInstructionsManagement.tsx`, "{copy.saveDraft}"],
      [`${ADMIN}content/AdoptionInstructionsManagement.tsx`, "{copy.publish}"],
      [`${ADMIN}content/AdoptionInformationManagement.tsx`, "{copy.leave.save}"],
      [`${ADMIN}content/KnowledgeManagement.tsx`, "{copy.save}"],
    ] as const) {
      const source = await Bun.file(file).text();
      const at = source.indexOf(label);
      const open = source.lastIndexOf("<Button", at);
      expect(source.slice(open, at), `${file} ${label}`).not.toContain('variant="outline"');
    }
  });

  test("handleMobileNavigate focuses the page heading after closing the drawer", async () => {
    const source = await Bun.file(`${ADMIN}AdminLayout.tsx`).text();
    expect(source).toContain('import { focusPageHeading } from "./focusPageHeading";');
    expect(source).toMatch(
      /if \(window\.location\.href === before && new URL\(to, before\)\.href !== before\) return;\s*focusPageOnClose\.current = true;\s*setMobileOpen\(false\);\s*requestAnimationFrame\(\(\) => focusPageHeading\(document\)\);/,
    );
  });
});
