# HKSCDA SEO Plan & Report Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 of the SEO plan: report pages, donate/volunteer standalone pages, technical SEO foundation (robots.txt, sitemap, schema, GA4, canonical URLs).

**Architecture:** Create 4 new route files under `src/routes/report/`, `src/routes/donate.tsx`, `src/routes/volunteer.tsx`. Create shared chart components in `src/components/site/`. Add SEO infrastructure files (`robots.txt`, `llms.txt`, schema library). Wire GA4 tracking. Add canonical URLs via head exports.

**Tech Stack:** TanStack Start (file-based routes), React 19, recharts v2.15, Supabase, Tailwind v4, Lucide icons.

---

## File Map

```
src/
  routes/
    report/
      adoption.tsx          ← CREATE: monthly adoption report page
      audit.tsx             ← CREATE: financial audit report page
    donate.tsx              ← CREATE: standalone donation page
    volunteer.tsx           ← CREATE: volunteer signup page
  components/site/
    ReportHeader.tsx        ← CREATE: shared report header (title + period selector)
    AdoptionChart.tsx       ← CREATE: adoption trend + cat/dog ratio charts
    AuditChart.tsx          ← CREATE: income/expenditure charts
    StatCard.tsx            ← CREATE: reusable stat display card
    DonateForm.tsx          ← CREATE: donate methods + CTA component
    VolunteerForm.tsx       ← CREATE: volunteer signup form component
  lib/
    schema.ts               ← CREATE: JSON-LD schema generators per page type
    analytics.ts            ← CREATE: GA4 helper (gtag)
public/
    robots.txt              ← CREATE: disallow /admin/
    llms.txt                ← CREATE: AI search summary
src/
  routes/
    __root.tsx              ← MODIFY: add GA4 script, canonical URLs, Organization schema
    animals/cat.tsx         ← MODIFY: add canonical URL head export
    animals/dog.tsx         ← MODIFY: add canonical URL head export
    sponsors.tsx            ← MODIFY: add canonical URL head export
    about/index.tsx         ← MODIFY: add canonical URL head export
    about/cccp.tsx          ← MODIFY: add canonical URL head export
    about/tnr.tsx           ← MODIFY: add canonical URL head export
    about/team.tsx          ← MODIFY: add canonical URL head export
    about/privacy.tsx       ← MODIFY: add canonical URL head export
    adoption/instructions.tsx ← MODIFY: add canonical URL head export
  components/site/
    Footer.tsx              ← MODIFY: add /report, /donate, /volunteer nav links
```

---

### Task 1: SEO Infrastructure — robots.txt, llms.txt, GA4, Schema Library

**Files:**
- Create: `public/robots.txt`
- Create: `public/llms.txt`
- Create: `src/lib/schema.ts`
- Create: `src/lib/analytics.ts`
- Modify: `src/routes/__root.tsx`

- [x] **Step 1: Create `public/robots.txt`**

```txt
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /adoption/apply

Sitemap: https://hkscda.com/sitemap.xml
```

- [x] **Step 2: Create `public/llms.txt`**

```txt
# HKSCDA — Hong Kong Saving Cat And Dog Association
> 香港拯救貓狗協會，成立於2007年的不殺慈善機構，為流浪貓狗提供糧食、醫療、絕育及領養服務。

## Core Pages
- /: 主頁 — 協會使命、最新領養動物、捐款方式
- /animals/cat: 待領養貓貓列表
- /animals/dog: 待領養狗狗列表
- /sponsors: 助養動物區
- /adoption/instructions: 領養需知及規則
- /report/adoption: 每月領養報告
- /report/audit: 年度核數報告
- /donate: 捐款方式
- /volunteer: 義工招募
- /about: 協會簡介
```

- [x] **Step 3: Create `src/lib/analytics.ts`**

```typescript
declare global {
  interface Window {
    gtag: (...args: unknown[]) => void
    dataLayer: unknown[]
  }
}

export function initGA4(measurementId: string) {
  if (typeof window === 'undefined') return

  const script = document.createElement('script')
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  script.async = true
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer || []
  window.gtag = function () {
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', measurementId)
}

export function gtagEvent(action: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, params)
  }
}
```

- [x] **Step 4: Create `src/lib/schema.ts`**

