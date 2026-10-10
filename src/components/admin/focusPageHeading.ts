/**
 * After a mobile navigation the drawer is gone and Radix is told not to return focus to its
 * trigger, so focus is moved to the new page's `h1`: a screen-reader user hears where they
 * are, and the next Tab starts at the top of the page. Every admin page renders exactly one
 * `h1` in every state (`adminHeadingGuard.test.tsx`). A heading is not focusable by default,
 * so it gets `tabindex="-1"` first, unless the page already set one. Returns whether a
 * heading was found.
 */
export function focusPageHeading(doc: Pick<Document, "querySelector">): boolean {
  const heading = doc.querySelector<HTMLElement>("main h1");
  if (!heading) return false;
  if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  heading.focus();
  return true;
}
