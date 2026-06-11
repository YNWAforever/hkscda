# HKSCDA Website SEO Plan & Report Pages Design

**Date:** 2026-06-12
**Status:** Approved

## Overview

Full website SEO strategy for HKSCDA (Hong Kong Saving Cat And Dog Association), covering new report pages (`/report/adoption`, `/report/audit`), blog, volunteer/donate standalone pages, technical SEO, schema markup, and a 4-phase implementation roadmap.

**Goals:** Adoption conversions, donation conversions, community visibility.

**Stack:** TanStack Start (SSR React 19 + TanStack Router + Vite 7 + Nitro), Tailwind CSS v4, Supabase (PostgreSQL), Vercel deploy.

## 1. Site Architecture

### Current Routes
```
/                          Home
/about/                    Association overview
/about/cccp                Community Cat Care Program
/about/tnr                 Trap-Neuter-Return
/about/team                Board + volunteers
/about/privacy             Privacy policy
/adoption/instructions     Adoption rules + care guides
/adoption/apply            Adoption application form
/animals/cat               Cat listing (paginated, filtered)
/animals/cat/$id           Cat detail
/animals/dog               Dog listing (paginated, filtered)
/animals/dog/$id           Dog detail
/sponsors                  Sponsor animals listing
/sponsors/$id              Sponsor animal detail
/admin/*                   Admin panel (noindex)
```

### New Routes
```
/report/adoption           Monthly adoption reports
/report/audit              Financial audit reports
/blog                      Articles index
/blog/$slug                Individual article
/volunteer                 Volunteer signup page
/donate                    Standalone donation page
```

### Architecture Decisions
- Keep existing flat URL structure
- `/report/` is a transparency hub
- `/blog/` is the content engine for organic traffic
- `/donate` and `/volunteer` are standalone conversion pages (currently only homepage sections)
- `/admin/*` remains `noindex`
- **No paginated URLs in sitemap beyond page 1**

## 2. Content Strategy

### Content Pillars

| Pillar | Pages | Priority Keywords |
|--------|-------|-------------------|
| Adoption | `/animals/cat`, `/animals/dog`, `/adoption/instructions`, `/adoption/apply` | 領養貓, 領養狗, 領養需知, 香港領養動物 |
| Transparency | `/report/adoption`, `/report/audit` | 領養報告, 慈善審計, 動物慈善透明度 |
| Education | `/about/cccp`, `/about/tnr`, `/blog/*` | 貓隻絕育, TNR計劃, 貓狗護理, 新手養貓, 新手養狗 |
| Community | `/volunteer`, `/about/team`, `/sponsors` | 動物義工, 助養動物, 助養貓狗 |
| Donation | `/donate`, `/#donate` | 捐款貓狗, 慈善捐款退稅, HK$100助養 |

### Report Pages Design

#### `/report/adoption` — Monthly Adoption Report
- Page title: `每月領養報告 — YYYY年M月`
- Summary stats: cats adopted, dogs adopted, total, year-to-date
- Monthly trend chart: 12-month bar/line of adoptions
- Cat vs Dog breakdown: donut chart
- Recent adoptions table: name, date, new home
- Archive links: previous months
- Schema: `Dataset` + `Organization`
- Data source: query `animals` table where `status = 'adopted'`, group by `updated_at` month

#### `/report/audit` — Financial Audit Report
- Page title: `核數報告 — YYYY-YYYY年度`
- Income breakdown: donations, sponsorships, grants
- Expenditure breakdown: medical, food, operations, outreach
- Balance summary: income vs expenditure
- Donor acknowledgment section
- PDF download link (Supabase storage)
- Archive links: previous years
- Schema: `Dataset` + `Organization`
- Data source: static/manual entry + PDF from Supabase storage bucket `reports`

### Content Calendar (First 3 Months)

| Week | Content |
|------|---------|
| 1-2 | Report pages built + 2 blog posts (success stories) |
| 3-4 | `/volunteer` page + 1 blog post (how TNR works) |
| 5-6 | `/donate` standalone + 1 blog post (cat care guide) |
| 7-8 | 2 blog posts (dog care guide, adoption FAQ) |
| 9-12 | 4 blog posts (rescue stories, CCCP explainer, volunteer spotlight, adoption walkthrough) |

## 3. Technical Foundation

### Schema Markup Plan

| Page Type | Schema |
|-----------|--------|
| `/` | `Organization`, `WebSite`, `SearchAction` |
| `/about/*` | `Organization`, `AboutPage` |
| `/animals/cat`, `/animals/dog` | `ItemList` |
| `/animals/cat/$id`, `/animals/dog/$id` | `Product` (adoption listing) |
| `/report/adoption` | `Dataset` |
| `/report/audit` | `Dataset` |
| `/blog/*` | `Article`, `BreadcrumbList` |
| `/donate` | `Organization` + `DonateAction` |

