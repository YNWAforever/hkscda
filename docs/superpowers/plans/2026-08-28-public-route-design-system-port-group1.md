# Public Route Port — Group 1 (Detail/Status) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the 6 lowest-risk remaining public routes — the two animal detail pages, the sponsor detail page, and the three private status/token pages — onto the shared design system, using two new components (`PublicDetailFrame`, `PublicFormFrame`).

**Architecture:** `AnimalDetail` (already the single component shared by all three detail routes) is rewritten to render through a new `PublicDetailFrame`, which implements the exact `.detail-page` / `.detail-breadcrumb` / `.detail-grid` / `.detail-panel` / `.fact-list` layout already authored (but unused) in `src/styles/public.css`, ported from `hkscdagpt-source/app/animals/[species]/[id]/page.tsx`. The three status routes get a new, much thinner `PublicFormFrame` — a breadcrumb+trust-note wrapper, not a page shell — because each status component already owns its own `<main>` and `<h1>`; a frame that duplicated those would create two `<main>` landmarks and two `<h1>`s on one page.

**Tech Stack:** TanStack Start (React 19), Tailwind v4 with CSS-variable tokens (`src/styles/public.css`), Bun test runner, `bun:test` + `react-dom/server` `renderToStaticMarkup` for component tests (no jsdom in this codebase's test convention).

**Prior art referenced while writing this plan:**
- `src/components/site/PublicPageFrame.tsx` — the existing frame this pattern extends
- `src/styles/public.css:1500-1660` — the already-authored, currently-unused `.detail-*` class block
- `hkscdagpt-source/app/animals/[species]/[id]/page.tsx` and `loading.tsx` — the design-source markup those classes were written for
- `src/routes/knowledge.tsx` / `knowledge.test.tsx` — the `XxxPage` (route, uses `Route.useLoaderData`/`useParams`) + `XxxPageView` (plain-props, directly testable) split this plan reuses for the status routes
- `src/components/site/AnimalCard.test.tsx` — the `ShortlistProvider` + mocked-`Link` test pattern this plan reuses

---

### Task 1: `PublicDetailFrame` component

**Files:**
- Create: `src/components/site/PublicDetailFrame.tsx`
- Test: `src/components/site/PublicDetailFrame.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/site/PublicDetailFrame.test.tsx
import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("PublicDetailFrame", () => {
  test("renders the breadcrumb link, panel, and main content in their own regions", async () => {
    const { PublicDetailFrame } = await import("./PublicDetailFrame");
    const markup = renderToStaticMarkup(
      <PublicDetailFrame
        breadcrumbHref="/animals/cat"
        breadcrumbLabel="返回貓貓列表"
        panel={<p>panel-content</p>}
      >
        <p>main-content</p>
      </PublicDetailFrame>,
    );

    expect(markup).toContain("detail-page");
    expect(markup).toContain('href="/animals/cat"');
    expect(markup).toContain("返回貓貓列表");
    expect(markup).toContain("detail-breadcrumb");
    expect(markup).toContain("detail-panel");
    expect(markup).toContain("panel-content");
    expect(markup).toContain("detail-main");
    expect(markup).toContain("main-content");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/site/PublicDetailFrame.test.tsx`
Expected: FAIL — `Cannot find module './PublicDetailFrame'` (or similar resolve error), since the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/site/PublicDetailFrame.tsx
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Layout for the photo/facts detail pages (animal and sponsor detail), using
 * the .detail-* classes ported from hkscdagpt-source's animal detail page
 * (src/styles/public.css) but never previously wired to markup. Distinct from
 * PublicPageFrame's hero/chapters/CTA shape, which doesn't fit a page whose
 * point is one photo and one fact panel.
 */
export function PublicDetailFrame({
  breadcrumbHref,
  breadcrumbLabel,
  panel,
  children,
}: {
  breadcrumbHref: string;
  breadcrumbLabel: string;
  panel: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="detail-page">
      <div className="public-container detail-breadcrumb">
        <Link to={breadcrumbHref}>← {breadcrumbLabel}</Link>
      </div>
      <section className="public-container detail-grid">
        <aside className="detail-panel" aria-label="重點資料及行動">
          {panel}
        </aside>
        <div className="detail-main">{children}</div>
      </section>
    </main>
  );
}
```

`aria-labelledby` is deliberately omitted here rather than pointed at a fixed id: the panel's heading is caller-supplied content (`AnimalDetail` renders its own bare `<h1>`), so `PublicDetailFrame` has no reliable id to reference. The `aside`'s own `aria-label` already gives it an accessible name.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/site/PublicDetailFrame.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/site/PublicDetailFrame.tsx src/components/site/PublicDetailFrame.test.tsx
git commit -m "feat: add PublicDetailFrame using the ported .detail-* layout"
```

---

### Task 2: `PublicFormFrame` component

**Files:**
- Create: `src/components/site/PublicFormFrame.tsx`
- Test: `src/components/site/PublicFormFrame.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/site/PublicFormFrame.test.tsx
import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("PublicFormFrame", () => {
  test("omits the breadcrumb when no href/label is given, and renders the trust note", async () => {
    const { PublicFormFrame } = await import("./PublicFormFrame");
    const markup = renderToStaticMarkup(
      <PublicFormFrame trustNote="此為私人查閱連結，請勿轉發。">
        <p>status-content</p>
      </PublicFormFrame>,
    );

    expect(markup).not.toContain("detail-breadcrumb");
    expect(markup).toContain("status-content");
    expect(markup).toContain("trust-cue");
    expect(markup).toContain("此為私人查閱連結，請勿轉發。");
  });

  test("renders the breadcrumb when both href and label are given", async () => {
    const { PublicFormFrame } = await import("./PublicFormFrame");
    const markup = renderToStaticMarkup(
      <PublicFormFrame breadcrumbHref="/volunteer" breadcrumbLabel="返回個人義工報名">
        <p>form-content</p>
      </PublicFormFrame>,
    );

    expect(markup).toContain('href="/volunteer"');
    expect(markup).toContain("返回個人義工報名");
    expect(markup).toContain("detail-breadcrumb");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/site/PublicFormFrame.test.tsx`
Expected: FAIL — module `./PublicFormFrame` not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/site/PublicFormFrame.tsx
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Thin wrapper for conversion and status pages (wizards, forms, the private
 * status/token routes, /donate). Deliberately does not own a <main> or a
 * heading: every page it wraps already has its own <main> and <h1> (e.g.
 * StatusPage's StatusContent), so a frame that supplied a second copy of
 * either would produce a duplicate <main> landmark or a duplicate <h1> —
 * the exact defect class PublicStateShell's headingLevel doc comment warns
 * about. Reuses the same .detail-breadcrumb chrome as PublicDetailFrame and
 * the .trust-cue pill already used on the home page's trust line.
 */
export function PublicFormFrame({
  breadcrumbHref,
  breadcrumbLabel,
  trustNote,
  children,
}: {
  breadcrumbHref?: string;
  breadcrumbLabel?: string;
  trustNote?: string;
  children: ReactNode;
}) {
  return (
    <>
      {breadcrumbHref && breadcrumbLabel ? (
        <div className="public-container detail-breadcrumb">
          <Link to={breadcrumbHref}>← {breadcrumbLabel}</Link>
        </div>
      ) : null}
      {children}
      {trustNote ? (
        <div className="public-container">
          <p className="trust-cue">{trustNote}</p>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/site/PublicFormFrame.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/site/PublicFormFrame.tsx src/components/site/PublicFormFrame.test.tsx
git commit -m "feat: add PublicFormFrame breadcrumb/trust-note wrapper"
```

---

### Task 3: Rewrite `AnimalDetail` onto `PublicDetailFrame`

This is the only change needed for all three detail routes (`/animals/cat/$id`, `/animals/dog/$id`, `/sponsors/$id`) — they all call `<AnimalDetail animal backHref backLabel />` already, and that call signature does not change, so none of the three route files need editing.

**Files:**
- Modify: `src/components/site/AnimalDetail.tsx`
- Test: `src/components/site/AnimalDetail.test.tsx` (new — no test file exists for this component today)

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/site/AnimalDetail.test.tsx
import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShortlistProvider } from "./ShortlistProvider";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const animal = {
  id: "animal-1",
  type: "cat" as const,
  name: "小白",
  name_en: "Snowy",
  gender: "female" as const,
  age: "2歲",
  age_en: null,
  description: "親人，喜歡曬太陽",
  description_en: null,
  notes: "需要安靜家庭",
  notes_en: null,
  status: "available" as const,
  image_url: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-03-15T00:00:00.000Z",
};

describe("AnimalDetail", () => {
  test("renders the breadcrumb, fact list, and shortlist action inside the detail panel", async () => {
    const { AnimalDetail } = await import("./AnimalDetail");
    const markup = renderToStaticMarkup(
      <ShortlistProvider>
        <AnimalDetail animal={animal} backHref="/animals/cat" backLabel="返回貓貓列表" />
      </ShortlistProvider>,
    );

    expect(markup).toContain("detail-page");
    expect(markup).toContain('href="/animals/cat"');
    expect(markup).toContain("返回貓貓列表");
    expect(markup).toContain("小白");
    expect(markup).toContain("Snowy");
    expect(markup).toContain("fact-list");
    expect(markup).toContain("母");
    expect(markup).toContain("2歲");
    expect(markup).toContain("成年");
    expect(markup).toContain("加入領養清單");
    expect(markup).toContain("親人，喜歡曬太陽");
    expect(markup).toContain("需要安靜家庭");
  });

  test("shows the icon fallback instead of an <img> when the animal has no photo", async () => {
    const { AnimalDetail } = await import("./AnimalDetail");
    const markup = renderToStaticMarkup(
      <ShortlistProvider>
        <AnimalDetail animal={animal} backHref="/animals/cat" backLabel="返回貓貓列表" />
      </ShortlistProvider>,
    );

    expect(markup).toContain("detail-image-fallback");
    expect(markup).not.toContain("<img");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/site/AnimalDetail.test.tsx`
Expected: FAIL — assertions on `detail-page`, `fact-list`, `detail-image-fallback` fail against the current ad hoc markup, which doesn't use those classes.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/site/AnimalDetail.tsx
import { Cat, CheckCircle2, Dog } from "lucide-react";
import type { Animal, AgeFilter } from "../../types/animal";
import { parseAgeFilter } from "../../types/animal";
import { PublicDetailFrame } from "./PublicDetailFrame";
import { PublicStatusBadge } from "./PublicStatusBadge";
import { ShortlistActionButton } from "./ShortlistActionButton";

const AGE_GROUP_LABELS: Record<AgeFilter, string> = {
  all: "",
  bb: "幼年",
  adult: "成年",
  senior: "熟齡",
};

const updatedAtFormatter = new Intl.DateTimeFormat("zh-HK", {
  dateStyle: "long",
  timeZone: "Asia/Hong_Kong",
});

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return updatedAtFormatter.format(date);
}

interface AnimalDetailProps {
  animal: Animal;
  backHref: string;
  backLabel: string;
}

export function AnimalDetail({ animal, backHref, backLabel }: AnimalDetailProps) {
  const TypeIcon = animal.type === "dog" ? Dog : Cat;
  const typeLabel = animal.type === "dog" ? "狗狗" : "貓貓";
  const updatedAt = formatUpdatedAt(animal.updated_at);

  return (
    <PublicDetailFrame
      breadcrumbHref={backHref}
      breadcrumbLabel={backLabel}
      panel={
        <>
          <div className="detail-status">
            <PublicStatusBadge tone="info" icon={CheckCircle2}>
              待領養
            </PublicStatusBadge>
            <span className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)]">
              <TypeIcon className="h-4 w-4" aria-hidden="true" /> {typeLabel}
            </span>
          </div>
          <h1>{animal.name}</h1>
          {animal.name_en ? <p className="animal-english-name">{animal.name_en}</p> : null}
          <dl className="fact-list">
            <div>
              <dt>性別</dt>
              <dd>{animal.gender === "male" ? "公" : "母"}</dd>
            </div>
            <div>
              <dt>年齡</dt>
              <dd>{animal.age}</dd>
            </div>
            <div>
              <dt>年齡組別</dt>
              <dd>{AGE_GROUP_LABELS[parseAgeFilter(animal.age)]}</dd>
            </div>
            {updatedAt ? (
              <div>
                <dt>資料更新</dt>
                <dd>{updatedAt}</dd>
              </div>
            ) : null}
          </dl>
          <ShortlistActionButton animal={animal} />
        </>
      }
    >
      <div className="detail-gallery" aria-label={typeLabel + "相片：" + animal.name}>
        {animal.image_url ? (
          <img
            src={animal.image_url}
            alt={"待領養" + typeLabel + "：" + animal.name}
          />
        ) : (
          <div className="detail-image-fallback flex flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white text-[var(--color-primary)] shadow-soft">
              <TypeIcon className="h-14 w-14" aria-hidden="true" />
            </span>
            <strong>{animal.name}</strong>
          </div>
        )}
      </div>
      <div className="detail-story">
        <p className="eyebrow">認識牠</p>
        <h2>救援與領養資料</h2>
        {animal.description ? (
          <p>{animal.description}</p>
        ) : (
          <p className="transparent-empty">
            現有公開欄位未提供可核實的救援故事，因此不以推測內容補寫。
          </p>
        )}
        {animal.notes ? <p className="detail-note">{animal.notes}</p> : null}
      </div>
      <div className="detail-disclosure">
        <h2>公開資料範圍</h2>
        <p>
          現有動物資料結構未有獨立的疫苗、絕育、醫療、相容性、性格及家居要求欄位；只有獲准公開的資料才會在此出現。
        </p>
      </div>
    </PublicDetailFrame>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/site/AnimalDetail.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full test suite to catch any other consumer**

Run: `bun test`
Expected: PASS — in particular, no failures in any test that imports `AnimalDetail` (none currently exists, but this catches anything this plan missed).

- [ ] **Step 6: Commit**

```bash
git add src/components/site/AnimalDetail.tsx src/components/site/AnimalDetail.test.tsx
git commit -m "feat: rewrite AnimalDetail onto PublicDetailFrame's ported layout"
```

---

### Task 4: Wrap `/adoption/status/$token`

**Files:**
- Modify: `src/routes/adoption/status.$token.tsx`
- Test: `src/routes/adoption/status.$token.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/routes/adoption/status.$token.test.tsx
import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

mock.module("../../components/site/adoption/StatusPage", () => ({
  StatusPage: ({ token }: { token: string }) => <p>token:{token}</p>,
}));

describe("adoption status route", () => {
  test("wraps StatusPage with a private-link trust note and no breadcrumb", async () => {
    const { AdoptionStatusView } = await import("./status.$token");
    const markup = renderToStaticMarkup(<AdoptionStatusView token="abc123" />);

    expect(markup).toContain("token:abc123");
    expect(markup).toContain("trust-cue");
    expect(markup).toContain("此為私人查閱連結，請勿轉發。");
    expect(markup).not.toContain("detail-breadcrumb");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/adoption/status.\$token.test.tsx`
Expected: FAIL — `AdoptionStatusView` is not exported yet.

- [ ] **Step 3: Write the implementation**

```tsx
// src/routes/adoption/status.$token.tsx
import { createFileRoute } from "@tanstack/react-router";

import { PublicFormFrame } from "../../components/site/PublicFormFrame";
import { StatusPage } from "../../components/site/adoption/StatusPage";

export const Route = createFileRoute("/adoption/status/$token")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: AdoptionStatusRoute,
});

function AdoptionStatusRoute() {
  const { token } = Route.useParams();
  return <AdoptionStatusView token={token} />;
}

export function AdoptionStatusView({ token }: { token: string }) {
  return (
    <PublicFormFrame trustNote="此為私人查閱連結，請勿轉發。">
      <StatusPage token={token} />
    </PublicFormFrame>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/routes/adoption/status.\$token.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/routes/adoption/status.\$token.tsx src/routes/adoption/status.\$token.test.tsx
git commit -m "feat: wrap adoption status route in PublicFormFrame"
```

---

### Task 5: Wrap `/sponsors/status/$token`

**Files:**
- Modify: `src/routes/sponsors_.status.$token.tsx`
- Test: `src/routes/sponsors_.status.$token.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/routes/sponsors_.status.$token.test.tsx
import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

mock.module("../components/site/sponsorship/PledgeStatusPage", () => ({
  PledgeStatusPage: ({ token }: { token: string }) => <p>token:{token}</p>,
}));

describe("sponsorship status route", () => {
  test("wraps PledgeStatusPage with a private-link trust note and no breadcrumb", async () => {
    const { SponsorshipStatusView } = await import("./sponsors_.status.$token");
    const markup = renderToStaticMarkup(<SponsorshipStatusView token="xyz789" />);

    expect(markup).toContain("token:xyz789");
    expect(markup).toContain("trust-cue");
    expect(markup).toContain("此為私人查閱連結，請勿轉發。");
    expect(markup).not.toContain("detail-breadcrumb");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/sponsors_.status.\$token.test.tsx`
Expected: FAIL — `SponsorshipStatusView` is not exported yet.

- [ ] **Step 3: Write the implementation**

```tsx
// src/routes/sponsors_.status.$token.tsx
import { createFileRoute } from "@tanstack/react-router";

import { PublicFormFrame } from "../components/site/PublicFormFrame";
import { PledgeStatusPage } from "../components/site/sponsorship/PledgeStatusPage";

export const Route = createFileRoute("/sponsors_/status/$token")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SponsorshipStatusRoute,
});

function SponsorshipStatusRoute() {
  const { token } = Route.useParams();
  return <SponsorshipStatusView token={token} />;
}

export function SponsorshipStatusView({ token }: { token: string }) {
  return (
    <PublicFormFrame trustNote="此為私人查閱連結，請勿轉發。">
      <PledgeStatusPage token={token} />
    </PublicFormFrame>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/routes/sponsors_.status.\$token.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/routes/sponsors_.status.\$token.tsx src/routes/sponsors_.status.\$token.test.tsx
git commit -m "feat: wrap sponsorship status route in PublicFormFrame"
```

---

### Task 6: Wrap `/volunteer/status/$token`

This route inlines its own fetch/status logic rather than delegating to a separate component, so the refactor extracts a plain-props `VolunteerStatusView` (matching the `KnowledgePage`/`KnowledgePageView` split in `src/routes/knowledge.tsx`) and wraps its computed content once, instead of duplicating the wrap across three early-return branches.

**Files:**
- Modify: `src/routes/volunteer/status.$token.tsx`
- Test: `src/routes/volunteer/status.$token.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/routes/volunteer/status.$token.test.tsx
import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("volunteer status route", () => {
  test("wraps the status view with a private-link trust note and no breadcrumb", async () => {
    const originalFetch = global.fetch;
    global.fetch = (() => new Promise(() => {})) as typeof fetch;
    try {
      const { VolunteerStatusView } = await import("./status.$token");
      const markup = renderToStaticMarkup(<VolunteerStatusView token="abc123" />);

      expect(markup).toContain("正在載入義工登記");
      expect(markup).toContain("trust-cue");
      expect(markup).toContain("此為私人查閱連結，請勿轉發。");
      expect(markup).not.toContain("detail-breadcrumb");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/volunteer/status.\$token.test.tsx`
Expected: FAIL — `VolunteerStatusView` is not exported yet.

- [ ] **Step 3: Write the implementation**

```tsx
// src/routes/volunteer/status.$token.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicFormFrame } from "../../components/site/PublicFormFrame";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type VolunteerStatus = {
  reference: string;
  status: string;
  attendanceStatus: string;
  participantCount: number;
  activityTitle: string;
  startsAt: string;
  location: string;
};

export const Route = createFileRoute("/volunteer/status/$token")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: VolunteerStatusRoute,
});

function VolunteerStatusRoute() {
  const { token } = Route.useParams();
  return <VolunteerStatusView token={token} />;
}

export function VolunteerStatusView({ token }: { token: string }) {
  const [status, setStatus] = useState<VolunteerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void fetch(`/api/volunteer/status/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          registration?: VolunteerStatus;
        };
        if (!response.ok || !body.registration) {
          throw new Error(body.error ?? "找不到此義工登記");
        }
        setStatus(body.registration);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "暫時未能載入"))
      .finally(() => setLoading(false));
  }, [token]);

  let content: ReactNode;

  if (loading) {
    content = (
      <StatusShell icon={<Loader2 className="h-7 w-7 animate-spin" />} title="正在載入義工登記">
        <p>請稍候，我們正在確認你的狀態連結。</p>
      </StatusShell>
    );
  } else if (error || !status) {
    content = (
      <StatusShell role="alert" icon={<AlertCircle className="h-7 w-7" />} title="找不到義工登記">
        <p>{error ?? "連結可能已過期或輸入錯誤。"}</p>
        <Link to="/volunteer" className="btn-primary min-h-11 mt-5">
          返回義工頁面
        </Link>
      </StatusShell>
    );
  } else {
    content = (
      <main className="bg-[var(--color-bg)] py-8">
        <div className="container-wide">
          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[var(--color-primary)]">義工登記狀態</p>
                <h1 className="font-display mt-2 text-3xl font-bold text-[var(--color-panel)]">
                  {status.activityTitle}
                </h1>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  {status.reference} · {status.participantCount} 人
                </p>
              </div>
              <span className="rounded-full bg-[var(--color-primary-highlight)] px-4 py-2 text-sm font-bold text-[var(--color-primary)]">
                {status.status}
              </span>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <InfoCard
                icon={<CalendarDays className="h-5 w-5" />}
                label="活動時間"
                value={new Date(status.startsAt).toLocaleString("zh-HK", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              />
              <InfoCard icon={<Clock3 className="h-5 w-5" />} label="地點" value={status.location} />
              <InfoCard
                icon={<CheckCircle2 className="h-5 w-5" />}
                label="出席狀態"
                value={status.attendanceStatus}
              />
            </div>
          </section>
        </div>
      </main>
    );
  }

  return <PublicFormFrame trustNote="此為私人查閱連結，請勿轉發。">{content}</PublicFormFrame>;
}

function StatusShell({
  icon,
  title,
  children,
  role = "status",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <main className="bg-[var(--color-bg)] py-10">
      <section className="container-wide">
        <PublicStateShell icon={icon} title={title} description={children} role={role} />
      </section>
    </main>
  );
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-4">
      <div className="text-[var(--color-primary)]">{icon}</div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 font-semibold text-[var(--color-panel)]">{value}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/routes/volunteer/status.\$token.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/routes/volunteer/status.\$token.tsx src/routes/volunteer/status.\$token.test.tsx
git commit -m "feat: wrap volunteer status route in PublicFormFrame"
```

---

### Task 7: Group gate — full verification and parity doc update

**Files:**
- Modify: `docs/public-route-parity.md`

- [ ] **Step 1: Update the parity table**

In `docs/public-route-parity.md`, change the "Design system" column from `no` to `yes` for these six rows (leave every other column on each row unchanged):

```diff
- | `/animals/cat/$id` | WP-3 | no | loader | yes | yes |
- | `/animals/dog/$id` | WP-3 | no | loader | yes | yes |
+ | `/animals/cat/$id` | WP-3 | yes | loader | yes | yes |
+ | `/animals/dog/$id` | WP-3 | yes | loader | yes | yes |
```

```diff
- | `/adoption/status/$token` | WP-4 | no | static | no | correctly absent |
+ | `/adoption/status/$token` | WP-4 | yes | static | no | correctly absent |
```

```diff
- | `/sponsors/$id` | WP-5 | no | loader | yes | yes |
+ | `/sponsors/$id` | WP-5 | yes | loader | yes | yes |
```

```diff
- | `/sponsors/status/$token` | WP-5 | no | static | no | correctly absent |
+ | `/sponsors/status/$token` | WP-5 | yes | static | no | correctly absent |
```

```diff
- | `/volunteer/status/$token` | WP-5 | no | static | yes | correctly absent |
+ | `/volunteer/status/$token` | WP-5 | yes | static | yes | correctly absent |
```

- [ ] **Step 2: Update the summary count**

```diff
-- Routes reframed onto the ported design system: **14 of 27**
+- Routes reframed onto the ported design system: **20 of 27**
```

- [ ] **Step 3: Remove the stale Known-gaps line**

`/sponsors` and `/about` already read through their loaders (confirmed by reading `src/routes/sponsors.tsx` and `src/routes/about/index.tsx` — both have had a `loader` since the Stage B merge). This line predates that and is simply wrong now; delete it rather than carry it forward:

```diff
 - Routes marked `no` under Design system keep their pre-port section structure.
-- `/sponsors` and `/about` still read their primary data in the browser.
 - `/report/adoption` shows an unpublished state rather than figures: the anonymous
```

- [ ] **Step 4: Run the full verification gate**

Run in order, fixing anything that fails before continuing:

```bash
bunx tsc --noEmit
bun test
bun run lint
bun run build
bun run verify:brand
```

Expected: all five pass. `bun test` should show the same total test file count as before this plan started, plus 6 (the two new component tests, the AnimalDetail test, and the three route tests).

- [ ] **Step 5: Manual pass**

Start the dev server (`bun run dev`) and check, for one cat, one dog, and one sponsor animal:
- The breadcrumb link at the top returns to the correct listing.
- The fact list shows gender, age, age group, and (when present) the updated date.
- The shortlist button still adds/removes the animal (unchanged behavior).
- An animal with no photo shows the icon fallback, not a broken image.
- Keyboard focus can reach the breadcrumb link and the shortlist button in order.

For each of the three status routes, load a real or sample token URL and confirm:
- The trust note ("此為私人查閱連結，請勿轉發。") appears below the status content.
- No breadcrumb link appears (there's no meaningful parent to link back to).
- The page still has exactly one `<h1>` (open devtools and check — this is the regression this plan is specifically designed to avoid).

- [ ] **Step 6: Commit**

```bash
git add docs/public-route-parity.md
git commit -m "docs: mark Group 1 routes ported, remove stale sponsors/about gap note"
```