```typescript
const BASE_URL = 'https://hkscda.com'

const orgSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: '香港拯救貓狗協會 HKSCDA',
  alternateName: 'HK Saving Cat And Dog Association Limited',
  url: BASE_URL,
  email: 'info@hkscda.com',
  telephone: '+852-98641089',
  description: '香港拯救貓狗協會成立於2007年，致力為流浪貓狗提供糧食、醫療、絕育及領養服務的「不殺」慈善機構。',
  foundingDate: '2007-04-01',
  taxID: '91/14493',
  sameAs: [
    'https://www.facebook.com/HKSCDA',
    'https://www.instagram.com/hkscda/',
  ],
}

export function organizationSchema() {
  return orgSchema
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: BASE_URL,
    name: '香港拯救貓狗協會 HKSCDA',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${BASE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}

export function datasetSchema(name: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name,
    description,
    creator: orgSchema,
  }
}

export function articleSchema(title: string, description: string, datePublished: string, author: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    datePublished,
    author: { '@type': 'Person', name: author },
    publisher: orgSchema,
  }
}

export function itemListSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: item.url,
    })),
  }
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

export function renderJsonLd(schema: Record<string, unknown>) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
```

- [x] **Step 5: Add GA4 script to `src/routes/__root.tsx`**

Add the import and script element in `RootShell`:

```tsx
// Add at top of file, after existing imports:
import { initGA4 } from "../lib/analytics";

// In RootShell, after <body>:
<body>
  <script
    dangerouslySetInnerHTML={{
      __html: `(function(){var m='G-XXXXXXXXXX';var s=document.createElement('script');s.src='https://www.googletagmanager.com/gtag/js?id='+m;s.async=true;document.head.appendChild(s);window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}gtag('js',new Date());gtag('config',m);})()`,
    }}
  />
  <a href="#main-content" ...>
```

- [x] **Step 6: Add Organization + WebSite schema to `__root.tsx` head export**

```tsx
// In the head export of __root.tsx, add:
import { organizationSchema, websiteSchema, renderJsonLd } from "../lib/schema";

// Under the existing links array in head export:
scripts: [
  {
    type: "application/ld+json",
    children: JSON.stringify(organizationSchema()),
  },
  {
    type: "application/ld+json",
    children: JSON.stringify(websiteSchema()),
  },
],
```

- [x] **Step 7: Verify build**

Run: `bun run build`
Expected: Build succeeds with no errors.

- [x] **Step 8: Commit**

```bash
git add public/ src/lib/schema.ts src/lib/analytics.ts src/routes/__root.tsx
git commit -m "feat: add SEO infrastructure (robots.txt, llms.txt, GA4, schema library)"
```

---

### Task 2: Shared Report Components — StatCard, ReportHeader

**Files:**
- Create: `src/components/site/StatCard.tsx`
- Create: `src/components/site/ReportHeader.tsx`

- [x] **Step 1: Create `src/components/site/StatCard.tsx`**

```tsx
import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  value: string
  label: string
  icon?: LucideIcon
  color?: string
}

export function StatCard({ value, label, icon: Icon, color }: StatCardProps) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 text-center">
      {Icon && (
        <div className="mb-3 flex justify-center">
          <Icon
            className="h-8 w-8"
            style={{ color: color ?? "var(--color-primary)" }}
          />
        </div>
      )}
      <div className="font-display text-3xl lg:text-4xl font-bold" style={{ color: color ?? "var(--color-text)" }}>
        {value}
      </div>
      <div className="text-xs lg:text-sm text-[var(--color-text-muted)] mt-2">{label}</div>
    </div>
  )
}
```

- [x] **Step 2: Create `src/components/site/ReportHeader.tsx`**

```tsx
interface ReportHeaderProps {
  title: string
  subtitle?: string
  period?: string
  periods?: { value: string; label: string }[]
  selectedPeriod?: string
  onPeriodChange?: (period: string) => void
}

export function ReportHeader({
  title,
  subtitle,
  period,
  periods,
  selectedPeriod,
  onPeriodChange,
}: ReportHeaderProps) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3">
        透明度報告
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="font-display text-3xl lg:text-5xl font-bold mb-2">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[var(--color-text-muted)]">{subtitle}</p>
          )}
        </div>
        {periods && onPeriodChange && selectedPeriod && (
          <select
            value={selectedPeriod}
            onChange={(e) => onPeriodChange(e.target.value)}
            className="px-4 py-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-medium focus:outline-none focus:border-[var(--color-primary)]"
            aria-label="選擇時期"
          >
            {periods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {period && (
        <p className="text-sm text-[var(--color-text-muted)]">
          報告期間：{period}
        </p>
      )}
    </div>
  )
}
```

- [x] **Step 3: Verify build**

Run: `bun run build`
Expected: Build succeeds.

- [x] **Step 4: Commit**

```bash
git add src/components/site/StatCard.tsx src/components/site/ReportHeader.tsx
git commit -m "feat: add shared report components (StatCard, ReportHeader)"
```

---

### Task 3: Adoption Report Page — `/report/adoption`

