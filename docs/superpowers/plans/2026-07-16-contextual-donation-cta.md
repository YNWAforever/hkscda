# Contextual Donation CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contextual, collision-safe donation prompt across eligible public pages and attribute its complete GA4 funnel through server-confirmed donation success.

**Architecture:** Pure donation prompt contracts classify routes, validate attribution, and drive a browser trigger hook. A public fixed-action provider measures the shortlist and donation prompt, publishes shared CSS offsets, and coordinates the help panel. Attribution follows the existing Zod request, donation service, and Supabase repository path; a minimal rate-limited status endpoint confirms payment before success analytics fire.

**Tech Stack:** React 19, TanStack Start/Router, TypeScript, Zod, Tailwind CSS 4, Bun test, Supabase Postgres, GA4, Playwright.

## Global Constraints

- Show on eligible public pages after either 35% document scroll or 10 seconds, whichever happens first.
- Hide on `/donate`, `/admin`, adoption/sponsorship workflow and status routes, volunteer status routes, API routes, and error-only shells.
- Mobile placement is a full-width bottom prompt; desktop placement is a compact lower-left prompt.
- Closing the prompt suppresses it for the current browser session.
- Opening the help panel temporarily hides the prompt; shortlist, prompt, and help controls must never overlap.
- Valid purposes remain exactly `general`, `medical`, and `sponsor`; donors can change the preselected purpose.
- Analytics must never include name, email, phone, donation ID, raw path, query string, or free-form copy.
- `donation_success` requires a server-confirmed `succeeded` donation status, never `?status=success` alone.
- Do not add images, external UI dependencies, recurring donations, payment providers, an admin dashboard, or A/B testing.
- Preserve direct `/donate` visits and every existing payment method.

---

### Task 1: Typed Prompt Profiles and Attribution Contract

**Files:**
- Create: `src/lib/donations/contracts.ts`
- Create: `src/lib/donations/attribution.ts`
- Create: `src/lib/donations/attribution.test.ts`
- Create: `src/lib/donations/prompt.ts`
- Create: `src/lib/donations/prompt.test.ts`
- Modify: `src/lib/donations/domain.ts`

**Interfaces:**
- Produces: `DonationContext`, `DonationPlacement`, `DonationTrigger`, `DonationAttribution`, `donationAttributionSchema`, `resolveDonationPrompt(pathname)`, `buildDonationAttribution(profile, placement, trigger)`, and `buildDonationPromptHref(attribution)`.
- Existing imports of `DonationPurpose`, `DonationMethod`, and `DonationLanguage` continue to work through re-exports from `domain.ts`.

- [ ] **Step 1: Write failing route and attribution tests**

```ts
// src/lib/donations/prompt.test.ts
import { describe, expect, test } from "bun:test";
import { resolveDonationPrompt } from "./prompt";

describe("resolveDonationPrompt", () => {
  test.each([
    ["/stories", "story", "general"],
    ["/stories/lucky-new-start", "story", "general"],
    ["/animals/cat/123", "animal", "medical"],
    ["/adoption", "animal", "medical"],
    ["/sponsors", "sponsor", "sponsor"],
    ["/about", "transparency", "general"],
    ["/reports/annual", "transparency", "general"],
    ["/volunteer", "community", "general"],
    ["/help", "community", "general"],
    ["/", "general", "general"],
  ])("maps %s to %s", (pathname, context, purpose) => {
    expect(resolveDonationPrompt(pathname)).toMatchObject({ context, purpose });
  });

  test.each([
    "/donate",
    "/admin/login",
    "/adoption/apply",
    "/adoption/status/token",
    "/sponsors/pledge",
    "/sponsors/status/token",
    "/volunteer/status/token",
    "/api/stories",
  ])("hides workflow route %s", (pathname) => {
    expect(resolveDonationPrompt(pathname)).toBeNull();
  });
});
```

