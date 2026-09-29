import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { AnimalGrid } from "../../src/components/site/AnimalGrid";
import { ShortlistProvider } from "../../src/components/site/ShortlistProvider";
import { buildPublicAnimalListing } from "../../src/lib/animals/publicListing";
import type { Animal } from "../../src/types/animal";
import "../../src/styles.css";
const animals: Animal[] = Array.from({ length: 34 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  type: "cat",
  name: `合成貓咪 ${i + 1}`,
  name_en: null,
  gender: i % 2 ? "male" : "female",
  age: "2 歲",
  age_en: null,
  description: null,
  description_en: null,
  notes: "private-marker",
  notes_en: null,
  status: "available",
  publication_state: "published",
  adoption_eligible: true,
  sponsorship_eligible: false,
  image_url: "/brand/hkscda-logo-primary.jpg",
  created_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
  updated_at: "2026-01-01T00:00:00Z",
}));
const rootRoute = createRootRoute({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : "",
    page: Number(s.page) || 1,
    filter: s.filter === "adult" ? ("adult" as const) : ("all" as const),
    gender: s.gender === "female" ? ("female" as const) : ("all" as const),
  }),
  component: Fixture,
});
function Fixture() {
  const search = rootRoute.useSearch();
  const result = buildPublicAnimalListing({
    animals,
    type: "cat",
    ageFilter: search.filter,
    genderFilter: search.gender,
    page: search.page,
    pageSize: 16,
    q: search.q,
  });
  return (
    <main className="public-container py-8">
      <h1>隔離公開列表驗收</h1>
      <ShortlistProvider>
        <AnimalGrid
          {...result}
          intent="adoption"
          ageFilter={search.filter}
          genderFilter={search.gender}
          q={search.q}
        />
      </ShortlistProvider>
    </main>
  );
}
const router = createRouter({
  routeTree: rootRoute,
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