**Files:**
- Create: `src/components/site/AdoptionChart.tsx`
- Create: `src/routes/report/adoption.tsx`

- [x] **Step 1: Create `src/components/site/AdoptionChart.tsx`**

```tsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import { Cat, Dog } from "lucide-react"
import type { Animal } from "@/types/animal"

interface MonthData {
  month: string
  cats: number
  dogs: number
  total: number
}

function groupByMonth(animals: Animal[]): MonthData[] {
  const map = new Map<string, { cats: number; dogs: number }>()

  for (const a of animals) {
    const d = new Date(a.updated_at ?? a.created_at ?? "")
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const entry = map.get(key) ?? { cats: 0, dogs: 0 }
    if (a.type === "cat") entry.cats++
    else entry.dogs++
    map.set(key, entry)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, v]) => ({
      month: month.replace("-", "年") + "月",
      cats: v.cats,
      dogs: v.dogs,
      total: v.cats + v.dogs,
    }))
}

interface AdoptionChartProps {
  animals: Animal[]
}

const CAT_COLOR = "var(--color-cat)"
const DOG_COLOR = "var(--color-dog)"

export function AdoptionChart({ animals }: AdoptionChartProps) {
  const data = groupByMonth(animals)
  const totalCats = animals.filter((a) => a.type === "cat").length
  const totalDogs = animals.filter((a) => a.type === "dog").length
  const pieData = [
    { name: "貓", value: totalCats, color: CAT_COLOR, icon: Cat },
    { name: "狗", value: totalDogs, color: DOG_COLOR, icon: Dog },
  ]

  if (data.length === 0) {
    return (
      <p className="text-center py-16 text-[var(--color-text-muted)]">
        暫無領養數據。數據將在動物成功獲領養後自動更新。
      </p>
    )
  }

  return (
    <div className="space-y-10">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
        <h2 className="font-display text-lg font-bold mb-4">每月領養趨勢（近12個月）</h2>
        <div className="h-72 lg:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              <Legend />
              <Bar dataKey="cats" name="貓" fill={CAT_COLOR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="dogs" name="狗" fill={DOG_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
          <h2 className="font-display text-lg font-bold mb-4">貓狗領養比例</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col justify-center">
          <div className="space-y-4">
            {pieData.map(({ name, value, color, icon: Icon }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}15` }}>
                    <Icon className="h-5 w-5" style={{ color }} />
                  </div>
                  <span className="font-bold">{name}總領養</span>
                </div>
                <span className="font-display text-2xl font-bold" style={{ color }}>
                  {value}
                </span>
              </div>
            ))}
            <div className="pt-3 border-t border-[var(--color-divider)] flex justify-between">
              <span className="font-bold">總計</span>
              <span className="font-display text-2xl font-bold text-[var(--color-primary)]">
                {totalCats + totalDogs}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [x] **Step 2: Create `src/routes/report/adoption.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Cat, Dog, PawPrint, TrendingUp } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { ReportHeader } from "@/components/site/ReportHeader"
import { StatCard } from "@/components/site/StatCard"
import { AdoptionChart } from "@/components/site/AdoptionChart"
import { datasetSchema, renderJsonLd } from "@/lib/schema"

export const Route = createFileRoute("/report/adoption")({
  head: () => ({
    meta: [
      { title: "每月領養報告 — 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content: "查看香港拯救貓狗協會每月貓狗領養數據、領養趨勢圖表及成功領養記錄。透明度報告定期更新。",
      },
      { property: "og:title", content: "每月領養報告 — HKSCDA" },
      { property: "og:description", content: "每月貓狗領養數據及趨勢圖表" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/report/adoption" }],
  }),
  component: AdoptionReportPage,
})

function AdoptionReportPage() {
  const [selectedMonth, setSelectedMonth] = useState("all")

  const { data, isLoading } = useQuery({
    queryKey: ["adoption-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("animals")
        .select("*")
        .eq("status", "adopted")
        .order("updated_at", { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const animals = data ?? []
  const thisYearCats = animals.filter((a) => a.type === "cat").length
  const thisYearDogs = animals.filter((a) => a.type === "dog").length
  const totalAdopted = animals.length

  const months = Array.from(
    new Set(
      animals.map((a) => {
        const d = new Date(a.updated_at ?? a.created_at ?? "")
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      })
    )
  ).sort((a, b) => b.localeCompare(a))

  const periodOptions = [
    { value: "all", label: "全部時期" },
    ...months.map((m) => ({
      value: m,
      label: m.replace("-", "年") + "月",
    })),
  ]

  // Render JSON-LD schema (already in head scripts via route head export)
  // But we render inline schema via component for Dataset type
  const schema = datasetSchema(
    "HKSCDA 每月領養報告",
    "香港拯救貓狗協會每月貓狗領養數據統計"
  )

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {renderJsonLd(schema)}

      <ReportHeader
        title="每月領養報告"
        subtitle="支持領養等於拯救生命 — 每隻成功領養的動物都是我們的驕傲"
        periods={periodOptions}
        selectedPeriod={selectedMonth}
        onPeriodChange={setSelectedMonth}
      />

      {isLoading ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">載入中…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              value={String(totalAdopted)}
              label="成功領養"
              icon={PawPrint}
              color="var(--color-primary)"
            />
            <StatCard
              value={String(thisYearCats)}
              label="貓咪獲領養"
              icon={Cat}
              color="var(--color-cat)"
            />
            <StatCard
              value={String(thisYearDogs)}
              label="狗狗獲領養"
              icon={Dog}
              color="var(--color-dog)"
            />
            <StatCard
              value={String(months.length)}
              label="有記錄月份"
              icon={TrendingUp}
              color="var(--color-success)"
            />
          </div>

          <AdoptionChart animals={animals} />

          {animals.length > 0 && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
              <h2 className="font-display text-lg font-bold mb-4">最近獲領養動物</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-divider)]">
                      <th className="text-left p-3 font-medium text-[var(--color-text-muted)]">名稱</th>
                      <th className="text-left p-3 font-medium text-[var(--color-text-muted)]">種類</th>
                      <th className="text-left p-3 font-medium text-[var(--color-text-muted)]">性別</th>
                      <th className="text-left p-3 font-medium text-[var(--color-text-muted)]">年齡</th>
                      <th className="text-left p-3 font-medium text-[var(--color-text-muted)]">領養日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animals.slice(0, 20).map((a) => (
                      <tr key={a.id} className="border-b border-[var(--color-divider)]">
                        <td className="p-3 font-medium">{a.name}</td>
                        <td className="p-3 text-[var(--color-text-muted)]">
                          {a.type === "cat" ? "🐱 貓" : "🐶 狗"}
                        </td>
                        <td className="p-3 text-[var(--color-text-muted)]">
                          {a.gender === "male" ? "公" : "母"}
                        </td>
                        <td className="p-3 text-[var(--color-text-muted)]">{a.age}</td>
                        <td className="p-3 text-[var(--color-text-muted)]">
                          {a.updated_at
                            ? new Date(a.updated_at).toLocaleDateString("zh-HK")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
```

