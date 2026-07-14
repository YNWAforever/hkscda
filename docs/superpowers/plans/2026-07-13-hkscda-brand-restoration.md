# HKSCDA Brand Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the authentic HKSCDA logo and blue/magenta corporate identity across the complete public website, redesign the About experience, and bring public routes to a coherent WCAG 2.2 AA-ready system without changing backend or payment contracts.

**Architecture:** Introduce a small brand contract and local official asset, then scope semantic presentation tokens beneath the public site shell so the operational admin UI remains stable. Build focused public primitives and migrate route groups in dependency order: shell, About, content, transactional flows, then route-wide verification and documentation.

**Tech Stack:** TanStack Start, React 19, TypeScript, Tailwind CSS 4, Radix UI, Lucide, TanStack Query, Bun test, Vite, Playwright.

## Global Constraints

- The selected visual direction is **Authentic Civic Warmth**.
- The canonical sampled brand colours are official blue `#05648E` and official magenta `#A61C56`.
- Preserve the official logo unchanged; do not redraw, crop, recolour, stretch, or decorate it.
- Use `查看待領養動物` as the global primary action and `立即捐助` as the global secondary action.
- Show impact figures only when they come from the database or a verifiable official source and include a visible data date.
- Redesign all public routes and public status/error states; keep the admin product operational and dense.
- Do not change backend contracts, adoption data, payment destinations, receipt logic, or donation integrations.
- Do not add dark mode, generic stock photography, decorative gradients, glassmorphism, emoji icons, paw-print decoration, or unnecessary dependencies.
- Keep Noto Sans HK; remove Baloo 2 from institutional headings without adding another large font dependency.
- Target WCAG 2.2 AA, practical 44 x 44 px targets, keyboard operation, 200% zoom, and reduced motion.
- Verify at 375 x 812, 390 x 844, 768 x 1024, 1024 x 768, and 1440 x 900.

---

## File Structure

### Brand foundation

- `public/brand/hkscda-logo-primary.jpg`: unchanged local official/best-available official logo reproduction.
- `src/lib/brand/brand.ts`: organisation name, logo path, alternative text, canonical colours.
- `src/lib/brand/brand.test.ts`: asset and contract verification.
- `src/lib/brand/contrast.test.ts`: CSS token and contrast verification.
- `src/styles.css`: public semantic tokens, compatibility aliases, typography, focus, buttons, surfaces.

### Shared public UI

- `src/components/site/BrandLogo.tsx`: one accessible logo renderer.
- `src/components/site/BrandLogo.test.tsx`: logo path, dimensions, and accessible-name coverage.
- `src/components/site/PublicPageHero.tsx`: full-width image-backed page identity.
- `src/components/site/SectionHeading.tsx`: consistent section hierarchy.
- `src/components/site/PublicStatusBadge.tsx`: icon/text/colour status treatment.
- `src/components/site/PublicStateShell.tsx`: loading, empty, error, expired, and success shell.
- `src/components/site/PublicPrimitives.test.tsx`: shared primitive output checks.
- `src/components/site/Header.tsx`: brand navigation and mobile drawer.
- `src/components/site/Footer.tsx`: official identity, contact, trust, and public navigation.
- `src/components/site/SiteChrome.test.tsx`: header/footer/logo/CTA regression tests.

### About and public data

- `src/lib/animals/publicImpact.ts`: pure impact-summary normalisation.
- `src/lib/animals/publicImpact.test.ts`: suppress unverified/missing counts and format dates.
- `src/routes/about/index.tsx`: complete About redesign and database-backed figures.
- `src/routes/about/index.test.tsx`: mission hierarchy and unverified-copy guard.

### Public route groups

- Home/information: `src/routes/index.tsx`, `src/components/site/Hero.tsx`, `src/components/site/FeatureTrio.tsx`, `src/components/site/BestRescue.tsx`, `src/components/site/FundraisingCard.tsx`, `src/components/site/AdoptionSteps.tsx`, `src/routes/about/cccp.tsx`, `src/routes/about/tnr.tsx`, `src/routes/about/team.tsx`, `src/routes/about/privacy.tsx`.
- Animals/adoption: `src/components/site/AnimalCard.tsx`, `src/components/site/AnimalGrid.tsx`, `src/components/site/AnimalDetail.tsx`, `src/routes/animals/cat.tsx`, `src/routes/animals/dog.tsx`, `src/routes/animals/cat_.$id.tsx`, `src/routes/animals/dog_.$id.tsx`, `src/routes/adoption/instructions.tsx`.
- Transactional flows: `src/components/site/adoption/ApplicationWizard.tsx`, `src/components/site/adoption/WizardFields.tsx`, `src/components/site/adoption/GuidancePanel.tsx`, `src/components/site/adoption/StatusPage.tsx`, `src/components/site/sponsorship/PledgeWizard.tsx`, `src/components/site/sponsorship/PledgeStatusPage.tsx`, `src/routes/volunteer.tsx`, `src/routes/volunteer/status.$token.tsx`, `src/routes/donate.tsx`.
- Content/transparency: `src/routes/sponsors.tsx`, `src/routes/sponsors_.$id.tsx`, `src/routes/stories.tsx`, `src/components/site/stories/StoryWall.tsx`, `src/components/site/stories/StoryDetail.tsx`, `src/components/site/stories/RescueMap.tsx`, `src/routes/report/adoption.tsx`, `src/components/site/AdoptionChart.tsx`, `src/routes/report/audit.tsx`, `src/components/site/ReportHeader.tsx`, `src/routes/help.tsx`, `src/components/site/help/HelpSearch.tsx`, `src/components/site/help/FaqResultCard.tsx`, `src/components/site/help/ContactFallback.tsx`.

### Metadata, verification, and documentation

- `src/routes/__root.tsx`: public/admin shell scopes, favicon, root metadata, branded error states.
- `src/lib/schema.tsx`: organisation logo metadata.
- `scripts/verify-public-brand.mjs`: route/viewport/console/overflow/logo browser checks.
- `docs/HKSCDA_BRAND_AUDIT.md`
- `docs/HKSCDA_COLOR_SYSTEM.md`
- `docs/HKSCDA_REDESIGN_REPORT.md`

---

### Task 1: Validate and Install the Authentic Logo Contract

**Files:**
- Create: `public/brand/hkscda-logo-primary.jpg`
- Create: `src/lib/brand/brand.ts`
- Create: `src/lib/brand/brand.test.ts`
- Reference: `docs/superpowers/specs/2026-07-13-hkscda-brand-restoration-design.md`

**Interfaces:**
- Produces: `brand.nameZh`, `brand.nameEn`, `brand.logo.src`, `brand.logo.alt`, `brand.colors.blue`, `brand.colors.magenta`.
- Consumers: BrandLogo, root metadata, structured data, Header, Footer, About, and documentation tasks.

- [ ] **Step 1: Write the failing brand-contract test**

