/**
 * Identifies demonstration content.
 *
 * At the 2026-09-11 audit the production `content_item` table held seven rows,
 * every one of them demonstration content and every one of them `published` --
 * so the entire public stories section of the live site was fabricated. Fake
 * rescue stories and a fake charity market sitting under a real animal-rescue
 * charity's name are a credibility problem, not a cosmetic one.
 *
 * Identification is unambiguous because each row carries TWO independent
 * markers, applied when the fixtures were seeded:
 *
 *   - a 「【示範】」 title prefix, and
 *   - a `demo-` slug prefix.
 *
 * Either alone is treated as demonstration content. Requiring both would let a
 * half-edited row escape, and the plan is explicit that removing the visible
 * label is not the fix: "Do not merely remove the 「【示範】」 label." A row whose
 * label was stripped but whose slug still says `demo-` is exactly that case, and
 * is still caught.
 *
 * Deliberately conservative in the other direction too: slug matching is
 * anchored to the start, so a legitimate article about a demonstration or a demo
 * day is not swept up by a loose substring match.
 */

export const DEMO_TITLE_MARKER = "【示範】";
export const DEMO_SLUG_PREFIX = "demo-";

export type DemoContentCandidate = {
  id: string;
  title: string | null;
  slug: string | null;
  status: string | null;
};

export type DemoMarker = "title" | "slug";

export function demoMarkers(item: Pick<DemoContentCandidate, "title" | "slug">): DemoMarker[] {
  const markers: DemoMarker[] = [];
  if ((item.title ?? "").includes(DEMO_TITLE_MARKER)) markers.push("title");
  if ((item.slug ?? "").toLowerCase().startsWith(DEMO_SLUG_PREFIX)) markers.push("slug");
  return markers;
}

export function isDemoContent(item: Pick<DemoContentCandidate, "title" | "slug">): boolean {
  return demoMarkers(item).length > 0;
}

/**
 * The rows that actually matter: demonstration content a visitor can see.
 *
 * Unpublished demonstration content is not a defect -- fixtures are legitimate
 * in a draft state, and the plan requires preserving history rather than
 * deleting records. Only `published` is a problem.
 */
export function publishedDemoContent(items: DemoContentCandidate[]): DemoContentCandidate[] {
  return items.filter((item) => item.status === "published" && isDemoContent(item));
}