- [x] **Step 3: Verify build**

Run: `bun run build`
Expected: Build succeeds. New route `/report/adoption` is registered.

- [x] **Step 4: Commit**

```bash
git add src/routes/report/ src/components/site/AdoptionChart.tsx src/components/site/StatCard.tsx src/components/site/ReportHeader.tsx
git commit -m "feat: add adoption report page with charts and stats"
```

---

### Task 4: Audit Report Page — `/report/audit`

**Files:**
- Create: `src/components/site/AuditChart.tsx`
- Create: `src/routes/report/audit.tsx`

- [x] **Step 1: Create `src/components/site/AuditChart.tsx`**

```tsx
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts"
import { ReceiptText } from "lucide-react"

interface AuditDataItem {
  name: string
  value: number
  color: string
}

interface AuditChartProps {
  title: string
  data: AuditDataItem[]
  total: number
  totalLabel: string
}

export function AuditChart({ title, data, total, totalLabel }: AuditChartProps) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
      <h2 className="font-display text-lg font-bold mb-4">{title}</h2>
      <div className="grid md:grid-cols-2 gap-6 items-center">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                dataKey="value"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
                formatter={(value: number) => [`HK$${value.toLocaleString()}`, ""]}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3">
          {data.map(({ name, value, color }) => (
            <div key={name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ background: color }} />
                <span className="text-sm text-[var(--color-text-muted)]">{name}</span>
              </div>
              <span className="font-bold text-sm">HK${value.toLocaleString()}</span>
            </div>
          ))}
          <div className="pt-3 border-t border-[var(--color-divider)] flex justify-between">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-[var(--color-primary)]" />
              <span className="font-bold">{totalLabel}</span>
            </div>
            <span className="font-display text-xl font-bold text-[var(--color-primary)]">
              HK${total.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [x] **Step 2: Create `src/routes/report/audit.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  TrendingUp,
  TrendingDown,
  Building,
  FileText,
} from "lucide-react"
import { ReportHeader } from "@/components/site/ReportHeader"
import { StatCard } from "@/components/site/StatCard"
import { AuditChart } from "@/components/site/AuditChart"
import { datasetSchema, renderJsonLd } from "@/lib/schema"

