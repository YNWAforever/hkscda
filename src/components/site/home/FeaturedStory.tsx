import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import type { PublicStorySummary } from "../../../lib/content/publicStoriesPage.types";
import fallbackImg from "@/assets/dog-recovering.jpg";
import { revealOrder } from "../revealOnScroll";

function formatDate(value: string | null) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("zh-HK", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Hong_Kong",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

/**
 * Ported from hkscdagpt app/page.tsx (story-section). With nothing published the
 * band keeps a real rescue photograph and a route into the story library rather
 * than standing in a sample case (plan section 10).
 */
export function FeaturedStory({ story }: { story: PublicStorySummary | null }) {
  const region = story?.storyProfile?.rescueRegion ?? null;
  const published = formatDate(story?.publishedAt ?? null);

  return (
    <section className="section story-section section-warm" aria-labelledby="story-title">
      <div className="public-container story-grid">
        <figure className="story-photo" data-reveal>
          <img
            src={story?.coverImageUrl || fallbackImg}
            alt={story ? story.title : "接受照護、等待康復的獲救狗隻"}
            loading="lazy"
            decoding="async"
          />
          <figcaption>{story ? "精選救援故事" : "真實 HKSCDA 救援相片"}</figcaption>
        </figure>
        <div className="story-copy" data-reveal style={revealOrder(1)}>
          <p className="home-kicker">救援故事</p>
          {story ? (
            <>
              <h2 id="story-title">{story.title}</h2>
              <p className="story-summary">{story.summary}</p>
              <p className="story-meta">
                {published || "已發佈"}
                {region ? " · " + region : ""}
              </p>
              <div className="story-actions">
                <Link className="button button-primary button-arrow" to={"/stories/" + story.slug}>
                  閱讀故事
                  <ArrowRight aria-hidden="true" />
                </Link>
                <Link className="text-link" to="/stories">
                  瀏覽故事庫 <span aria-hidden="true">→</span>
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 id="story-title">每一隻獲救動物，都有自己的故事。</h2>
              <p className="story-summary">
                精選故事暫未發佈。故事庫只收錄經核實的真實個案，不以示例個案代替真實經歷。
              </p>
              <div className="story-actions">
                <Link className="button button-primary button-arrow" to="/stories">
                  瀏覽故事庫
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