```ts
// src/lib/brand/brand.test.ts
import { describe, expect, test } from "bun:test";
import { brand } from "./brand";

describe("HKSCDA brand contract", () => {
  test("uses the authentic organisation identity and canonical sampled colours", () => {
    expect(brand.nameZh).toBe("香港拯救貓狗協會");
    expect(brand.nameEn).toBe("Hong Kong Saving Cat and Dog Association");
    expect(brand.logo.alt).toBe("香港拯救貓狗協會 HKSCDA");
    expect(brand.colors).toEqual({ blue: "#05648E", magenta: "#A61C56" });
  });

  test("ships a local non-trivial JPEG logo asset", async () => {
    const asset = Bun.file(`public${brand.logo.src}`);
    expect(asset.type).toBe("image/jpeg");
    expect(asset.size).toBeGreaterThan(50_000);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing contract fails**

Run: `bun test src/lib/brand/brand.test.ts`

Expected: FAIL because `./brand` and the local asset do not exist.

- [ ] **Step 3: Acquire and validate the best official asset**

Try the official source first:

```powershell
New-Item -ItemType Directory public/brand -Force
curl.exe -L --fail https://hkscda.com/img/logo.jpg -o public/brand/hkscda-logo-primary.jpg
```

If Cloudflare returns 403, use the public organisation-record copy identified in the audit:

```powershell
curl.exe -L --fail "https://crssvhwvhxsvbkwedrbc.supabase.co/storage/v1/object/public/charity-logos/cce5e6d9-1d87-4271-9a1c-de95b026a1bd/logo.jpg" -o public/brand/hkscda-logo-primary.jpg
```

Verify:

```powershell
Get-Item public/brand/hkscda-logo-primary.jpg | Select-Object Length
```

Expected: JPEG file larger than 50,000 bytes. Visually confirm the blue house, white dog/cat, magenta outlines/heart noses, Chinese name, and HKSCDA wordmark. Record the source actually used in `docs/HKSCDA_BRAND_AUDIT.md` during Task 12.

- [ ] **Step 4: Implement the immutable brand contract**

```ts
// src/lib/brand/brand.ts
export const brand = {
  nameZh: "香港拯救貓狗協會",
  nameEn: "Hong Kong Saving Cat and Dog Association",
  acronym: "HKSCDA",
  slogan: "領養代替購買",
  logo: {
    src: "/brand/hkscda-logo-primary.jpg",
    alt: "香港拯救貓狗協會 HKSCDA",
    width: 960,
    height: 960,
  },
  colors: {
    blue: "#05648E",
    magenta: "#A61C56",
  },
} as const;
```

- [ ] **Step 5: Run the contract test**

Run: `bun test src/lib/brand/brand.test.ts`

Expected: 2 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add public/brand/hkscda-logo-primary.jpg src/lib/brand/brand.ts src/lib/brand/brand.test.ts
git commit -m "feat: restore authentic HKSCDA brand asset"
```

---

### Task 2: Replace the Poofyco Palette with Scoped Semantic Tokens

**Files:**
- Create: `src/lib/brand/contrast.test.ts`
- Modify: `src/styles.css`
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Consumes: `brand.colors` as documented constants.
- Produces: public `.site-shell` token scope, admin `.admin-shell` compatibility scope, `btn-primary`, `btn-secondary`, and existing colour aliases during migration.

- [ ] **Step 1: Write the failing token and contrast tests**

```ts
// src/lib/brand/contrast.test.ts
import { describe, expect, test } from "bun:test";

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(left: string, right: string) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("public brand tokens", () => {
  test("keeps official colours readable with white text", () => {
    expect(contrast("#05648E", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#A61C56", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  test("defines the site token scope and removes the Poofyco identity", async () => {
    const css = await Bun.file("src/styles.css").text();
    expect(css).toContain("--brand-blue-official: #05648e");
    expect(css).toContain("--brand-magenta-official: #a61c56");
    expect(css).toContain(".site-shell");
    expect(css).toContain(".admin-shell");
    expect(css).not.toContain("Poofyco-inspired");
  });
});
```

- [ ] **Step 2: Run the focused test**

Run: `bun test src/lib/brand/contrast.test.ts`

Expected: contrast test passes; CSS contract test fails.

- [ ] **Step 3: Implement the public and admin token scopes**

Replace the current `@theme` palette with stable aliases and add these scopes:

```css
@theme {
  --brand-blue-official: #05648e;
  --brand-magenta-official: #a61c56;
  --font-display: "Noto Sans HK", "Helvetica Neue", Arial, sans-serif;
  --font-body: "Noto Sans HK", "Helvetica Neue", Arial, sans-serif;
}

.site-shell {
  --color-bg: #f7faf9;
  --color-surface: #ffffff;
  --color-surface-2: #fbfdfc;
  --color-surface-offset: #edf4f5;
  --color-surface-offset-2: #e1ecef;
  --color-divider: #d7e2e5;
  --color-border: #c6d6dc;
  --color-text: #163644;
  --color-text-muted: #526b75;
  --color-text-faint: #728790;
  --color-text-inverse: #ffffff;
  --color-primary: var(--brand-blue-official);
  --color-primary-hover: #044f71;
  --color-primary-active: #033b54;
  --color-primary-highlight: #e5f2f6;
  --color-secondary: var(--brand-magenta-official);
  --color-secondary-hover: #861646;
  --color-secondary-highlight: #f7e9ef;
  --color-success: #3f6f4a;
  --color-success-highlight: #e8f2e9;
  --color-warning: #8a5a12;
  --color-warning-highlight: #fbf0d7;
  --color-error: #a12a2a;
  --color-error-highlight: #f9e4e4;
  --color-info: var(--brand-blue-official);
  --color-info-highlight: #e5f2f6;
  --color-footer-bg: #06435f;
  --color-panel: #163644;
  --color-panel-2: #245266;
  --color-cat: #466a78;
  --color-dog: #5e675f;
  --color-cat-bg: #edf4f5;
  --color-dog-bg: #f0f2ef;
  --color-chart-series-1: #2f6f84;
  --color-chart-series-2: #66734f;
  color: var(--color-text);
  background: var(--color-bg);
}

.admin-shell {
  --color-bg: #f7f8fa;
  --color-surface: #ffffff;
  --color-surface-offset: #f1f3f5;
  --color-border: #d8dee4;
  --color-text: #202a33;
  --color-text-muted: #5d6a75;
  --color-primary: #075f89;
  --color-primary-hover: #044f71;
  --color-panel: #163644;
}
```

Add compact button utilities:

```css
@utility btn-primary {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 0.375rem;
  background: var(--color-primary);
  color: #fff;
  padding: 0.75rem 1.25rem;
  font-weight: 700;
  transition: background-color 180ms ease;
}

@utility btn-secondary {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid var(--color-secondary);
  border-radius: 0.375rem;
  color: var(--color-secondary);
  padding: 0.75rem 1.25rem;
  font-weight: 700;
}
```

Keep `btn-cta` as a temporary alias to `btn-primary` until Task 12 proves no usages remain.

- [ ] **Step 4: Scope the root shells**

In `RootComponent`, wrap public and admin output:

```tsx
{isAdmin ? (
  <div className="admin-shell min-h-dvh" id="main-content" tabIndex={-1}>
    <Outlet />
  </div>
) : (
  <ShortlistProvider>
    <div className="site-shell min-h-dvh">{publicContent}</div>
  </ShortlistProvider>
)}
```

- [ ] **Step 5: Run tests and build**

Run: `bun test src/lib/brand/contrast.test.ts src/lib/brand/brand.test.ts`