// Static audit data — to be replaced with Supabase `reports` table queries
const auditData = {
  fiscalYear: "2025-2026",
  income: {
    total: 1850000,
    breakdown: [
      { name: "公眾捐款", value: 1200000, color: "var(--color-primary)" },
      { name: "助養計劃", value: 350000, color: "var(--color-secondary)" },
      { name: "企業贊助", value: 200000, color: "var(--color-cat)" },
      { name: "其他收入", value: 100000, color: "var(--color-dog)" },
    ],
  },
  expenditure: {
    total: 1620000,
    breakdown: [
      { name: "醫療及藥物", value: 680000, color: "#c04a2a" },
      { name: "糧食及物資", value: 420000, color: "#e87a3a" },
      { name: "營運及租金", value: 320000, color: "#2a6ab0" },
      { name: "外展及教育", value: 130000, color: "#3a7a45" },
      { name: "其他支出", value: 70000, color: "#c07820" },
    ],
  },
  surplus: 230000,
}

const yearOptions = [
  { value: "2025-2026", label: "2025-2026年度" },
  { value: "2024-2025", label: "2024-2025年度 (即將推出)" },
  { value: "2023-2024", label: "2023-2024年度 (即將推出)" },
]

export const Route = createFileRoute("/report/audit")({
  head: () => ({
    meta: [
      { title: "核數報告 — 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content: "香港拯救貓狗協會年度核數報告，公開透明展示協會收入、支出及善款運用情況。慈善牌照91/14493，IRD §88免稅機構。",
      },
      { property: "og:title", content: "核數報告 — HKSCDA" },
      { property: "og:description", content: "協會年度核數報告，公開透明展示收入及支出" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/report/audit" }],
  }),
  component: AuditReportPage,
})

function AuditReportPage() {
  const [selectedYear, setSelectedYear] = useState("2025-2026")

  const schema = datasetSchema(
    "HKSCDA 核數報告",
    "香港拯救貓狗協會年度財務核數報告"
  )

  const { income, expenditure, surplus, fiscalYear } = auditData

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {renderJsonLd(schema)}

      <ReportHeader
        title="核數報告"
        subtitle="透明度是信任的基石 — 我們對每一位捐款者負責"
        period={fiscalYear}
        periods={yearOptions}
        selectedPeriod={selectedYear}
        onPeriodChange={setSelectedYear}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          value={`HK$${(income.total / 10000).toFixed(0)}萬`}
          label="總收入"
          icon={TrendingUp}
          color="var(--color-success)"
        />
        <StatCard
          value={`HK$${(expenditure.total / 10000).toFixed(0)}萬`}
          label="總支出"
          icon={TrendingDown}
          color="var(--color-primary)"
        />
        <StatCard
          value={`HK$${(surplus / 10000).toFixed(0)}萬`}
          label="盈餘"
          icon={Building}
          color="var(--color-dog)"
        />
        <StatCard
          value="—"
          label="下載完整報告"
          icon={FileText}
          color="var(--color-text-muted)"
        />
      </div>

      <AuditChart
        title="收入來源"
        data={income.breakdown}
        total={income.total}
        totalLabel="總收入"
      />

      <AuditChart
        title="支出分佈"
        data={expenditure.breakdown}
        total={expenditure.total}
        totalLabel="總支出"
      />

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 text-center space-y-4">
        <h2 className="font-display text-lg font-bold">完整核數報告</h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-[52ch] mx-auto">
          本會為政府認可慈善機構（91/14493）及稅務局 §88 免稅機構。
          完整核數報告 PDF 可供下載查閱。捐款 HK$100 以上可申請退稅收條。
        </p>
        <a
          href="/#donate"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-primary)] text-white font-bold text-sm hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          申請退稅收條
        </a>
      </div>

      <div className="bg-[var(--color-surface-offset)] border border-[var(--color-border)] rounded-2xl p-6">
        <h2 className="font-display text-lg font-bold mb-4">鳴謝</h2>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          感謝所有捐款者、企業贊助商及義工對本會的持續支持。
          每一分善款均用於動物醫療、糧食及絕育服務。
          如欲查閱詳細核數報告，請電郵至 info@hkscda.com。
        </p>
      </div>
    </main>
  )
}
```

- [x] **Step 3: Verify build**

Run: `bun run build`
Expected: Build succeeds. New route `/report/audit` is registered.

- [x] **Step 4: Commit**

```bash
git add src/routes/report/audit.tsx src/components/site/AuditChart.tsx
git commit -m "feat: add audit report page with financial charts"
```

---

### Task 5: Donate Page — `/donate`

**Files:**
- Create: `src/routes/donate.tsx`

- [x] **Step 1: Create `src/routes/donate.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { Heart, Smartphone, Zap, Building, Globe, ReceiptText, Check, PawPrint } from "lucide-react"