### Performance Targets

| Metric | Target |
|--------|--------|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| Mobile PageSpeed | > 80 |
| Accessibility | > 90 |

### Technical Checklist

| Item | Action |
|------|--------|
| `robots.txt` | Create — disallow `/admin/` |
| XML sitemap | Auto-generate from TanStack Router route tree |
| `llms.txt` | Create for AI search visibility (ChatGPT, Perplexity) |
| Canonical URLs | Add per-page `<link rel="canonical">` |
| Schema JSON-LD | Add per page type |
| OG/Twitter meta | Extend to all pages (currently only on `/`) |
| Google Search Console | Connect `hkscda.com` domain property |
| GA4 | Install via `<Script>` in `__root.tsx` |
| Image optimization | WebP format, explicit width/height for CLS |
| Viewport | Already configured |
| Font display | Already `swap` |

## 4. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
- [ ] Create `robots.txt` disallowing `/admin/`
- [ ] Connect Google Search Console domain property
- [ ] Install GA4 tracking in `__root.tsx`
- [ ] Add canonical URLs to all pages
- [ ] Build `/report/adoption` and `/report/audit` routes
- [ ] Build `/donate` standalone page
- [ ] Build `/volunteer` page
- [ ] Add Organization schema to `__root.tsx`
- [ ] Add page-level schema to all existing routes
- [ ] Configure XML sitemap generation
- [ ] Create `llms.txt`

### Phase 2: Content Engine (Weeks 5-12)
- [ ] Build `/blog` index route
- [ ] Build `/blog/$slug` route with MDX or markdown rendering
- [ ] Publish 8 blog posts (see content calendar)
- [ ] Add Article schema + BreadcrumbList
- [ ] Internal linking from blog posts to adoption/donate pages
- [ ] Add social share meta to all blog posts

### Phase 3: Optimization (Weeks 13-24)
- [ ] Run PageSpeed Insights — optimize LCP + CLS
- [ ] Image audit — ensure WebP with dimensions
- [ ] GEO optimization for AI search (ChatGPT, Perplexity)
- [ ] Schema validation via Google Rich Results Test
- [ ] Backlink outreach to HK animal welfare directories
- [ ] Monitor GSC for keyword opportunities

### Phase 4: Authority (Months 7-12)
- [ ] Publish 12+ additional blog posts
- [ ] PR/media mention tracking
- [ ] Review and refresh old content quarterly
- [ ] Continuous schema refinement
- [ ] Monitor keyword rankings monthly

## 5. Report Pages — Detail Spec

### `/report/adoption` Component Tree
```
ReportAdoptionPage
├── ReportHeader (title, month selector)
├── StatCards (4 summary cards)
├── AdoptionTrendChart (12-month bar chart)
├── CatVsDogChart (donut chart)
├── RecentAdoptionsTable (sortable table)
├── ArchiveLinks (previous months)
└── DatasetSchema (JSON-LD)
```

### `/report/audit` Component Tree
```
ReportAuditPage
├── ReportHeader (title, year selector)
├── IncomeChart (bar/pie chart)
├── ExpenditureChart (bar/pie chart)
├── BalanceSummary
├── DonorAcknowledgement
├── PDFDownloadLink
├── ArchiveLinks (previous years)
└── DatasetSchema (JSON-LD)
```

### Data Flow
- **Adoption report**: `useQuery` → `supabase.from('animals').select('*').eq('status','adopted')` → group client-side by month
- **Audit report**: Static data from a Supabase `reports` table (to be created) or hardcoded JSON → PDF from Supabase storage bucket
- **Charts**: Use `recharts` (already in dependencies)
- **PDF download**: Supabase storage bucket `reports` with public URLs

### Chart Library
Use `recharts` (v2.15.4, already in `package.json`). Chart types:
- `BarChart` for monthly adoption trends
- `PieChart` / `Pie` for cat vs dog ratio
- `ResponsiveContainer` for mobile adaptation

## 6. Dependencies

| Component | Source | Status |
|-----------|--------|--------|
| Charts | `recharts` v2.15.4 | Already installed |
| Supabase | `@supabase/supabase-js` v2.108 | Already installed |
| Schema | Custom `src/lib/schema.ts` | To create |
| PDF storage | Supabase Storage bucket `reports` | To create |
| Robots.txt | Nitro public asset | To create |
| Sitemap | TanStack Router plugin | To configure |
| GA4 | `@next/third-parties` or inline script | To install |
| Blog CMS | Supabase `blog_posts` table | To create |

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Report data empty (no adopted animals yet) | Show "no data yet" empty state, not broken chart |
| PDF audit report not uploaded | Show placeholder text with upload instructions |
| Blog content velocity too slow | Start with 2 posts; batch-write 4 more in advance |
| Schema breaks rich results | Validate each page type after deployment |
| Cloudflare blocks GSC verification | Use DNS TXT record method for domain property |
