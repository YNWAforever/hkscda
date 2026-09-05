import type { Metric } from "web-vitals";

const publicPages = new Set([
  "/",
  "/about",
  "/help",
  "/donate",
  "/adoption/instructions",
  "/adoption/apply",
  "/animals/cat",
  "/animals/dog",
  "/sponsors",
  "/sponsors/pledge",
  "/volunteer",
  "/stories",
  "/volunteer/group",
  "/about/privacy",
  "/about/team",
  "/about/tnr",
  "/about/cccp",
  "/report/audit",
  "/report/adoption",
  "/knowledge",
]);
const detailTemplates: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/(adoption|sponsors|volunteer)\/status\/[^/]+\/?$/, "status"],
  [/^\/animals\/(cat|dog)\/[^/]+\/?$/, "animal"],
  [/^\/stories\/[^/]+\/?$/, "/stories/[slug]"],
  [/^\/sponsors\/[^/]+\/?$/, "/sponsors/[id]"],
];

/** Unknown routes are dropped, never sent as raw paths. */
export function publicMetricRoute(pathname: string): string | null {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null;
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
  if (publicPages.has(path)) return path;
  for (const [pattern, template] of detailTemplates) {
    const match = path.match(pattern);
    if (match) {
      if (template === "status") return `/${match[1]}/status/[token]`;
      if (template === "animal") return `/animals/${match[1]}/[id]`;
      return template;
    }
  }
  return null;
}

type MetricInput = Pick<Metric, "name" | "id" | "value" | "delta">;
type Registrar = (callback: (metric: MetricInput) => void) => void;
type MetricsLibrary = { onCLS: Registrar; onINP: Registrar; onLCP: Registrar };
export type PublicMetric = {
  name: "LCP" | "INP" | "CLS";
  value: number;
  delta: number;
  metricId: string;
  route: string;
  device: "mobile" | "desktop";
  scope: "document";
};
type Options = {
  enabled?: boolean;
  getConsent: () => boolean;
  getPathname: () => string;
  device: PublicMetric["device"];
  send: (metric: PublicMetric) => void;
  load?: () => Promise<MetricsLibrary>;
};

/** Explicitly gated adapter. The consent owner supplies current policy; no default opt-in. */
export async function startPublicMetrics(options: Options): Promise<() => void> {
  const initialPath = options.getPathname();
  const route = publicMetricRoute(initialPath);
  if (!options.enabled || !options.getConsent() || !route) return () => {};
  let stopped = false;
  const ids = new Map<string, string>();
  const active = () => !stopped && options.getConsent() && options.getPathname() === initialPath;
  try {
    const library = await (options.load ?? (() => import("web-vitals")))();
    if (!active()) return () => {};
    const report = (metric: MetricInput) => {
      if (!active() || !["LCP", "INP", "CLS"].includes(metric.name)) return;
      if (!Number.isFinite(metric.value) || !Number.isFinite(metric.delta) || metric.value < 0)
        return;
      const key = `${metric.name}:${metric.id}`;
      try {
        if (!ids.has(key)) ids.set(key, crypto.randomUUID());
        options.send({
          name: metric.name as PublicMetric["name"],
          value: metric.value,
          delta: metric.delta,
          metricId: ids.get(key)!,
          route,
          device: options.device,
          scope: "document",
        });
      } catch {
        /* Telemetry cannot interrupt a public journey. */
      }
    };
    library.onCLS(report);
    library.onINP(report);
    library.onLCP(report);
  } catch {
    /* Unsupported browser or failed optional chunk leaves telemetry disabled. */
  }
  return () => {
    stopped = true;
    ids.clear();
  };
}