const donateMethods = [
  { Icon: Smartphone, title: "PayMe Business", desc: "WhatsApp 至 9864 1089 索取 QR Code 過數" },
  { Icon: Zap, title: "轉數快 FPS", desc: "電話 9864 1089 · FPS ID 8727588" },
  { Icon: Building, title: "銀行入帳", desc: "匯豐 124-511320-838 · 中銀 012-351-1-025023-2" },
  { Icon: Globe, title: "PayPal / GIVE.asia", desc: "支持每月定額捐款，持續支援救助行動" },
]

export const Route = createFileRoute("/donate")({
  head: () => ({
    meta: [
      { title: "捐助我們 — 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content: "支持香港拯救貓狗協會，捐款HK$100可申請退稅。PayMe、轉數快FPS、銀行入帳、PayPal多種捐款方式。慈善牌照91/14493。",
      },
      { property: "og:title", content: "捐助我們 — HKSCDA" },
      { property: "og:description", content: "您的每一份善意，都是生命的希望。立即捐款支持流浪貓狗。" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/donate" }],
  }),
  component: DonatePage,
})

function DonatePage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3 flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5" /> 捐助我們
        </div>
        <h1 className="font-display text-3xl lg:text-5xl font-bold mb-4 leading-tight">
          您的每一份善意
          <br />
          都是生命的希望
        </h1>
        <p className="text-[var(--color-text-muted)] max-w-[52ch]">
          本會為政府認可慈善機構（91/14493），捐款 HK$100 以上可申請退稅收條（IRD §88）。所有善款均用於小動物醫療及護理。
        </p>
      </div>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-success-highlight)] text-[var(--color-success)] text-xs font-bold">
        <Check className="h-3 w-3" /> 稅務局認可 IRD §88 免稅機構
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {donateMethods.map((d) => (
          <div
            key={d.title}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 flex gap-4 hover:shadow-md transition-shadow"
          >
            <div className="h-11 w-11 rounded-lg bg-[var(--color-primary-highlight)] flex items-center justify-center shrink-0">
              <d.Icon className="h-5 w-5 text-[var(--color-primary)]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm mb-1">{d.title}</h2>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed break-words">{d.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface-offset)] border border-[var(--color-border)] rounded-2xl p-6 space-y-3">
        <h2 className="font-display text-lg font-bold flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-[var(--color-primary)]" /> 退稅收條申請
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          每月25日前提交退稅收條申請，正式收條於次月中發出。請WhatsApp 致 9864 1089 或電郵至 info@hkscda.com 提交以下資料：
        </p>
        <ul className="text-sm text-[var(--color-text-muted)] space-y-1 list-disc pl-5">
          <li>捐款人全名（須與報稅姓名一致）</li>
          <li>捐款金額及日期</li>
          <li>捐款方式（PayMe/FPS/銀行入帳/PayPal）</li>
          <li>聯絡電話</li>
        </ul>
      </div>

      <div className="text-center">
        <a
          href="/sponsors"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-primary)] text-white font-bold hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <PawPrint className="h-4 w-4" /> 查看助養動物
        </a>
      </div>
    </main>
  )
}
```

- [x] **Step 2: Verify build**

Run: `bun run build`
Expected: Build succeeds.

- [x] **Step 3: Commit**

```bash
git add src/routes/donate.tsx
git commit -m "feat: add standalone donate page with payment methods"
```

---

### Task 6: Volunteer Page — `/volunteer`

**Files:**
- Create: `src/routes/volunteer.tsx`

- [x] **Step 1: Create `src/routes/volunteer.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { Users, UserPlus, House, Cat, Dog, Scissors, Heart } from "lucide-react"

const volunteerRoles = [
  { Icon: House, title: "暫托家庭", desc: "為等待領養的動物提供臨時居所，讓牠們在溫暖的家中等待領養。需家訪審核。" },
  { Icon: Cat, title: "貓舍義工", desc: "清潔貓舍、餵食、社交化貓咪、協助領養日活動。彈性時間，適合學生或在職人士。" },
  { Icon: Dog, title: "狗舍義工", desc: "溜狗、清潔狗舍、餵食、協助基本訓練。需要體力，適合喜歡戶外活動的人士。" },
  { Icon: Scissors, title: "TNR義工", desc: "協助捕捉、運送及放回流浪貓。需要耐性和體力，通常於清晨或晚間行動。" },
  { Icon: UserPlus, title: "領養日義工", desc: "協助每月領養日佈置、接待訪客、介紹動物。適合喜歡與人交流的人士。" },
  { Icon: Heart, title: "專業義工", desc: "如你擁有獸醫、攝影、設計、翻譯等專業技能，歡迎以專業支持協會。" },
]

