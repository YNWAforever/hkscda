import { Link } from "@tanstack/react-router";

import type { PublicStorySummary } from "../../../lib/content/publicStoriesPage.types";
import fallbackImg from "@/assets/dog-recovering.jpg";

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
        <div className="story-photo">
          <img
            src={story?.coverImageUrl || fallbackImg}
            alt={story ? story.title : "接受照護、等待康復的獲救狗隻"}
            loading="lazy"
          />
        </div>
        <div className="story-copy">
          <p className="eyebrow">救援故事</p>
          {story ? (
            <>
              <h2 id="story-title">{story.title}</h2>
              <p className="story-summary">{story.summary}</p>
              <p className="story-meta">
                {published || "已發佈"}
                {region ? " · " + region : ""}
              </p>
              <div className="story-actions">
                <Link className="button button-primary" to={"/stories/" + story.slug}>
                  閱讀故事
                </Link>
                <Link className="text-link" to="/stories">
                  瀏覽故事庫 <span aria-hidden="true">→</span>
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 id="story-title">暫未發佈精選故事。</h2>
              <p className="story-summary">
                故事庫暫未有可顯示的精選內容，因此保留真實救援相片與故事入口，不以示例個案代替真實經歷。
              </p>
              <Link className="button button-primary" to="/stories">
                瀏覽故事庫
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
