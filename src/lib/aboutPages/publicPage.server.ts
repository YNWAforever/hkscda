import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseAboutPagesRepository } from "./repository.server";
import type {
  AboutPageContent,
  AboutPageSlug,
  AnyAboutPageContent,
  CccpPageContent,
  TnrPageContent,
} from "./types";

export async function loadAboutPageContent(slug: "about"): Promise<AboutPageContent | null>;
export async function loadAboutPageContent(slug: "tnr"): Promise<TnrPageContent | null>;
export async function loadAboutPageContent(slug: "cccp"): Promise<CccpPageContent | null>;
// General overload for callers holding a plain `AboutPageSlug` variable rather than
// a narrowed literal (e.g. a slug forwarded from a route param). Must stay below the
// literal overloads above: TypeScript tries overloads in declaration order, and a
// literal call site should still resolve to its more specific return type.
export async function loadAboutPageContent(
  slug: AboutPageSlug,
): Promise<AnyAboutPageContent | null>;
export async function loadAboutPageContent(
  slug: AboutPageSlug,
): Promise<AnyAboutPageContent | null> {
  try {
    const client = createSupabaseServiceClient();
    return await createSupabaseAboutPagesRepository(client).getContent(slug);
  } catch {
    return null;
  }
}