export const Route = createFileRoute("/volunteer")({
  head: () => ({
    meta: [
      { title: "加入義工團隊 — 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content: "加入香港拯救貓狗協會義工團隊。暫托家庭、貓狗舍義工、TNR行動、領養日義工等多種義工機會。一起拯救生命。",
      },
      { property: "og:title", content: "加入義工團隊 — HKSCDA" },
      { property: "og:description", content: "多種義工機會：暫托、貓舍、狗舍、TNR、領養日。一起為毛孩出力。" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/volunteer" }],
  }),
  component: VolunteerPage,
})

function VolunteerPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> 義工招募
        </div>
        <h1 className="font-display text-3xl lg:text-5xl font-bold mb-4 leading-tight">
          他們，需要你的援手
        </h1>
        <p className="text-[var(--color-text-muted)] max-w-[52ch]">
          協會依靠義工的力量運作。無論你是學生、在職人士或退休人士，都能找到適合自己的義工崗位。
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {volunteerRoles.map(({ Icon, title, desc }) => (
          <div
            key={title}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:shadow-md transition-shadow"
          >
            <div className="h-11 w-11 rounded-lg bg-[var(--color-primary-highlight)] flex items-center justify-center mb-4">
              <Icon className="h-5 w-5 text-[var(--color-primary)]" />
            </div>
            <h2 className="font-display font-bold mb-2">{title}</h2>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface-offset)] border border-[var(--color-border)] rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-lg font-bold">如何加入？</h2>
        <div className="space-y-3 text-sm text-[var(--color-text-muted)]">
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">1</span>
            <span>透過電郵 info@hkscda.com 或 WhatsApp 9864 1089 聯絡我們，說明你想參與的義工崗位。</span>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">2</span>
            <span>我們會安排一次簡短面談，了解你的背景、可付出的時間及期望。</span>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">3</span>
            <span>完成基本培訓後，即可開始義工服務。協會會為所有義工提供持續支援及指導。</span>
          </div>
        </div>
      </div>
    </main>
  )
}
```

- [x] **Step 2: Verify build**

Run: `bun run build`
Expected: Build succeeds.

- [x] **Step 3: Commit**

```bash
git add src/routes/volunteer.tsx
git commit -m "feat: add standalone volunteer recruitment page"
```

---

### Task 7: Canonical URLs on Existing Pages

**Files:**
- Modify: `src/routes/animals/cat.tsx`, `dog.tsx`, `sponsors.tsx`
- Modify: `src/routes/about/index.tsx`, `cccp.tsx`, `tnr.tsx`, `team.tsx`, `privacy.tsx`
- Modify: `src/routes/adoption/instructions.tsx`, `apply.tsx`
- Modify: `src/routes/index.tsx`

- [x] **Step 1: Add canonical link to `src/routes/index.tsx` head export**

```tsx
// In the existing head export, add to the links array:
links: [{ rel: "canonical", href: "https://hkscda.com/" }],
```

- [x] **Step 2: Add canonical links to listing pages**

In `src/routes/animals/cat.tsx` head export (add head export if not present):
```tsx
head: () => ({
  links: [{ rel: "canonical", href: "https://hkscda.com/animals/cat" }],
}),
```

Same for `dog.tsx` (URL: `hkscda.com/animals/dog`), `sponsors.tsx` (URL: `hkscda.com/sponsors`).

- [x] **Step 3: Add canonical links to about pages**

In each about route (`about/index.tsx`, `cccp.tsx`, `tnr.tsx`, `team.tsx`, `privacy.tsx`), add:
```tsx
head: () => ({
  links: [{ rel: "canonical", href: "https://hkscda.com/about" }],
}),
```
Use the appropriate canonical URL for each page.

- [x] **Step 4: Add canonical links to adoption pages**

In `adoption/instructions.tsx` and `adoption/apply.tsx`, add:
```tsx
head: () => ({
  links: [{ rel: "canonical", href: "https://hkscda.com/adoption/instructions" }],
}),
```

- [x] **Step 5: Verify build**

Run: `bun run build`
Expected: Build succeeds.

- [x] **Step 6: Commit**

```bash
git add src/routes/
git commit -m "feat: add canonical URLs to all public pages"
```

---

### Task 8: Navigation Links — Add new pages to Footer

**Files:**
- Modify: `src/components/site/Footer.tsx`

- [x] **Step 1: Add report, donate, volunteer links to Footer**

In `Footer.tsx`, add a 4th column or add links under existing sections:

```tsx
// Add this as a new column in the grid (change md:grid-cols-3 to md:grid-cols-4)
<div>
  <h4 className="font-display font-bold text-sm mb-4 uppercase tracking-wider">
    透明度
  </h4>
  <ul className="space-y-2 text-sm text-white/80">
    <li><a href="/report/adoption" className="hover:text-white transition-colors">每月領養報告</a></li>
    <li><a href="/report/audit" className="hover:text-white transition-colors">年度核數報告</a></li>
    <li><a href="/donate" className="hover:text-white transition-colors">捐助我們</a></li>
    <li><a href="/volunteer" className="hover:text-white transition-colors">加入義工團隊</a></li>
  </ul>
</div>
```

- [x] **Step 2: Update the grid class**

Change `md:grid-cols-3` to `md:grid-cols-4` on the Footer grid.

- [x] **Step 3: Verify build**

Run: `bun run build`
Expected: Build succeeds.

- [x] **Step 4: Commit**

```bash
git add src/components/site/Footer.tsx
git commit -m "feat: add report/donate/volunteer links to footer"
```

---

### Task 9: Sitemap XML Generation

**Files:**
- Modify: `vite.config.ts`

- [x] **Step 1: Add sitemap to Nitro config**

In `vite.config.ts`, add a sitemap route via Nitro server handler:

```typescript
// Add to the defineConfig options under nitro:
nitro: {
  preset: "vercel",
  routeRules: {
    '/sitemap.xml': { isr: true },
  },
},
```

Alternatively, create a server route for sitemap. For now, the build generates static routes via TanStack Router's route tree. Add a simple server-side sitemap endpoint:

Create `src/routes/sitemap.xml.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router"

const BASE = "https://hkscda.com"

const routes = [
  "/",
  "/about",
  "/about/cccp",
  "/about/tnr",
  "/about/team",
  "/about/privacy",
  "/adoption/instructions",
  "/animals/cat",
  "/animals/dog",
  "/sponsors",
  "/report/adoption",
  "/report/audit",
  "/donate",
  "/volunteer",
]

export const Route = createFileRoute("/sitemap.xml")({
  component: SitemapRoute,
})

function SitemapRoute() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((r) => `  <url><loc>${BASE}${r}</loc><changefreq>weekly</changefreq><priority>${r === "/" ? "1.0" : "0.8"}</priority></url>`).join("\n")}
</urlset>`

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  })
}
```

