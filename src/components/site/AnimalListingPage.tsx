import { Link } from "@tanstack/react-router";

import { AnimalGrid } from "./AnimalGrid";
import { PublicStateShell } from "./PublicStateShell";
import type { AgeFilter, Animal, GenderFilter } from "../../types/animal";

export type AnimalListingSpecies = "cat" | "dog";

const COPY: Record<AnimalListingSpecies, { title: string; label: string; lead: string }> = {
  cat: {
    title: "待領養貓貓",
    label: "貓",
    lead: "查看目前可申請領養的貓貓，按年齡及性別縮窄結果，再了解牠們的需要。",
  },
  dog: {
    title: "待領養狗狗",
    label: "狗",
    lead: "查看目前可申請領養的狗狗，按年齡及性別縮窄結果，再了解牠們的需要。",
  },
};

function SpeciesNav({ current }: { current: AnimalListingSpecies }) {
  return (
    <nav aria-label="選擇動物種類" className="species-nav">
      <Link to="/animals/cat" aria-current={current === "cat" ? "page" : undefined}>
        貓貓
      </Link>
      <Link to="/animals/dog" aria-current={current === "dog" ? "page" : undefined}>
        狗狗
      </Link>
    </nav>
  );
}

function ListingHero({ species }: { species: AnimalListingSpecies }) {
  const copy = COPY[species];
  return (
    <section className="page-hero">
      <div className="public-container page-hero-grid">
        <div className="page-hero-copy">
          <p className="eyebrow">領養動物</p>
          <h1>{copy.title}</h1>
          <p>{copy.lead}</p>
        </div>
        <SpeciesNav current={species} />
      </div>
    </section>
  );
}

/**
 * Shared by /animals/cat and /animals/dog so the two listings cannot drift.
 * Filtering and pagination happen in the listing projection before the page
 * renders, which is what keeps the total and the page count consistent (G-01).
 */
export function AnimalListingPage({
  species,
  animals,
  total,
  page,
  pageSize,
  ageFilter,
  genderFilter,
}: {
  species: AnimalListingSpecies;
  animals: Animal[];
  total: number;
  page: number;
  pageSize: number;
  ageFilter: AgeFilter;
  genderFilter: GenderFilter;
}) {
  return (
    <main>
      <ListingHero species={species} />
      <section className="section">
        <div className="public-container">
          <AnimalGrid
            animals={animals}
            total={total}
            page={page}
            ageFilter={ageFilter}
            genderFilter={genderFilter}
            pageSize={pageSize}
            animalLabel={COPY[species].label}
          />
        </div>
      </section>
    </main>
  );
}

export function AnimalListingPending({ species }: { species: AnimalListingSpecies }) {
  return (
    <main>
      <ListingHero species={species} />
      <section className="section">
        <div className="public-container">
          <div className="animal-grid" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <div className="skeleton-card" key={index}>
                <i className="skeleton-media" />
                <i className="skeleton-line" />
                <i className="skeleton-line" />
              </div>
            ))}
          </div>
          <p className="sr-only" role="status">
            正在載入{COPY[species].title}。
          </p>
        </div>
      </section>
    </main>
  );
}

export function AnimalListingError({
  species,
  onRetry,
}: {
  species: AnimalListingSpecies;
  onRetry: () => void;
}) {
  return (
    <main>
      <ListingHero species={species} />
      <PublicStateShell
        role="alert"
        title={"暫時未能載入" + COPY[species].title}
        description="系統未能取得目前的領養資料，請稍後再試。"
        action={
          <button type="button" onClick={onRetry} className="btn-primary min-h-11 px-5">
            再試一次
          </button>
        }
      />
    </main>
  );
}
