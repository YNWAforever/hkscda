import { publicUrl } from "@/lib/publicOrigin";

export const SITE_TITLE_SUFFIX = "香港拯救貓狗協會 HKSCDA";
const SOCIAL_TITLE_SUFFIX = "HKSCDA";

export type IndexablePage = { title: string; description: string; path: string };
export type PrivatePage = { title: string; private: true };
export type HeadMeta = Record<string, string>;

/**
 * The `head` for a public route, so no page falls back to the homepage title in
 * `__root.tsx`.
 *
 * An indexable page gets its own title, description, social tags and canonical.
 * A private page (a token status link) gets a title only, plus noindex and
 * no-referrer, and no URL anywhere: the address carries a secret token.
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
  return {
    meta: [
      { title },
      { name: "description", content: page.description },
      { property: "og:title", content: socialTitle },
      { property: "og:description", content: page.description },
      { name: "twitter:title", content: socialTitle },
      { name: "twitter:description", content: page.description },
    ],
    links: [{ rel: "canonical", href: publicUrl(page.path) }],
  };
}