Expected: 4 passed, 0 failed.

Run: `bun run build`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css src/routes/__root.tsx src/lib/brand/contrast.test.ts
git commit -m "feat: establish HKSCDA semantic colour system"
```

---

### Task 3: Add Focused Public UI Primitives

**Files:**
- Create: `src/components/site/PublicPageHero.tsx`
- Create: `src/components/site/SectionHeading.tsx`
- Create: `src/components/site/PublicStatusBadge.tsx`
- Create: `src/components/site/PublicStateShell.tsx`
- Create: `src/components/site/PublicPrimitives.test.tsx`
- Modify: `src/components/ui/button.tsx`

**Interfaces:**
- Produces:
  - `PublicPageHero({ title, eyebrow, description, imageSrc, imageAlt, actions })`
  - `SectionHeading({ title, eyebrow, description, align })`
  - `PublicStatusBadge({ tone, icon, children })`
  - `PublicStateShell({ icon, title, description, action, role })`

- [ ] **Step 1: Write the failing primitive rendering test**

```tsx
// src/components/site/PublicPrimitives.test.tsx
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckCircle2 } from "lucide-react";
import { PublicPageHero } from "./PublicPageHero";
import { PublicStatusBadge } from "./PublicStatusBadge";
import { PublicStateShell } from "./PublicStateShell";

