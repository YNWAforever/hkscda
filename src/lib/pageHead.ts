import { absolutePublicUrl, publicUrl } from "@/lib/publicOrigin";

export const SITE_TITLE_SUFFIX = "香港拯救貓狗協會 HKSCDA";
const SOCIAL_TITLE_SUFFIX = "HKSCDA";

export type IndexablePage = {
  title: string;
  description?: string;
  /** A shorter line for share cards; the description is used when absent. */
  shareDescription?: string;
  /** The share image; left out, the root default (the logo) applies. */
  image?: string | null;
  path: string;
};
export type PrivatePage = { title: string; private: true };
export type HeadMeta = Record<string, string>;

/**
 * The `head` for a public route, so no page falls back to the homepage title in
 * `__root.tsx`.
 *
 * An indexable page gets its own title, description, social tags, URL and
 * canonical; Open Graph and Twitter always carry the same title and description.
 * A missing, empty or blank description leaves the description tags out, so the
 * root default applies. A private page (a token status link) gets a title only,
 * plus noindex and no-referrer, and no URL anywhere: the address carries a secret
 * token.
 */
export function pageHead(page: IndexablePage | PrivatePage): {
  meta: HeadMeta[];
  links: { rel: string; href: string }[];
} {
  const title = `${page.title} · ${SITE_TITLE_SUFFIX}`;

  if ("private" in page) {
    return {
      meta: [
        { title },
        { name: "robots", content: "noindex, nofollow, noarchive" },
        { name: "referrer", content: "no-referrer" },
      ],
      links: [],
    };
  }

  const socialTitle = `${page.title} · ${SOCIAL_TITLE_SUFFIX}`;
  const description = page.description?.trim();
  const shareDescription = page.shareDescription?.trim() || description;
  const canonical = publicUrl(page.path);
  const meta: HeadMeta[] = [{ title }];
  if (description) meta.push({ name: "description", content: description });
  meta.push(
    { property: "og:title", content: socialTitle },
    { name: "twitter:title", content: socialTitle },
    { property: "og:url", content: canonical },
  );
  if (shareDescription) {
    meta.push(
      { property: "og:description", content: shareDescription },
      { name: "twitter:description", content: shareDescription },
    );
  }
  if (page.image !== undefined) {
    const image = absolutePublicUrl(page.image);
    meta.push({ property: "og:image", content: image }, { name: "twitter:image", content: image });
  }
  return { meta, links: [{ rel: "canonical", href: canonical }] };
}

export type HeadMatchContext = { match: { id: string }; matches: ReadonlyArray<{ id: string }> };

/**
 * For a layout route that also renders a page of its own (`/stories`,
 * `/volunteer`). Its `head` runs for every child too, and while child meta tags
 * replace the parent's by name, links do not: a story would carry two
 * canonicals, the hub's and its own. The head applies only when this route is
 * the page being shown.
 */
export function ownPageHead<T extends object>(
  ctx: HeadMatchContext,
  head: T,
): T | Record<string, never> {
  return ctx.matches.at(-1)?.id === ctx.match.id ? head : {};
}