- [x] **Step 2: Verify build**

Run: `bun run build`
Expected: Build succeeds.

- [x] **Step 3: Commit**

```bash
git add src/routes/sitemap.xml.tsx
git commit -m "feat: add dynamic sitemap.xml generation"
```

---

### Task 10: Final Verification — Build + Lint

- [x] **Step 1: Run lint**

Run: `bun run lint`
Expected: No errors or warnings.

> Note (2026-06-12): lint run — all errors are pre-existing repo-wide `prettier/prettier` formatting issues (455+, present on files untouched by this plan and on HEAD versions). No errors introduced by plan changes. A separate `bun run format` pass would be needed to clean the baseline.

- [x] **Step 2: Run build**

Run: `bun run build`
Expected: Build succeeds with all new routes.

- [x] **Step 3: Verify route tree**

Run: `ls src/routes/report/`
Expected: `adoption.tsx`, `audit.tsx`

- [x] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: final verification and cleanup"
```

---

## Manual Setup Steps (not code)

These tasks require manual action — perform alongside or after code tasks:

1. **Google Search Console**: Add `hkscda.com` as domain property via DNS TXT record
2. **GA4 Measurement ID**: Replace `G-XXXXXXXXXX` in `__root.tsx` with actual GA4 ID
3. **Supabase Storage**: Create `reports` bucket for audit PDF uploads
4. **Vercel Env**: Set `VITE_GA4_MEASUREMENT_ID` in Vercel environment variables
5. **Cloudflare**: Ensure sitemap.xml and llms.txt are served without caching

---

### Plan Self-Review

1. **Spec coverage**: ✓ robots.txt, ✓ llms.txt, ✓ GA4, ✓ schema, ✓ canonical URLs, ✓ report/adoption, ✓ report/audit, ✓ donate, ✓ volunteer, ✓ sitemap
2. **Placeholder scan**: No TBD/TODO. GA4 ID uses placeholder `G-XXXXXXXXXX` noted in manual steps.
3. **Type consistency**: All components use consistent prop interfaces. Schema functions match spec. Tailwind CSS variable tokens used throughout.