```ts
// src/lib/donations/attribution.test.ts
import { describe, expect, test } from "bun:test";
import {
  buildDonationAttribution,
  buildDonationPromptHref,
  donationAttributionSchema,
} from "./attribution";
import { resolveDonationPrompt } from "./prompt";

describe("donation attribution", () => {
  test("builds a controlled contextual CTA URL", () => {
    const profile = resolveDonationPrompt("/stories/rescue-1");
    if (!profile) throw new Error("Expected story profile");
    const attribution = buildDonationAttribution(profile, "mobile-bottom", "scroll");
    expect(buildDonationPromptHref(attribution)).toBe(
      "/donate?source=contextual-cta&context=story&purpose=general&placement=mobile-bottom&trigger=scroll",
    );
  });

  test("rejects unsupported or free-form values", () => {
    expect(() => donationAttributionSchema.parse({
      source: "contextual-cta",
      context: "story<script>",
      purpose: "general",
      placement: "mobile-bottom",
      trigger: "scroll",
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests and confirm the missing-module failure**

Run: `bun test src/lib/donations/prompt.test.ts src/lib/donations/attribution.test.ts`

Expected: FAIL because `./prompt` and `./attribution` do not exist.

- [ ] **Step 3: Add shared enums, schemas, and deterministic route profiles**

```ts
// src/lib/donations/contracts.ts
export const donationPurposes = ["general", "medical", "sponsor"] as const;
export const donationMethods = ["stripe", "payme", "fps", "paypal"] as const;
export const donationLanguages = ["zh-HK", "en"] as const;
export const donationContexts = [
  "general", "story", "animal", "sponsor", "transparency", "community",
] as const;
export const donationPlacements = ["mobile-bottom", "desktop-left"] as const;
export const donationTriggers = ["scroll", "timer"] as const;

export type DonationPurpose = (typeof donationPurposes)[number];
export type DonationMethod = (typeof donationMethods)[number];
export type DonationLanguage = (typeof donationLanguages)[number];
export type DonationContext = (typeof donationContexts)[number];
export type DonationPlacement = (typeof donationPlacements)[number];
export type DonationTrigger = (typeof donationTriggers)[number];
```

```ts
// src/lib/donations/attribution.ts
import { z } from "zod";
import {
  donationContexts, donationPlacements, donationPurposes, donationTriggers,
  type DonationPlacement, type DonationTrigger,
} from "./contracts";
import type { DonationPromptProfile } from "./prompt";

export const donationAttributionSchema = z.object({
  source: z.literal("contextual-cta"),
  context: z.enum(donationContexts),
  purpose: z.enum(donationPurposes),
  placement: z.enum(donationPlacements),
  trigger: z.enum(donationTriggers),
});
export type DonationAttribution = z.infer<typeof donationAttributionSchema>;

export function buildDonationAttribution(
  profile: DonationPromptProfile,
  placement: DonationPlacement,
  trigger: DonationTrigger,
): DonationAttribution {
  return { source: "contextual-cta", context: profile.context, purpose: profile.purpose, placement, trigger };
}

export function buildDonationPromptHref(value: DonationAttribution) {
  const params = new URLSearchParams(Object.entries(value));
  return `/donate?${params.toString()}`;
}
```

```ts
// src/lib/donations/prompt.ts
import type { DonationContext, DonationPurpose } from "./contracts";

export type DonationPromptProfile = {
  context: DonationContext;
  purpose: DonationPurpose;
  zh: { message: string; action: string };
  en: { message: string; action: string };
};

const profiles: Record<DonationContext, DonationPromptProfile> = {
  general: { context: "general", purpose: "general", zh: { message: "每一份支持，都讓救援走得更遠", action: "立即捐助" }, en: { message: "Every gift helps rescue work go further", action: "Donate now" } },
  story: { context: "story", purpose: "general", zh: { message: "讓下一個生命也迎來轉機", action: "支持救援" }, en: { message: "Help the next rescued life find a new start", action: "Support rescue" } },
  animal: { context: "animal", purpose: "medical", zh: { message: "支持醫療、暫託及日常照護", action: "幫助牠們" }, en: { message: "Support medical care, fostering, and daily care", action: "Help them" } },
  sponsor: { context: "sponsor", purpose: "sponsor", zh: { message: "未能助養，也可支持整體救援工作", action: "捐助支持" }, en: { message: "Not ready to sponsor? You can still support rescue", action: "Donate" } },
  transparency: { context: "transparency", purpose: "general", zh: { message: "讓透明而持續的救援工作走得更遠", action: "立即捐助" }, en: { message: "Help transparent, sustainable rescue work continue", action: "Donate now" } },
  community: { context: "community", purpose: "general", zh: { message: "支持前線救援及社區工作", action: "支持我們" }, en: { message: "Support frontline rescue and community work", action: "Support us" } },
};

