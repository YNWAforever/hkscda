import { Link } from "@tanstack/react-router";

import { AnimalCard } from "../AnimalCard";
import { PublicStateShell } from "../PublicStateShell";
import type { Animal } from "../../../types/animal";

/**
 * Ported from hkscdagpt app/page.tsx (featured-animals). The review-fallback
 * notice in the design source is dropped: this reads the live listing projection,
 * so an empty result is a real empty state rather than a review mode.
 */
export function FeaturedAnimals({ animals }: { animals: Animal[] }) {
  return (
    <section
      className="section section-warm"
      id="featured-animals"
      aria-labelledby="featured-title"
    >
      <div className="public-container">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow">等待一個家</p>
            <h2 id="featured-title">先了解牠，再開始領養。</h2>
          </div>
          <p>每張動物卡只顯示已公開資料；相片、狀態與內容均以協會最新發佈記錄為準。</p>
        </div>

        {animals.length ? (
          <div className="animal-grid home-animal-grid">
            {animals.map((animal) => (
              <AnimalCard key={animal.id} animal={animal} />
            ))}
          </div>
        ) : (
          <PublicStateShell
            title="暫未有可顯示的領養資料"
            description="公開名單會隨照護與領養進度更新。我們不會以舊資料或估算內容代替。"
            action={
              <Link to="/animals/cat" className="btn-primary min-h-11 px-5">
                查看貓貓名單
              </Link>
            }
          />
        )}

        <div className="section-actions">
          <Link className="text-link" to="/animals/cat">
            查看全部貓隻 <span aria-hidden="true">→</span>
          </Link>
          <Link className="text-link" to="/animals/dog">
            查看全部狗隻 <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