describe("public brand primitives", () => {
  test("renders an image-backed hero with one h1 and explicit image alternative text", () => {
    const markup = renderToStaticMarkup(
      <PublicPageHero
        eyebrow="香港本地動物救援"
        title="領養代替購買"
        description="讓生命重新有家"
        imageSrc="/example.jpg"
        imageAlt="獲救貓狗在義工照顧下休息"
      />,
    );
    expect(markup).toContain("<h1");
    expect(markup).toContain('alt="獲救貓狗在義工照顧下休息"');
    expect(markup).toContain("min-h-[");
  });

  test("renders status with text and icon rather than colour alone", () => {
    const markup = renderToStaticMarkup(
      <PublicStatusBadge tone="success" icon={CheckCircle2}>已領養</PublicStatusBadge>,
    );
    expect(markup).toContain("已領養");
    expect(markup).toContain("<svg");
  });

  test("announces error states", () => {
    const markup = renderToStaticMarkup(
      <PublicStateShell title="暫時未能載入" description="請稍後再試" role="alert" />,
    );
    expect(markup).toContain('role="alert"');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test src/components/site/PublicPrimitives.test.tsx`

Expected: FAIL because the four public primitives do not exist.

- [ ] **Step 3: Implement the primitive interfaces**

```tsx
// src/components/site/PublicStatusBadge.tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

const tones = {
  neutral: "bg-[var(--color-surface-offset)] text-[var(--color-text)]",
  info: "bg-[var(--color-info-highlight)] text-[var(--color-info)]",
  success: "bg-[var(--color-success-highlight)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-highlight)] text-[var(--color-warning)]",
  error: "bg-[var(--color-error-highlight)] text-[var(--color-error)]",
} as const;

export function PublicStatusBadge({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof tones;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded px-2 py-1 text-xs font-bold", tones[tone])}>
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
```

```tsx
// src/components/site/PublicStateShell.tsx
import type { ReactNode } from "react";

export function PublicStateShell({
  icon,
  title,
  description,
  action,
  role = "status",
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <section role={role} className="mx-auto max-w-xl px-4 py-16 text-center">
      {icon ? <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center text-[var(--color-primary)]">{icon}</div> : null}
      <h1 className="text-2xl font-bold text-[var(--color-text)]">{title}</h1>
      <p className="mt-3 text-[var(--color-text-muted)]">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
```

Implement `PublicPageHero` as a full-width `section` with a real `img`, direct text overlay, one `h1`, stable `min-h-[420px] sm:min-h-[500px]`, and no card wrapper. Implement `SectionHeading` with `h2`, optional eyebrow/description, and `start | center` alignment.

Update `Button` sizes to practical 44 px minimum:

```ts
size: {
  default: "min-h-11 px-4 py-2",
  sm: "min-h-11 rounded-md px-3 text-xs",
  lg: "min-h-12 rounded-md px-6 text-base",
  icon: "h-11 w-11",
}
```

- [ ] **Step 4: Run the primitive tests**

Run: `bun test src/components/site/PublicPrimitives.test.tsx`

Expected: 3 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/PublicPageHero.tsx src/components/site/SectionHeading.tsx src/components/site/PublicStatusBadge.tsx src/components/site/PublicStateShell.tsx src/components/site/PublicPrimitives.test.tsx src/components/ui/button.tsx
git commit -m "feat: add accessible public brand primitives"
```

---

### Task 4: Apply the Official Logo to Metadata and Structured Data

**Files:**
- Create: `src/components/site/BrandLogo.tsx`
- Create: `src/components/site/BrandLogo.test.tsx`
- Modify: `src/routes/__root.tsx`
- Modify: `src/lib/schema.tsx`

**Interfaces:**
- Consumes: `brand.logo`.
- Produces: `BrandLogo({ className, eager })` and consistent favicon/OG/schema logo references.

- [ ] **Step 1: Write the failing logo test**

```tsx
// src/components/site/BrandLogo.test.tsx
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo", () => {
  test("renders the local authentic logo without distortion", () => {
    const markup = renderToStaticMarkup(<BrandLogo className="h-12" eager />);
    expect(markup).toContain('src="/brand/hkscda-logo-primary.jpg"');
    expect(markup).toContain('alt="香港拯救貓狗協會 HKSCDA"');
    expect(markup).toContain('width="960"');
    expect(markup).toContain('height="960"');
    expect(markup).toContain("object-contain");
    expect(markup).toContain('loading="eager"');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test src/components/site/BrandLogo.test.tsx`

Expected: FAIL because `BrandLogo` does not exist.

- [ ] **Step 3: Implement BrandLogo**

```tsx
// src/components/site/BrandLogo.tsx
import { brand } from "../../lib/brand/brand";
import { cn } from "../../lib/utils";

export function BrandLogo({ className, eager = false }: { className?: string; eager?: boolean }) {
  return (
    <img
      src={brand.logo.src}
      alt={brand.logo.alt}
      width={brand.logo.width}
      height={brand.logo.height}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      className={cn("h-auto w-auto object-contain", className)}
    />
  );
}
```

- [ ] **Step 4: Update root metadata and schema**

Add favicon and social image links in `__root.tsx`:

```ts
{ property: "og:image", content: "https://hkscda.com/brand/hkscda-logo-primary.jpg" },
{ name: "twitter:image", content: "https://hkscda.com/brand/hkscda-logo-primary.jpg" },
```

```ts
{ rel: "icon", type: "image/jpeg", href: "/brand/hkscda-logo-primary.jpg" },
{ rel: "apple-touch-icon", href: "/brand/hkscda-logo-primary.jpg" },
```

Remove Baloo 2 from the Google Fonts URL and retain Noto Sans HK only.

Add to `orgSchema`:

```ts
logo: `${BASE_URL}/brand/hkscda-logo-primary.jpg`,
```

Remove the unsupported `SearchAction` from `websiteSchema` because no public `/search` route exists.

- [ ] **Step 5: Run tests**

Run: `bun test src/components/site/BrandLogo.test.tsx src/lib/brand/brand.test.ts`

Expected: 3 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add src/components/site/BrandLogo.tsx src/components/site/BrandLogo.test.tsx src/routes/__root.tsx src/lib/schema.tsx
git commit -m "feat: apply official HKSCDA identity metadata"
```

---

### Task 5: Redesign Header, Mobile Navigation, Footer, and Root Recovery States

**Files:**
- Create: `src/components/site/SiteChrome.test.tsx`
- Modify: `src/components/site/Header.tsx`
- Modify: `src/components/site/Footer.tsx`
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Consumes: `BrandLogo`, `buttonVariants`, public semantic tokens, `PublicStateShell`.
- Produces: shared official public chrome used by every public route.

- [ ] **Step 1: Write the failing site-chrome test**

```tsx
// src/components/site/SiteChrome.test.tsx
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

describe("public site chrome", () => {
  test("uses the official logo and adoption-led action hierarchy", async () => {
    const { Header } = await import("./Header");
    const markup = renderToStaticMarkup(<Header />);
    expect(markup).toContain("/brand/hkscda-logo-primary.jpg");
    expect(markup).toContain("查看待領養動物");
    expect(markup).toContain("立即捐助");
    expect(markup).not.toContain("shimmer-surface");
  });

  test("footer keeps verified organisation identity without paw or emoji decoration", async () => {
    const { Footer } = await import("./Footer");
    const markup = renderToStaticMarkup(<Footer />);
    expect(markup).toContain("/brand/hkscda-logo-primary.jpg");
    expect(markup).toContain("91/14493");
    expect(markup).not.toContain("🐾");
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test src/components/site/SiteChrome.test.tsx`

Expected: FAIL because the current header/footer render the paw substitute and old CTA copy.

- [ ] **Step 3: Implement the desktop and mobile header**

Replace the current logo block with:

```tsx
<Link to="/" aria-label="香港拯救貓狗協會首頁" className="shrink-0">
  <BrandLogo className="h-12 sm:h-14" eager />
</Link>
```

Use a stable rectangular header, remove inline keyframes/shimmer, preserve navigation data, and implement:

```tsx
<Link to="/animals/cat" className="btn-primary">查看待領養動物</Link>
<Link to="/donate" className="btn-secondary">立即捐助</Link>
```

Keep one mobile drawer controlled by `aria-expanded` and `aria-controls`; all links and close controls must be at least `h-11`.

- [ ] **Step 4: Implement the footer and recovery states**

Use `BrandLogo` directly on the official-blue band, preserve verified contact/report links, and remove the identity card, paw icon, emoji, and pink strip.

Replace duplicate root 404/error markup with `PublicStateShell`; set error role to `alert` and keep retry/home actions.

- [ ] **Step 5: Run tests and build**

Run: `bun test src/components/site/SiteChrome.test.tsx src/components/site/BrandLogo.test.tsx src/components/site/PublicPrimitives.test.tsx`

Expected: 6 passed, 0 failed.

Run: `bun run build`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/site/Header.tsx src/components/site/Footer.tsx src/components/site/SiteChrome.test.tsx src/routes/__root.tsx
git commit -m "feat: restore HKSCDA public site chrome"
```

---

### Task 6: Rebuild About with Verified Impact Data

**Files:**
- Create: `src/lib/animals/publicImpact.ts`
- Create: `src/lib/animals/publicImpact.test.ts`
- Create: `src/routes/about/index.test.tsx`
- Modify: `src/routes/about/index.tsx`

**Interfaces:**
- Produces: `buildPublicImpact({ availableCats, availableDogs, adoptedCats, adoptedDogs, asOf }): PublicImpactItem[]`.
- Suppresses zero, null, and unverified claims.
- Consumes: public Supabase count queries, `PublicPageHero`, `SectionHeading`, `PublicStatusBadge`.

- [ ] **Step 1: Write failing impact tests**

```ts
// src/lib/animals/publicImpact.test.ts
import { describe, expect, test } from "bun:test";
import { buildPublicImpact } from "./publicImpact";

describe("buildPublicImpact", () => {
  test("returns only positive database-backed counts with a Hong Kong data date", () => {
    const items = buildPublicImpact({
      availableCats: 12,
      availableDogs: 5,
      adoptedCats: 0,
      adoptedDogs: null,
      asOf: "2026-07-13T00:00:00.000Z",
    });
    expect(items.map((item) => item.label)).toEqual(["待領養貓貓", "待領養狗狗"]);
    expect(items[0].asOf).toBe("2026年7月13日");
  });
});
```

```tsx
// src/routes/about/index.test.tsx
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AboutContent } from "./index";

describe("AboutContent", () => {
  test("renders the approved mission sequence without unverified legacy figures", () => {
    const markup = renderToStaticMarkup(<AboutContent impact={[]} />);
    expect(markup).toContain("領養代替購買");
    expect(markup).toContain("救援");
    expect(markup).toContain("醫療照護");
    expect(markup).toContain("絕育");
    expect(markup).toContain("配對領養");
    expect(markup).not.toContain("每年救助超過 600");
    expect(markup).not.toContain("6,800");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `bun test src/lib/animals/publicImpact.test.ts src/routes/about/index.test.tsx`

Expected: FAIL because `publicImpact` and `AboutContent` do not exist.

- [ ] **Step 3: Implement the impact normaliser**

```ts
// src/lib/animals/publicImpact.ts
export type PublicImpactItem = { label: string; value: number; asOf: string };

export function buildPublicImpact(input: {
  availableCats: number | null;
  availableDogs: number | null;
  adoptedCats: number | null;
  adoptedDogs: number | null;
  asOf: string;
}): PublicImpactItem[] {
  const asOf = new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(input.asOf));
  return [
    ["待領養貓貓", input.availableCats],
    ["待領養狗狗", input.availableDogs],
    ["已領養貓貓", input.adoptedCats],
    ["已領養狗狗", input.adoptedDogs],
  ]
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    .map(([label, value]) => ({ label, value, asOf }));
}
```

- [ ] **Step 4: Implement the About data query and presentational boundary**

Export `AboutContent({ impact })` for deterministic testing. Keep failed counts as `null`, so a partial database outage suppresses only the unverified statistic:

```tsx
type CountResult = { count: number | null; error: { message: string } | null };

async function getPublicImpact() {
  const countAnimal = (type: "cat" | "dog", status: "available" | "adopted") =>
    supabase
      .from("animals")
      .select("id", { count: "exact", head: true })
      .eq("type", type)
      .eq("status", status) as PromiseLike<CountResult>;

  const [availableCats, availableDogs, adoptedCats, adoptedDogs] = await Promise.all([
    countAnimal("cat", "available"),
    countAnimal("dog", "available"),
    countAnimal("cat", "adopted"),
    countAnimal("dog", "adopted"),
  ]);

  const verifiedCount = (result: CountResult) => (result.error ? null : result.count);
  return buildPublicImpact({
    availableCats: verifiedCount(availableCats),
    availableDogs: verifiedCount(availableDogs),
    adoptedCats: verifiedCount(adoptedCats),
    adoptedDogs: verifiedCount(adoptedDogs),
    asOf: new Date().toISOString(),
  });
}

export function AboutPage() {
  const impact = useQuery({
    queryKey: ["public", "about", "impact"],
    queryFn: getPublicImpact,
    staleTime: 5 * 60 * 1_000,
  });
  return <AboutContent impact={impact.data ?? []} />;
}
```

Render the approved sequence:

```tsx
<PublicPageHero
  eyebrow="香港本地動物救援慈善機構"
  title="領養代替購買"
  description="救援、醫療、絕育與負責任領養，以社區力量守護香港流浪貓狗。"
  imageSrc={heroImg}
  imageAlt="香港拯救貓狗協會救援動物"
/>
```

Then render mission, verified impact, rescue journey, CCCP/TNR, responsible adoption, four help paths, and one final adoption CTA. Do not retain the fee table on About; link to adoption instructions for operational fee guidance.

- [ ] **Step 5: Run tests**

Run: `bun test src/lib/animals/publicImpact.test.ts src/routes/about/index.test.tsx`

Expected: 2 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/animals/publicImpact.ts src/lib/animals/publicImpact.test.ts src/routes/about/index.tsx src/routes/about/index.test.tsx
git commit -m "feat: rebuild About around verified HKSCDA impact"
```

---

### Task 7: Migrate Home and Informational Routes

**Files:**
- Modify: `src/routes/index.tsx`
- Modify: `src/components/site/Hero.tsx`
- Modify: `src/components/site/FeatureTrio.tsx`
- Modify: `src/components/site/BestRescue.tsx`
- Modify: `src/components/site/FundraisingCard.tsx`
- Modify: `src/components/site/AdoptionSteps.tsx`
- Modify: `src/components/site/FAQ.tsx`
- Modify: `src/components/site/SocialProof.tsx`
- Modify: `src/components/site/VolunteerCarousel.tsx`
- Modify: `src/components/site/SocialWall.tsx`
- Modify: `src/components/site/PhotoMarquee.tsx`
- Modify: `src/routes/about/cccp.tsx`
- Modify: `src/routes/about/tnr.tsx`
- Modify: `src/routes/about/team.tsx`
- Modify: `src/routes/about/privacy.tsx`
- Create: `src/lib/brand/publicCopyGuard.test.ts`

**Interfaces:**
- Consumes: semantic tokens, public primitives, `btn-primary`, `btn-secondary`.
- Produces: no Poofyco utility usage and no unverified homepage impact claims.

- [ ] **Step 1: Write the failing public-copy and deprecated-style guard**

```ts
// src/lib/brand/publicCopyGuard.test.ts
import { describe, expect, test } from "bun:test";

const publicFiles = [
  "src/routes/index.tsx",
  "src/components/site/Hero.tsx",
  "src/components/site/FeatureTrio.tsx",
  "src/components/site/BestRescue.tsx",
  "src/components/site/FundraisingCard.tsx",
  "src/components/site/AdoptionSteps.tsx",
  "src/routes/about/cccp.tsx",
  "src/routes/about/tnr.tsx",
];

describe("public brand migration", () => {
  test("removes deprecated visual-system utilities and unverified impact copy", async () => {
    const source = (await Promise.all(publicFiles.map((path) => Bun.file(path).text()))).join("\n");
    expect(source).not.toContain("card-dashed");
    expect(source).not.toContain("arch-mask");
    expect(source).not.toContain("bg-topo");
    expect(source).not.toContain("平均每 14 小時");
    expect(source).not.toContain("每年救助超過600");
  });
});
```

- [ ] **Step 2: Run the guard**

Run: `bun test src/lib/brand/publicCopyGuard.test.ts`

Expected: FAIL on deprecated utilities and unverified copy.

- [ ] **Step 3: Migrate the home route**

- Make `Hero` full-bleed, image-backed, adoption-led, and free of a card wrapper.
- Replace static homepage animal sample claims with links to live cat/dog routes; do not present demo animal names as current inventory.
- Replace the homepage duplicate `AnimalCard` with the shared `src/components/site/AnimalCard.tsx` or remove the duplicate sample grid.
- Replace `btn-cta` with `btn-primary` or `btn-secondary`.
- Replace `card-dashed`, arch masks, topology patterns, huge radii, decorative paw motifs, and gendered cat/dog colours.
- Preserve verified official contact/payment text but do not change destinations.

Use this section-header pattern:

```tsx
<SectionHeading
  eyebrow="領養動物"
  title="牠們在等待一個家"
  description="查看目前可申請領養的貓狗，了解牠們的個性與照顧需要。"
/>
```

- [ ] **Step 4: Migrate About programme/legal routes**

Use `PublicPageHero` on CCCP/TNR where an authentic image exists; otherwise use an unframed text page header, not a fabricated media block. Use `SectionHeading`, semantic surfaces, specific CTA labels, readable legal measure, and links with official-blue focus/hover states.

- [ ] **Step 5: Run tests and build**

Run: `bun test src/lib/brand/publicCopyGuard.test.ts src/routes/help.test.tsx`

Expected: all pass.

Run: `bun run build`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/routes/index.tsx src/components/site src/routes/about src/lib/brand/publicCopyGuard.test.ts
git commit -m "feat: migrate public information pages to HKSCDA identity"
```

---

### Task 8: Redesign Animal Listings, Details, and Adoption Guidance

**Files:**
- Create: `src/components/site/AnimalCard.test.tsx`
- Create: `src/components/site/AnimalGrid.test.tsx`
- Modify: `src/components/site/AnimalCard.tsx`
- Modify: `src/components/site/AnimalGrid.tsx`
- Modify: `src/components/site/AnimalDetail.tsx`
- Modify: `src/components/site/ShortlistActionButton.tsx`
- Modify: `src/routes/animals/cat.tsx`
- Modify: `src/routes/animals/dog.tsx`
- Modify: `src/routes/animals/cat_.$id.tsx`
- Modify: `src/routes/animals/dog_.$id.tsx`
- Modify: `src/routes/adoption/instructions.tsx`

**Interfaces:**
- Consumes: `Animal`, `PublicStatusBadge`, `SectionHeading`, `btn-primary`.
- Produces: neutral cat/dog presentation with explicit `待領養` text and accessible filters/pagination.

- [ ] **Step 1: Write failing animal-card tests**

```tsx
// src/components/site/AnimalCard.test.tsx
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
}));

const animal = {
  id: "animal-1",
  type: "cat" as const,
  name: "小白",
  name_en: null,
  gender: "female" as const,
  age: "2歲",
  age_en: null,
  description: "親人",
  description_en: null,
  notes: "需要安靜家庭",
  notes_en: null,
  status: "available" as const,
  image_url: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

describe("AnimalCard", () => {
  test("uses text and icon identity without pink/blue category coding", async () => {
    const { AnimalCard } = await import("./AnimalCard");
    const markup = renderToStaticMarkup(<AnimalCard animal={animal} />);
    expect(markup).toContain("待領養");
    expect(markup).toContain("小白");
    expect(markup).not.toContain("--color-cat");
    expect(markup).not.toContain("--color-dog");
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test src/components/site/AnimalCard.test.tsx`

Expected: FAIL because the current card has no explicit `待領養` label and uses type colours.

- [ ] **Step 3: Implement listing and detail migration**

- Use an `article` card with an 8 px radius, stable square media, meaningful alt text, neutral image fallback, explicit type text/icon, `PublicStatusBadge tone="info"`, age, sex, suitability notes, and specific detail/adoption actions.
- Make filter and pagination buttons `min-h-11`; add `aria-current="page"` to the active page.
- Give cat/dog listing routes a shared page heading and error/loading states with stable dimensions.
- Use `AnimalDetail` for a clear photo/info layout, back link, suitability text, explicit available status, and adoption action.
- Keep unsupported statuses private; public list queries remain `status = available`.

- [ ] **Step 4: Add AnimalGrid behaviour test**

```tsx
// src/components/site/AnimalGrid.test.tsx
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AnimalGrid } from "./AnimalGrid";

describe("AnimalGrid", () => {
  test("announces filters, totals, and a useful empty state", () => {
    const markup = renderToStaticMarkup(
      <AnimalGrid animals={[]} total={0} page={1} ageFilter="all" animalLabel="貓" />,
    );
    expect(markup).toContain('aria-label="按年齡篩選"');
    expect(markup).toContain("共 0 隻貓");
    expect(markup).toContain("暫時沒有符合條件的貓");
    expect(markup).toContain("min-h-11");
  });
});
```

- [ ] **Step 5: Run focused tests**

Run: `bun test src/components/site/AnimalCard.test.tsx src/components/site/AnimalGrid.test.tsx src/lib/publicAdoption/shortlist.test.ts`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/site/AnimalCard.tsx src/components/site/AnimalCard.test.tsx src/components/site/AnimalGrid.tsx src/components/site/AnimalGrid.test.tsx src/components/site/AnimalDetail.tsx src/components/site/ShortlistActionButton.tsx src/routes/animals src/routes/adoption/instructions.tsx
git commit -m "feat: align animal discovery with HKSCDA brand"
```

---

### Task 9: Unify Public Forms, Status Pages, and Donation Trust

**Files:**
- Modify: `src/components/site/adoption/ApplicationWizard.tsx`
- Modify: `src/components/site/adoption/WizardFields.tsx`
- Modify: `src/components/site/adoption/GuidancePanel.tsx`
- Modify: `src/components/site/adoption/StatusPage.tsx`
- Modify: `src/components/site/sponsorship/PledgeWizard.tsx`
- Modify: `src/components/site/sponsorship/PledgeStatusPage.tsx`
- Modify: `src/routes/volunteer.tsx`
- Modify: `src/routes/volunteer/status.$token.tsx`
- Modify: `src/routes/donate.tsx`
- Create: `src/lib/brand/publicFormGuard.test.ts`

**Interfaces:**
- Consumes: `PublicStateShell`, `PublicStatusBadge`, public button and field tokens.
- Preserves: all existing payloads, storage keys, consent fields, Turnstile tokens, endpoints, payment methods, and redirects.

- [ ] **Step 1: Write the failing form guard**

```ts
// src/lib/brand/publicFormGuard.test.ts
import { describe, expect, test } from "bun:test";

const files = [
  "src/components/site/adoption/ApplicationWizard.tsx",
  "src/components/site/adoption/WizardFields.tsx",
  "src/components/site/sponsorship/PledgeWizard.tsx",
  "src/routes/volunteer.tsx",
  "src/routes/donate.tsx",
];

describe("public transactional UI", () => {
  test("uses explicit alert semantics and no deprecated CTA/card system", async () => {
    const source = (await Promise.all(files.map((path) => Bun.file(path).text()))).join("\n");
    expect(source).toContain('role="alert"');
    expect(source).not.toContain("card-dashed");
    expect(source).not.toContain("btn-cta");
  });
});
```

- [ ] **Step 2: Run the guard**

Run: `bun test src/lib/brand/publicFormGuard.test.ts`

Expected: FAIL because transactional pages still use the deprecated CTA/card system and inconsistent error semantics.

- [ ] **Step 3: Migrate fields and status shells without changing data flow**

For every field:

```tsx
<label htmlFor={id} className="block text-sm font-semibold text-[var(--color-text)]">
  {label} <span aria-hidden="true" className="text-[var(--color-error)]">*</span>
</label>
<input
  id={id}
  aria-invalid={Boolean(error)}
  aria-describedby={error ? `${id}-error` : undefined}
  className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
/>
{error ? <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-[var(--color-error)]">{error}</p> : null}
```

Replace duplicated status wrappers with `PublicStateShell`; preserve privacy-safe invalid/expired/retry actions. Keep loading buttons disabled with visible text.

- [ ] **Step 4: Strengthen donation trust without changing payment behaviour**

- Add `BrandLogo`, official organisation name, verified charity number already present in source, purpose explanation, receipt guidance, and support contact.
- Keep `amounts`, `purposes`, `methods`, `/api/donations`, Stripe, PayPal, FPS, PayMe, consent payloads, and Turnstile unchanged.
- Use `fieldset` and `legend` for amount, purpose, payment method, and consent groups.
- Keep one primary submit button; payment-method choices are selected controls, not competing CTAs.

- [ ] **Step 5: Run existing domain tests and the UI guard**

Run:

```bash
bun test src/lib/brand/publicFormGuard.test.ts src/lib/publicAdoption/schemas.test.ts src/lib/publicAdoption/draft.test.ts src/lib/sponsorship/schemas.test.ts src/lib/sponsorship/draft.test.ts src/components/site/volunteer/volunteerSignupLogic.test.ts src/lib/donations/domain.test.ts src/lib/donations/providers.server.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/site/adoption src/components/site/sponsorship src/routes/volunteer.tsx src/routes/volunteer/status.\$token.tsx src/routes/donate.tsx src/lib/brand/publicFormGuard.test.ts
git commit -m "feat: unify branded public forms and trust states"
```

---

### Task 10: Migrate Sponsorship, Stories, Reports, and Help

**Files:**
- Modify: `src/routes/sponsors.tsx`
- Modify: `src/routes/sponsors_.$id.tsx`
- Modify: `src/routes/sponsors_.pledge.tsx`
- Modify: `src/routes/sponsors_.status.$token.tsx`
- Modify: `src/routes/stories.tsx`
- Modify: `src/routes/stories/$slug.tsx`
- Modify: `src/components/site/stories/StoryWall.tsx`
- Modify: `src/components/site/stories/StoryDetail.tsx`
- Modify: `src/components/site/stories/StoryContentGrid.tsx`
- Modify: `src/components/site/stories/RescueMap.tsx`
- Modify: `src/routes/report/adoption.tsx`
- Modify: `src/components/site/AdoptionChart.tsx`
- Modify: `src/routes/report/audit.tsx`
- Modify: `src/components/site/ReportHeader.tsx`
- Modify: `src/routes/help.tsx`
- Modify: `src/components/site/help/HelpSearch.tsx`
- Modify: `src/components/site/help/FaqResultCard.tsx`
- Modify: `src/components/site/help/ContactFallback.tsx`
- Modify tests: `src/components/site/stories/StoryWall.test.tsx`, `src/components/site/stories/RescueMap.test.tsx`, `src/routes/help.test.tsx`

**Interfaces:**
- Consumes: public primitives and semantic tokens.
- Preserves: stories combined-data/cache behaviour, Google Maps fallback, sponsorship payloads, report data, shared FAQ dataset.

- [ ] **Step 1: Extend existing tests with brand-semantic assertions**

```tsx
// Add to StoryWall.test.tsx
expect(markup).toContain("救援故事牆");
expect(markup).toContain("醫療照護");
expect(markup).not.toContain("card-dashed");

// Add to help.test.tsx
expect(markup).toContain('aria-label="搜尋常見問題"');

// Add to RescueMap.test.tsx
expect(markup).toContain('aria-label="Hong Kong rescue locations"');
```

- [ ] **Step 2: Run focused tests**

Run: `bun test src/components/site/stories/StoryWall.test.tsx src/components/site/stories/RescueMap.test.tsx src/routes/help.test.tsx`

Expected: at least one new assertion fails before migration.

- [ ] **Step 3: Migrate route groups**

- Sponsorship: official identity, clear monthly-support hierarchy, neutral animal cards, one pledge action, preserved proof/payment handling.
- Stories: editorial unframed layout, official-blue filters, existing status text/icons, map canvas/fallback unchanged functionally.
- Reports: official-blue chart series plus distinguishable patterns/labels; cat/dog are not pink/blue; tables remain available to non-visual users.
- Help: explicit search label, semantic result state, bilingual content unchanged, contact fallback remains visible.
- Replace old raw palette utilities and large decorative radii with semantic surfaces and 8 px-or-less repeated-card radii.

Use independent neutral chart constants; the official blue/magenta pair must not encode cat versus dog:

```ts
const CAT_COLOR = "var(--color-chart-series-1)";
const DOG_COLOR = "var(--color-chart-series-2)";
```

Legends must include text and icons so category meaning is not colour-only.

- [ ] **Step 4: Run focused and data-contract tests**

Run:

```bash
bun test src/components/site/stories/StoryWall.test.tsx src/components/site/stories/RescueMap.test.tsx src/components/site/stories/storyPublicLogic.test.ts src/lib/content/contentListRead.server.test.ts src/routes/help.test.tsx src/lib/help/faq.test.ts src/lib/help/search.test.ts src/lib/sponsorship/statusSummary.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/sponsors* src/routes/stories* src/components/site/stories src/routes/report src/components/site/AdoptionChart.tsx src/components/site/ReportHeader.tsx src/routes/help.tsx src/components/site/help
git commit -m "feat: migrate public content and transparency surfaces"
```

---

### Task 11: Add Route-Wide Browser and Accessibility Verification

**Files:**
- Create: `scripts/verify-public-brand.mjs`
- Create: `artifacts/brand-redesign/.gitkeep`
- Create: `docs/assets/brand-redesign/.gitkeep`
- Modify: `package.json`

**Interfaces:**
- Produces: `bun run verify:brand` and reproducible before/after screenshot sets.
- Consumes: `BASE_URL` (default `http://127.0.0.1:4173`), `OUTPUT_DIR` (default `artifacts/brand-redesign/after`), and `MODE` (`brand` or `baseline`).

- [ ] **Step 1: Add the verification script entry**

```json
"verify:brand": "node scripts/verify-public-brand.mjs"
```

Run: `bun run verify:brand`

Expected: FAIL because the script does not exist.

- [ ] **Step 2: Implement the Playwright verifier**

```js
// scripts/verify-public-brand.mjs
import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.OUTPUT_DIR ?? "artifacts/brand-redesign/after";
const mode = process.env.MODE ?? "brand";
const staticRoutes = [
  "/", "/about", "/about/cccp", "/about/tnr", "/about/team", "/about/privacy",
  "/animals/cat", "/animals/dog", "/adoption/instructions", "/adoption/apply",
  "/sponsors", "/sponsors/pledge", "/stories", "/volunteer", "/donate",
  "/report/adoption", "/report/audit", "/help",
];
const stateRoutes = [
  "/adoption/status/__brand-verification__",
  "/sponsors/status/__brand-verification__",
  "/volunteer/status/__brand-verification__",
  "/__brand-verification-missing__",
];
const viewports = [
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();
const failures = [];

async function firstOrFallback(page, listingRoute, selector, fallback) {
  await page.goto(new URL(listingRoute, baseURL).href, { waitUntil: "networkidle" });
  return (await page.locator(selector).first().getAttribute("href")) ?? fallback;
}

const discoveryPage = await browser.newPage();
const detailRoutes = [
  await firstOrFallback(discoveryPage, "/animals/cat", 'a[href^="/animals/cat/"]', "/animals/cat/__brand-verification__"),
  await firstOrFallback(discoveryPage, "/animals/dog", 'a[href^="/animals/dog/"]', "/animals/dog/__brand-verification__"),
  await firstOrFallback(discoveryPage, "/sponsors", 'a[href^="/sponsors/"]:not([href="/sponsors/pledge"])', "/sponsors/__brand-verification__"),
  await firstOrFallback(discoveryPage, "/stories", 'a[href^="/stories/"]', "/stories/__brand-verification__"),
];
await discoveryPage.close();
const routes = [...staticRoutes, ...detailRoutes, ...stateRoutes];

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  for (const route of routes) {
    const response = await page.goto(new URL(route, baseURL).href, { waitUntil: "networkidle" });
    const synthetic = route.includes("__brand-verification");
    if (!response || (!response.ok() && !(synthetic && response.status() === 404))) {
      failures.push(`${route} returned ${response?.status()}`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (overflow) failures.push(`${route} overflows at ${viewport.name}`);
    if (mode === "brand") {
      const logo = page.locator('img[alt="香港拯救貓狗協會 HKSCDA"]').first();
      if ((await logo.count()) === 0) failures.push(`${route} has no official logo`);
    }
    await page.screenshot({
      path: `${outputDir}/${route === "/" ? "home" : route.slice(1).replaceAll("/", "-")}-${viewport.name}.png`,
      fullPage: true,
    });
  }
  if (consoleErrors.length) failures.push(...consoleErrors.map((error) => `${viewport.name}: ${error}`));
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Verified ${routes.length} routes across ${viewports.length} viewports`);
```

- [ ] **Step 3: Add targeted interaction checks**

Extend the script after each relevant navigation:

```js
if (route === "/") {
  const menu = page.getByRole("button", { name: "開啟選單" });
  if (await menu.isVisible()) {
    await menu.click();
    await page.getByRole("navigation", { name: "主選單" }).waitFor();
    await page.keyboard.press("Escape");
  }
}
if (route === "/help") {
  await page.getByRole("searchbox", { name: "搜尋常見問題" }).fill("領養");
}
```

Also add the following exact assertions to the same loop:
- Tab-order/focus-visible check on header actions.
- 200% reflow check using a dedicated context whose CSS viewport width is `Math.ceil(viewport.width / 2)`, then repeat the overflow assertion; do not use device-pixel ratio as a zoom proxy.
- Reduced-motion context run for homepage/About.
- Logo natural-width/natural-height ratio assertion.
- Network response listener that records 404 assets.
- One-and-only-one `h1` assertion for non-error routes.
- Privacy-safe recovery-copy assertion for the three synthetic status-token routes.

- [ ] **Step 4: Build and serve the production output**

Capture the current production baseline before starting the local preview:

```powershell
$env:BASE_URL="https://hkscda.vercel.app"
$env:MODE="baseline"
$env:OUTPUT_DIR="artifacts/brand-redesign/before"
bun run verify:brand
Remove-Item Env:BASE_URL,Env:MODE,Env:OUTPUT_DIR
```

Terminal A:

```bash
bun run build
bun run preview -- --host 127.0.0.1 --port 4173
```

Terminal B:

```bash
bun run verify:brand
```

Expected: `Verified 26 routes across 5 viewports` for both baseline capture and branded local verification. When a listing has no records, its synthetic detail fallback must still render a branded not-found state.

- [ ] **Step 5: Manually inspect representative screenshots**

Inspect:

- `artifacts/brand-redesign/after/home-375x812.png`
- `artifacts/brand-redesign/after/about-390x844.png`
- `artifacts/brand-redesign/after/animals-cat-768x1024.png`
- `artifacts/brand-redesign/after/donate-1024x768.png`
- `artifacts/brand-redesign/after/about-1440x900.png`

Confirm logo sharpness/aspect ratio, next-section visibility, no collisions, readable Traditional Chinese, coherent action hierarchy, and no fixed-control coverage.

Copy those five `before` and five `after` screenshots to `docs/assets/brand-redesign/` with `before-` and `after-` filename prefixes so the redesign report and PR retain representative visual evidence.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-public-brand.mjs package.json artifacts/brand-redesign/.gitkeep docs/assets/brand-redesign
git commit -m "test: add public brand browser verification"
```

---

### Task 12: Remove Deprecated Identity, Complete Documentation, and Run Final Verification

**Files:**
- Modify: `src/styles.css`
- Modify: any remaining public files found by scans
- Create: `docs/HKSCDA_BRAND_AUDIT.md`
- Create: `docs/HKSCDA_COLOR_SYSTEM.md`
- Create: `docs/HKSCDA_REDESIGN_REPORT.md`
- Modify: `src/lib/brand/publicCopyGuard.test.ts`
- Modify: `src/lib/brand/publicFormGuard.test.ts`

**Interfaces:**
- Removes: `btn-cta`, `btn-navy`, `card-dashed`, `arch-mask`, `bg-topo`, old pink/lavender/panel palette aliases from public source.
- Produces: final audit evidence and release-ready verification record.

- [ ] **Step 1: Strengthen the final deprecated-identity guard**

```ts
// Add to publicCopyGuard.test.ts
const publicPaths = await Array.fromAsync(
  new Bun.Glob("src/{components/site,routes}/**/*.{ts,tsx}").scan("."),
);
const joined = (await Promise.all(publicPaths.map((path) => Bun.file(path).text()))).join("\n");
for (const token of ["btn-cta", "btn-navy", "card-dashed", "arch-mask", "bg-topo", "--color-pink-strip"]) {
  expect(joined).not.toContain(token);
}
expect(joined).not.toContain("Poofyco");
```

- [ ] **Step 2: Run the guard and remove every reported legacy use**

Run:

```bash
bun test src/lib/brand/publicCopyGuard.test.ts src/lib/brand/publicFormGuard.test.ts
rg -n "Poofyco|btn-cta|btn-navy|card-dashed|arch-mask|bg-topo|color-pink-strip|PawPrint.*Logo" src/components/site src/routes src/styles.css
```

Expected: tests pass; `rg` returns no public identity-system matches. Functional PawPrint icons may remain only where they convey an animal/action meaning, never as the organisation logo or decoration.

- [ ] **Step 3: Complete the brand audit**

`docs/HKSCDA_BRAND_AUDIT.md` must include:

- Official and supporting URLs reviewed.
- Selected asset source, format, 960 x 960 dimensions, and retrieval limitation.
- Existing paw-substitute and Poofyco-palette problems.
- Blue and magenta sampling clusters and selected canonical values.
- Logo usage rules.
- Accessibility findings and contrast evidence.

- [ ] **Step 4: Complete the colour-system document**

`docs/HKSCDA_COLOR_SYSTEM.md` must include:

- Brand, semantic, neutral, status, chart, form, and focus tokens.
- HEX, RGB, HSL/OKLCH, contrast ratios, permitted use, and prohibited use.
- Examples for primary/secondary buttons, links, surfaces, notices, and statuses.
- Admin compatibility scope.

- [ ] **Step 5: Complete the redesign report**

`docs/HKSCDA_REDESIGN_REPORT.md` must include:

- Every public route reviewed.
- Components/files changed and practical user/brand benefit.
- Logo, metadata, About, accessibility, and responsive changes.
- Before/after screenshot pairs committed beneath `docs/assets/brand-redesign/`, plus the complete local artifact paths.
- Automated test/build/browser results.
- Remaining limitations, including direct original-site Cloudflare access and any owner confirmation still needed.

- [ ] **Step 6: Run the complete verification matrix**

```bash
bunx tsc --noEmit
bun run lint
bun test
bun run build
git diff origin/main...HEAD --check
rg -n "AIza[0-9A-Za-z_-]{20,}|VITE_.*=\S+" . --glob '!node_modules/**' --glob '!.git/**'
```

Expected:

- Type check: no new errors; separate any verified baseline errors.
- Lint: exit 0.
- Tests: all pass. If the known `applicationsRouteNesting.test.ts` timeout recurs only in the parallel full run, rerun it once in isolation and record both results separately from new regressions.
- Build: exit 0.
- Diff check: no whitespace errors.
- Secret scan: no matches.

Run the browser matrix against the production preview:

```bash
bun run verify:brand
```

Expected: 26 inventory routes x 5 viewports verified with no console, asset, overflow, or logo failures.

- [ ] **Step 7: Perform final visual and code review**

Use the requesting-code-review workflow on the complete branch. Review:

- Official logo fidelity and dimensions.
- Public/admin token isolation.
- No invented facts.
- No backend/payment contract changes.
- Colour-not-only statuses.
- Focus, touch targets, reduced motion, and zoom.
- Mobile/desktop screenshot coherence.

Address every high/medium finding and rerun the affected focused tests plus build.

- [ ] **Step 8: Commit**

```bash
git add src/styles.css src/components/site src/routes docs/HKSCDA_BRAND_AUDIT.md docs/HKSCDA_COLOR_SYSTEM.md docs/HKSCDA_REDESIGN_REPORT.md
git commit -m "docs: complete HKSCDA redesign audit"
```

---

## Execution Checkpoints

1. After Tasks 1-2: review logo provenance, colour evidence, and public/admin isolation.
2. After Tasks 3-5: review shared primitives, metadata, header/mobile drawer, footer, and root recovery states.
3. After Tasks 6-7: review About, verified figures, home, and informational routes at mobile/desktop sizes.
4. After Tasks 8-10: review animal discovery, public forms, donation trust, content, reports, and Help.
5. After Tasks 11-12: review route matrix, screenshots, accessibility evidence, documentation, and whole-branch diff.

## Plan Completion Criteria

- The website uses the authentic HKSCDA identity rather than a generated paw substitute.
- Official blue/magenta and accessible semantic variants are centralised and documented.
- Public routes share one coherent visual language; admin remains operational.
- About communicates identity, mission, verified impact, approach, responsibility, and ways to help.
- Every public route in the spec is verified at the required viewports.
- Tests, lint, type check, production build, browser verification, and secret scan have evidence.
- The three required documentation files are complete.