const excluded = ["/donate", "/admin", "/api", "/adoption/apply", "/adoption/status", "/sponsors/pledge", "/sponsors/status", "/volunteer/status"];
const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function resolveDonationPrompt(pathname: string): DonationPromptProfile | null {
  if (excluded.some((prefix) => matches(pathname, prefix))) return null;
  if (matches(pathname, "/stories")) return profiles.story;
  if (matches(pathname, "/animals") || matches(pathname, "/adoption")) return profiles.animal;
  if (matches(pathname, "/sponsors")) return profiles.sponsor;
  if (matches(pathname, "/about") || matches(pathname, "/reports")) return profiles.transparency;
  if (matches(pathname, "/volunteer") || matches(pathname, "/help") || matches(pathname, "/contact")) return profiles.community;
  return profiles.general;
}
```

Update `domain.ts` to import the three existing donation enum arrays and types from `contracts.ts`, re-export their types, and use them in the current Zod schema. Do not change request behavior in this task.

- [ ] **Step 4: Run focused tests**

Run: `bun test src/lib/donations/prompt.test.ts src/lib/donations/attribution.test.ts src/lib/donations/domain.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/donations/contracts.ts src/lib/donations/attribution.ts src/lib/donations/attribution.test.ts src/lib/donations/prompt.ts src/lib/donations/prompt.test.ts src/lib/donations/domain.ts
git commit -m "feat: define contextual donation prompt contract"
```

### Task 2: Trigger State and Privacy-safe Funnel Analytics

**Files:**
- Create: `src/lib/donations/promptTrigger.ts`
- Create: `src/lib/donations/promptTrigger.test.ts`
- Create: `src/lib/donations/analytics.ts`
- Create: `src/lib/donations/analytics.test.ts`

**Interfaces:**
- Consumes: `DonationAttribution` and donation contract types from Task 1.
- Produces: `scrollProgress`, `reducePromptTrigger`, `trackDonationEvent`, `markDonationEventOnce`, `saveCheckoutSnapshot`, and `readCheckoutSnapshot`.

- [ ] **Step 1: Write failing state-machine and analytics tests**

```ts
// src/lib/donations/promptTrigger.test.ts
import { describe, expect, test } from "bun:test";
import { initialPromptTriggerState, reducePromptTrigger, scrollProgress } from "./promptTrigger";

describe("donation prompt trigger", () => {
  test("qualifies once with the first trigger", () => {
    const qualified = reducePromptTrigger(initialPromptTriggerState, { type: "qualify", trigger: "scroll" });
    expect(qualified).toEqual({ visible: true, dismissed: false, trigger: "scroll" });
    expect(reducePromptTrigger(qualified, { type: "qualify", trigger: "timer" })).toBe(qualified);
  });
  test("dismissal wins for the session", () => {
    const dismissed = reducePromptTrigger(initialPromptTriggerState, { type: "dismiss" });
    expect(reducePromptTrigger(dismissed, { type: "qualify", trigger: "timer" }).visible).toBe(false);
  });
  test("calculates progress from scrollable range", () => {
    expect(scrollProgress({ scrollY: 350, scrollHeight: 1800, viewportHeight: 800 })).toBe(0.35);
    expect(scrollProgress({ scrollY: 0, scrollHeight: 800, viewportHeight: 800 })).toBe(0);
  });
});
```

```ts
// src/lib/donations/analytics.test.ts
import { describe, expect, spyOn, test } from "bun:test";
import * as baseAnalytics from "../analytics";
import { trackDonationEvent } from "./analytics";

