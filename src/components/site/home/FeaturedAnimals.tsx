import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { AnimalCard } from "../AnimalCard";
import { PublicStateShell } from "../PublicStateShell";
import { revealOrder } from "../revealOnScroll";
import { HomeSectionHeading } from "./HomeSectionHeading";
import type { Animal } from "../../../types/animal";

/**
 * Ported from hkscdagpt app/page.tsx (featured-animals). The design source shows a
 * notice when it is serving stand-in data; that mode is not ported, so an empty
 * result here is a real empty state.
 */
export function FeaturedAnimals({
  animals,
  loadFailed = false,
}: {
  animals: Animal[];
  loadFailed?: boolean;
}) {
  return (
    <section
      className="section section-warm"
      id="featured-animals"
      aria-labelledby="featured-title"
    >
      <div className="public-container">
        <HomeSectionHeading
          id="featured-title"
          kicker="等待一個家"
          title="先了解牠，再開始領養。"
          lead="每張動物卡只顯示已公開資料；相片、狀態與內容均以協會最新發佈記錄為準。"
        />

        {animals.length ? (
          <div className="animal-grid home-animal-grid">
            {animals.map((animal, index) => (
              <div
                key={animal.id}
                className="home-animal-cell"
                data-reveal
                style={revealOrder(index)}
              >
                <AnimalCard animal={animal} priority={index === 0} />
              </div>
            ))}
          </div>
        ) : (
          <PublicStateShell
            headingLevel={2}
            title={loadFailed ? "暫時未能載入領養資料" : "暫未有可顯示的領養資料"}
            description={
              loadFailed
                ? "系統暫時未能取得領養資料，請稍後再試或查看貓狗名單。"
                : "公開名單會隨照護與領養進度更新。我們不會以舊資料或估算內容代替。"
            }
            action={
              <Link to="/animals/cat" className="btn-primary min-h-11 px-5">
                查看貓貓名單
              </Link>
            }
          />
        )}

        <div className="section-actions home-species-links">
          <Link className="home-species-link" to="/animals/cat">
            <span>查看全部貓隻</span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="home-species-link" to="/animals/dog">
            <span>查看全部狗隻</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