describe("donation analytics", () => {
  test("sends only controlled non-PII parameters", () => {
    const spy = spyOn(baseAnalytics, "gtagEvent");
    trackDonationEvent("donation_cta_click", {
      attribution: { source: "contextual-cta", context: "story", purpose: "general", placement: "mobile-bottom", trigger: "scroll" },
    });
    expect(spy.mock.calls[0]?.[1]).toEqual({ context: "story", purpose: "general", placement: "mobile-bottom", trigger: "scroll" });
    expect(spy.mock.calls[0]?.[1]).not.toHaveProperty("donation_id");
    expect(spy.mock.calls[0]?.[1]).not.toHaveProperty("page_path");
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests and confirm missing exports**

Run: `bun test src/lib/donations/promptTrigger.test.ts src/lib/donations/analytics.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the reducer and analytics boundary**

```ts
// src/lib/donations/promptTrigger.ts
import type { DonationTrigger } from "./contracts";
export type PromptTriggerState = { visible: boolean; dismissed: boolean; trigger?: DonationTrigger };
export type PromptTriggerEvent = { type: "qualify"; trigger: DonationTrigger } | { type: "dismiss" } | { type: "reset"; dismissed: boolean };
export const initialPromptTriggerState: PromptTriggerState = { visible: false, dismissed: false };
export function reducePromptTrigger(state: PromptTriggerState, event: PromptTriggerEvent): PromptTriggerState {
  if (event.type === "reset") return { visible: false, dismissed: event.dismissed };
  if (event.type === "dismiss") return { visible: false, dismissed: true };
  if (state.dismissed || state.visible) return state;
  return { visible: true, dismissed: false, trigger: event.trigger };
}
export function scrollProgress(input: { scrollY: number; scrollHeight: number; viewportHeight: number }) {
  const range = input.scrollHeight - input.viewportHeight;
  return range <= 0 ? 0 : Math.min(1, Math.max(0, input.scrollY / range));
}
```

Implement `analytics.ts` with the five literal event names, a parameter type that accepts only controlled attribution plus `method`, `value`, and `currency`, and a `DonationCheckoutSnapshot` containing those analytics-safe values. Use `sessionStorage` inside `try/catch`; return `false`/`undefined` when storage is unavailable. Keys must be `hkscda:donation-event:<event>:<journeyKey>` and `hkscda:donation-checkout:<donationId>`. Never pass `journeyKey` or `donationId` to `gtagEvent`.

- [ ] **Step 4: Run focused tests**

Run: `bun test src/lib/donations/promptTrigger.test.ts src/lib/donations/analytics.test.ts src/lib/help/analytics.test.ts`

Expected: PASS, including the existing help privacy tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/donations/promptTrigger.ts src/lib/donations/promptTrigger.test.ts src/lib/donations/analytics.ts src/lib/donations/analytics.test.ts
git commit -m "feat: add donation prompt trigger analytics"
```

### Task 3: Shared Fixed-action Layout and Help Coordination

**Files:**
- Create: `src/components/site/fixedActions/fixedActionLayout.ts`
- Create: `src/components/site/fixedActions/fixedActionLayout.test.ts`
- Create: `src/components/site/fixedActions/PublicFixedActions.tsx`
- Modify: `src/components/site/ShortlistTray.tsx`
- Modify: `src/components/site/help/HelpWidget.tsx`
- Modify: `src/routes/__root.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `PublicFixedActionsProvider`, `usePublicFixedActions()`, `useFixedActionRegistration(name, active)`, and measured CSS variables `--donation-prompt-bottom`, `--help-widget-bottom`, and `--public-content-bottom-offset`.
- Task 4 registers the donation prompt through this provider.

- [ ] **Step 1: Write the failing layout calculation test**

```ts
import { describe, expect, test } from "bun:test";
import { calculateFixedActionLayout } from "./fixedActionLayout";

describe("fixed public action layout", () => {
  test("stacks shortlist, prompt, and help with 12px gaps", () => {
    expect(calculateFixedActionLayout({ shortlistHeight: 96, donationHeight: 64 })).toEqual({
      donationBottom: 124,
      helpBottom: 200,
      contentBottom: 188,
    });
  });
  test("uses a 16px baseline when no measured action is visible", () => {
    expect(calculateFixedActionLayout({ shortlistHeight: 0, donationHeight: 0 })).toEqual({
      donationBottom: 16,
      helpBottom: 16,
      contentBottom: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test src/components/site/fixedActions/fixedActionLayout.test.ts`

Expected: FAIL because `fixedActionLayout.ts` does not exist.

- [ ] **Step 3: Implement measured layout state and CSS variables**

```ts
// fixedActionLayout.ts
export function calculateFixedActionLayout(input: { shortlistHeight: number; donationHeight: number }) {
  const shortlistGap = input.shortlistHeight > 0 ? 12 : 0;
  const donationGap = input.donationHeight > 0 ? 12 : 0;
  const donationBottom = input.shortlistHeight > 0 ? 16 + input.shortlistHeight + shortlistGap : 16;
  const contentBottom = input.shortlistHeight + input.donationHeight + shortlistGap + donationGap;
  const helpBottom = contentBottom > 0 ? 16 + contentBottom : 16;
  return { donationBottom, helpBottom, contentBottom };
}
```

`PublicFixedActions.tsx` must:

- hold `shortlistHeight`, `donationHeight`, and `helpOpen` in context;
- expose a `useFixedActionRegistration("shortlist" | "donation", active)` ref hook backed by `ResizeObserver`, with one `getBoundingClientRect()` fallback;
- reset a registered height to zero when inactive or unmounted;
- render the existing `.site-shell min-h-dvh` wrapper and set the three numeric CSS variables from `calculateFixedActionLayout`;
- expose `helpOpen` and `setHelpOpen` so the prompt can hide while the panel is open.

Modify `ShortlistTray` to register its `<aside>` as `shortlist`, and replace `bottom-3` with inline `bottom: calc(env(safe-area-inset-bottom) + 0.75rem)`. Modify `HelpWidget` to use context-owned `helpOpen` instead of local `open`, remove its shortlist-count bottom-class calculation, and use `bottom: calc(env(safe-area-inset-bottom) + var(--help-widget-bottom))`.

In `__root.tsx`, replace the public `.site-shell` `<div>` with `PublicFixedActionsProvider`. Keep `ShortlistProvider` outside it because fixed actions read shortlist state. Add this rule without changing existing brand tokens:

```css
.site-shell {
  padding-bottom: var(--public-content-bottom-offset, 0px);
}
```

- [ ] **Step 4: Run focused tests and type-aware build**

Run: `bun test src/components/site/fixedActions/fixedActionLayout.test.ts src/components/site/SiteChrome.test.tsx src/lib/brand/contrast.test.ts`

Expected: PASS.

Run: `bun run build`

Expected: PASS with no context-provider or CSS typing errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/fixedActions src/components/site/ShortlistTray.tsx src/components/site/help/HelpWidget.tsx src/routes/__root.tsx src/styles.css src/routeTree.gen.ts
git commit -m "feat: coordinate public fixed actions"
```

### Task 4: Contextual Donation Prompt UI

**Files:**
- Create: `src/components/site/donations/useDonationPromptTrigger.ts`
- Create: `src/components/site/donations/ContextualDonationPrompt.tsx`
- Create: `src/components/site/donations/ContextualDonationPrompt.test.tsx`
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Consumes: Task 1 profile/attribution builders, Task 2 state and analytics, and Task 3 fixed-action context.
- Produces: one root-mounted prompt that is absent on excluded routes, keyboard accessible, dismissible, and collision safe.

- [ ] **Step 1: Write a failing presentational test**

```tsx
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DonationPromptSurface } from "./ContextualDonationPrompt";

describe("DonationPromptSurface", () => {
  test("renders approved story copy and accessible actions", () => {
    const markup = renderToStaticMarkup(
      <DonationPromptSurface
        message="讓下一個生命也迎來轉機"
        action="支持救援"
        href="/donate?source=contextual-cta"
        onDismiss={() => undefined}
        register={() => undefined}
      />,
    );
    expect(markup).toContain("讓下一個生命也迎來轉機");
    expect(markup).toContain("支持救援");
    expect(markup).toContain("關閉捐助提示");
    expect(markup).toContain("min-h-11");
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test src/components/site/donations/ContextualDonationPrompt.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the browser trigger hook and prompt**

`useDonationPromptTrigger.ts` must use the Task 2 reducer, a passive `scroll` listener, a 10,000ms timer, and a `hkscda:donation-prompt:dismissed` session key. It must reset on `pathname`, remove both trigger paths after qualification, fall back to the timer on short pages, and return `{ visible, trigger, dismiss }`.

`DonationPromptSurface` must render:

- an un-nested fixed surface with a Heart icon, one short message, one CTA link, and an icon-only X close button with `aria-label="關閉捐助提示"`;
- mobile `inset-x-3` full-width behavior and desktop `left-6 right-auto max-w-sm` behavior;
- `bottom: calc(env(safe-area-inset-bottom) + var(--donation-prompt-bottom))`;
- minimum 44px targets, visible focus styling, `data-donation-prompt`, and a reduced-motion-safe entrance transition.

`ContextualDonationPrompt({ pathname })` must resolve the profile, derive placement with the existing `useIsMobile()` hook, hide while `helpOpen`, register its measured height only while rendered, emit one impression after becoming visible, emit one click before navigation, and build its URL exclusively through Task 1 helpers.

Mount `<ContextualDonationPrompt pathname={location.pathname} />` after `<ShortlistTray />` and before `<HelpWidget />` in `RootComponent`.

- [ ] **Step 4: Run focused tests and lint**

Run: `bun test src/components/site/donations/ContextualDonationPrompt.test.tsx src/lib/donations/prompt.test.ts src/lib/donations/promptTrigger.test.ts src/lib/donations/analytics.test.ts`

Expected: PASS.

Run: `bun run lint`

Expected: PASS with hooks dependencies and accessible controls accepted.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/donations src/routes/__root.tsx
git commit -m "feat: show contextual donation prompts"
```

### Task 5: Donation-page Prefill and Journey Events

**Files:**
- Create: `src/lib/donations/donateSearch.ts`
- Create: `src/lib/donations/donateSearch.test.ts`
- Modify: `src/routes/donate.tsx`

**Interfaces:**
- Consumes: Task 1 attribution schema and Task 2 analytics/snapshot helpers.
- Produces: validated search parameters, changeable purpose prefill, `donation_form_view`, `begin_checkout`, and a checkout snapshot keyed by the returned donation ID.

- [ ] **Step 1: Write failing search-contract tests**

```ts
import { describe, expect, test } from "bun:test";
import { donateSearchSchema, extractDonationAttribution } from "./donateSearch";

describe("donate search attribution", () => {
  test("accepts a complete controlled attribution", () => {
    const parsed = donateSearchSchema.parse({ source: "contextual-cta", context: "animal", purpose: "medical", placement: "desktop-left", trigger: "timer" });
    expect(extractDonationAttribution(parsed)).toEqual(parsed);
  });
  test("treats a partial attribution as a direct visit", () => {
    const parsed = donateSearchSchema.parse({ purpose: "medical" });
    expect(extractDonationAttribution(parsed)).toBeUndefined();
  });
  test("rejects unsupported purposes", () => {
    expect(() => donateSearchSchema.parse({ purpose: "campaign-free-text" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test src/lib/donations/donateSearch.test.ts`

Expected: FAIL because `donateSearch.ts` does not exist.

- [ ] **Step 3: Add the validated search schema and wire the form**

Create `donateSearchSchema` by extending optional attribution fields with the existing optional `status` and `donation` fields. `extractDonationAttribution` returns a value only when all five acquisition fields parse together.

Modify `donate.tsx` to:

```ts
const search = Route.useSearch();
const attribution = extractDonationAttribution(search);
const [purpose, setPurpose] = useState<DonationPurpose>(search.purpose ?? "general");
```

Replace the local search schema with the exported one. On first attributed render, call `markDonationEventOnce("donation_form_view", JSON.stringify(attribution))` before `trackDonationEvent`. Include `attribution` in the POST body only when complete.

Change the response union so both manual and redirect results include `donationId`. After a successful API response:

1. build and save the analytics-safe checkout snapshot;
2. emit `begin_checkout` once with method, HKD value in dollars, and attribution;
3. then redirect or render manual instructions exactly as today.

Do not disable the purpose controls after prefill.

- [ ] **Step 4: Run donation tests**

Run: `bun test src/lib/donations/donateSearch.test.ts src/lib/donations/domain.test.ts src/lib/donations/service.test.ts src/lib/donations/analytics.test.ts`

Expected: PASS.

Run: `bun run build`

Expected: PASS and regenerate route search typing without widening values to arbitrary strings.

- [ ] **Step 5: Commit**

```bash
git add src/lib/donations/donateSearch.ts src/lib/donations/donateSearch.test.ts src/routes/donate.tsx src/routeTree.gen.ts
git commit -m "feat: prefill attributed donation journeys"
```

### Task 6: Persist Controlled Attribution with Donations

**Files:**
- Create: `supabase/migrations/20260716120000_contextual_donation_attribution.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`
- Modify: `src/lib/donations/domain.ts`
- Modify: `src/lib/donations/domain.test.ts`
- Modify: `src/lib/donations/service.ts`
- Modify: `src/lib/donations/service.test.ts`
- Modify: `src/lib/donations/supabase.server.ts`

**Interfaces:**
- Consumes: `donationAttributionSchema` from Task 1 and form POST data from Task 5.
- Produces: optional `acquisition_source`, `acquisition_context`, `acquisition_placement`, and `acquisition_trigger` values on `public.donation`.

- [ ] **Step 1: Write failing migration, domain, and service assertions**

Add a migration safety test that loads `_contextual_donation_attribution.sql` and expects all four nullable columns plus check constraints containing only approved values. Extend `domain.test.ts` to parse a valid attribution and reject an unknown context. Extend the fake service repository to capture `createDonation` inputs and assert:

```ts
expect(repository.donations[0]).toMatchObject({
  acquisition_source: "contextual-cta",
  acquisition_context: "animal",
  acquisition_placement: "mobile-bottom",
  acquisition_trigger: "scroll",
});
```

Also assert a direct donation writes all four fields as `null`.

- [ ] **Step 2: Run tests and confirm failure**

Run: `bun test src/lib/supabaseMigrations.test.ts src/lib/donations/domain.test.ts src/lib/donations/service.test.ts`

Expected: FAIL because the migration and attribution mapping do not exist.

- [ ] **Step 3: Add the idempotent migration**

```sql
alter table public.donation
  add column if not exists acquisition_source text,
  add column if not exists acquisition_context text,
  add column if not exists acquisition_placement text,
  add column if not exists acquisition_trigger text;

alter table public.donation drop constraint if exists donation_acquisition_source_check;
alter table public.donation add constraint donation_acquisition_source_check
  check (acquisition_source is null or acquisition_source = 'contextual-cta');
alter table public.donation drop constraint if exists donation_acquisition_context_check;
alter table public.donation add constraint donation_acquisition_context_check
  check (acquisition_context is null or acquisition_context in ('general','story','animal','sponsor','transparency','community'));
alter table public.donation drop constraint if exists donation_acquisition_placement_check;
alter table public.donation add constraint donation_acquisition_placement_check
  check (acquisition_placement is null or acquisition_placement in ('mobile-bottom','desktop-left'));
alter table public.donation drop constraint if exists donation_acquisition_trigger_check;
alter table public.donation add constraint donation_acquisition_trigger_check
  check (acquisition_trigger is null or acquisition_trigger in ('scroll','timer'));
```

Do not add public grants or RLS policies.

- [ ] **Step 4: Extend request validation and repository mapping**

Add `attribution: donationAttributionSchema.optional()` to `donationRequestSchema`. Extend `DonationRepository.createDonation` with the four nullable fields. Map `donationInput.attribution` to those fields in `createDonation`; use `null` for direct visits. The Supabase repository continues to insert the typed object unchanged.

- [ ] **Step 5: Run focused and migration safety tests**

Run: `bun test src/lib/supabaseMigrations.test.ts src/lib/donations/domain.test.ts src/lib/donations/service.test.ts`

Expected: PASS for attributed and direct donations.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260716120000_contextual_donation_attribution.sql src/lib/supabaseMigrations.test.ts src/lib/donations/domain.ts src/lib/donations/domain.test.ts src/lib/donations/service.ts src/lib/donations/service.test.ts src/lib/donations/supabase.server.ts
git commit -m "feat: persist donation acquisition attribution"
```

### Task 7: Server-confirmed Success Analytics

**Files:**
- Create: `src/lib/donations/publicStatus.server.ts`
- Create: `src/lib/donations/publicStatus.server.test.ts`
- Create: `src/lib/donations/publicStatus.ts`
- Create: `src/lib/donations/publicStatus.test.ts`
- Create: `src/routes/api/donations/$donationId/status.ts`
- Modify: `src/lib/donations/supabase.server.ts`
- Modify: `src/routes/donate.tsx`
- Modify: `src/routeTree.gen.ts` (generated)

**Interfaces:**
- Produces: a no-store, rate-limited GET endpoint returning only `{ status }`, plus bounded client polling that emits `donation_success` once after `succeeded`.

- [ ] **Step 1: Write failing status service and polling tests**

```ts
// publicStatus.server.test.ts
import { describe, expect, test } from "bun:test";
import { loadPublicDonationStatus } from "./publicStatus.server";

describe("public donation status", () => {
  test("returns only payment state", async () => {
    const result = await loadPublicDonationStatus({ donationId: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a", repository: { findStatus: async () => "succeeded" } });
    expect(result).toEqual({ status: "succeeded" });
  });
  test("hides invalid and missing donations", async () => {
    expect(await loadPublicDonationStatus({ donationId: "invalid", repository: { findStatus: async () => "succeeded" } })).toBeNull();
    expect(await loadPublicDonationStatus({ donationId: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a", repository: { findStatus: async () => null } })).toBeNull();
  });
});
```

```ts
// publicStatus.test.ts
import { describe, expect, test } from "bun:test";
import { pollDonationSucceeded } from "./publicStatus";

describe("pollDonationSucceeded", () => {
  test("stops when the server confirms success", async () => {
    const states = ["pending", "succeeded"] as const;
    let calls = 0;
    const result = await pollDonationSucceeded("donation-1", {
      attempts: 4, delayMs: 0,
      load: async () => ({ status: states[calls++] ?? "pending" }),
    });
    expect(result).toBe(true);
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `bun test src/lib/donations/publicStatus.server.test.ts src/lib/donations/publicStatus.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement the minimal server status read**

`publicStatus.server.ts` must validate `donationId` with `z.string().uuid()`, call a repository returning only the donation status, and return either `{ status }` or `null`. Add `createSupabaseDonationStatusRepository(client)` to `supabase.server.ts`; its query must be exactly `.from("donation").select("status").eq("id", donationId).maybeSingle()`.

Create `/api/donations/$donationId/status` with:

- `getClientIp(request)` and `enforceRateLimit(ip, { prefix: "donation-status", max: 20, window: "1 m" })`;
- `cache-control: no-store` on every response;
- 404 for invalid or missing IDs, 429 with `retry-after`, `{ status }` on success, and a generic 500 error;
- no amount, method, attribution, donor, payment, receipt, or provider reference fields.

- [ ] **Step 4: Implement bounded client verification and event dedupe**

`pollDonationSucceeded` performs at most four loads, waits 1,500ms between pending results, returns `true` only for `succeeded`, and returns `false` for terminal `failed`/`refunded`, exhausted retries, or fetch errors.

In `DonatePage`, when `search.status` is either `"success"` or `"paypal-approved"` and `search.donation` exists:

1. read the checkout snapshot keyed by donation ID;
2. poll `/api/donations/<encoded-id>/status`;
3. on confirmed success and an available snapshot, call `markDonationEventOnce("donation_success", donationId)`;
4. emit `donation_success` with snapshot context, purpose, method, value, and currency;
5. never emit success from query parameters alone.

Keep the current user-facing success/cancel/PayPal messages unchanged.

- [ ] **Step 5: Run status, donation, and route-generation checks**

Run: `bun test src/lib/donations/publicStatus.server.test.ts src/lib/donations/publicStatus.test.ts src/lib/donations/analytics.test.ts src/lib/donations/service.test.ts`

Expected: PASS.

Run: `bun run build`

Expected: PASS and `src/routeTree.gen.ts` includes `/api/donations/$donationId/status`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/donations/publicStatus.server.ts src/lib/donations/publicStatus.server.test.ts src/lib/donations/publicStatus.ts src/lib/donations/publicStatus.test.ts src/lib/donations/supabase.server.ts src/routes/api/donations/$donationId/status.ts src/routes/donate.tsx src/routeTree.gen.ts
git commit -m "feat: verify donation success analytics"
```

### Task 8: Full Verification and Browser Regression Pass

**Files:**
- Create: `scripts/verify-contextual-donation-cta.mjs`
- Modify only if verification finds a defect: files owned by Tasks 1-7

**Interfaces:**
- Consumes: complete feature from Tasks 1-7.
- Produces: repeatable desktop/mobile browser proof and a clean final branch.

- [ ] **Step 1: Add a Playwright verification script**

The script must launch Chromium against `process.env.BASE_URL ?? "http://127.0.0.1:4173"`, run separate fresh contexts at 390x844 and 1440x900, and assert:

```js
await page.goto(`${baseUrl}/about`);
await page.waitForTimeout(10_500);
await page.locator("[data-donation-prompt]").waitFor({ state: "visible" });
await page.screenshot({ path: `artifacts/donation-prompt-${viewportName}.png`, fullPage: true });
await page.getByLabel("關閉捐助提示").click();
await page.goto(`${baseUrl}/help`);
await page.waitForTimeout(10_500);
await page.locator("[data-donation-prompt]").waitFor({ state: "detached" });
```

Use another fresh context to verify `/donate` never renders the prompt, `/stories` produces the story profile, and the help panel hides/restores a qualified prompt. Seed shortlist collision coverage before navigation with this exact stored value:

```js
await context.addInitScript(() => {
  localStorage.setItem("hkscda-public-shortlist-v1", JSON.stringify([
    { id: "cta-layout-cat", name: "測試貓", animalType: "cat", imageUrl: null, intent: "adoption", rank: 1 },
  ]));
});
```

Use `boundingBox()` assertions to prove the shortlist, donation prompt, and help button rectangles do not intersect. The script exits non-zero on any assertion failure and always closes the browser.

- [ ] **Step 2: Run the complete automated test suite**

Run: `bun test`

Expected: all tests PASS. If an unrelated baseline failure exists, record its exact file and rerun every touched-area test successfully before proceeding.

- [ ] **Step 3: Run static verification**

Run: `bun run lint`

Expected: PASS.

Run: `bun run build`

Expected: PASS with no route-generation drift beyond the new status endpoint.

- [ ] **Step 4: Start the production preview and run Playwright**

Terminal 1: `bun run preview -- --host 127.0.0.1 --port 4173`

Terminal 2: `node scripts/verify-contextual-donation-cta.mjs`

Expected: exit code 0 and readable screenshots for both viewports; no prompt/help/shortlist overlap and no prompt on excluded routes.

- [ ] **Step 5: Inspect analytics and privacy payloads**

Use Playwright's `page.on("request")` or a `window.gtag` spy to confirm the sequence `donation_cta_impression` → `donation_cta_click` → `donation_form_view` → `begin_checkout`. Confirm payload keys contain no `name`, `email`, `phone`, `donation_id`, `page_path`, `location`, `query`, or free-form message fields. Confirm `donation_success` is absent until the mocked/status test returns `succeeded`.

- [ ] **Step 6: Commit verification assets and any focused fixes**

Do not commit PNG artifacts. Commit only the reusable script and source/test fixes:

```bash
git add scripts/verify-contextual-donation-cta.mjs src
git commit -m "test: verify contextual donation journey"
```

- [ ] **Step 7: Final branch audit**

Run: `git status --short --branch`

Expected: clean worktree on the feature branch.

Run: `git log --oneline --decorate -8`

Expected: one focused commit per task, with no unrelated admin or stories-performance changes.
