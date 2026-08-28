import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";

import type { ContentDetail } from "../../../lib/content/types";
import { PublicPageFrame } from "../PublicPageFrame";
import { publicStatusLabel } from "./storyPublicLogic";

type StoryDetailProps = {
  content: ContentDetail;
};

/**
 * Uses PublicPageFrame rather than PublicDetailFrame: the original hero here
 * puts the cover photo beside the title/summary, matching PublicPageFrame's
 * hero shape, not PublicDetailFrame's photo-in-main-column layout. The
 * breadcrumb reuses PublicDetailFrame's .detail-breadcrumb chrome for visual
 * consistency with the animal/sponsor detail pages, even though the rest of
 * the frame is PublicPageFrame's.
 */
export function StoryDetail({ content }: StoryDetailProps) {
  const profile = content.storyProfile;
  const publicUpdates = content.updates.filter((update) => update.visibility === "public");
  const gallery = content.media.filter((media) => !media.isCover).slice(0, 6);
  const eyebrow = profile
    ? [publicStatusLabel(profile.publicStatus), profile.publicMapLabel ?? profile.rescueRegion]
        .filter(Boolean)
        .join(" · ")
    : "救援個案";

  return (
    <PublicPageFrame
      eyebrow={eyebrow}
      title={content.title}
      description={content.subtitle ? `${content.subtitle} — ${content.summary}` : content.summary}
      image={content.coverImageUrl ?? undefined}
      imageAlt={content.title}
    >
      <div className="public-container detail-breadcrumb">
        <Link to="/stories">← 返回救援個案</Link>
      </div>

      <section className="section">
        <div className="public-container grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-8">
            {content.body ? (
              <div className="prose prose-neutral max-w-none rounded-md bg-[var(--color-surface-offset)] p-6 text-[var(--color-text)]">
                {content.body.split(/\n{2,}/).map((paragraph) => (
                  <p key={paragraph} className="leading-8">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}

            {gallery.length > 0 ? (
              <div>
                <h2 className="font-display text-2xl font-bold text-[var(--color-panel)]">
                  相片記錄
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {gallery.map((media) => (
                    <figure
                      key={media.id}
                      className="overflow-hidden rounded-md bg-[var(--color-surface-offset)]"
                    >
                      <img
                        src={media.url}
                        alt={media.altText}
                        className="aspect-[4/3] w-full object-cover"
                      />
                      {media.caption ? (
                        <figcaption className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
                          {media.caption}
                        </figcaption>
                      ) : null}
                    </figure>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <h2 className="font-display text-2xl font-bold text-[var(--color-panel)]">
                公開更新
              </h2>
              <div className="mt-4 space-y-3">
                {publicUpdates.length === 0 ? (
                  <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-5 text-sm text-[var(--color-text-muted)]">
                    暫時未有公開更新。
                  </p>
                ) : (
                  publicUpdates.map((update) => (
                    <div
                      key={update.id}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
                    >
                      <div className="text-xs font-bold text-[var(--color-primary)]">
                        {new Date(update.occurredAt).toLocaleDateString("zh-HK", {
                          dateStyle: "medium",
                        })}
                      </div>
                      <h3 className="mt-1 font-display text-xl font-bold text-[var(--color-panel)]">
                        {update.title}
                      </h3>
                      {update.body ? (
                        <p className="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                          {update.body}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            {profile ? (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-5">
                <h2 className="font-display text-xl font-bold text-[var(--color-panel)]">
                  救援概況
                </h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="font-bold text-[var(--color-text)]">公開區域</dt>
                    <dd className="mt-1 text-[var(--color-text-muted)]">{profile.rescueRegion}</dd>
                  </div>
                  {profile.publicMapLabel ? (
                    <div>
                      <dt className="font-bold text-[var(--color-text)]">地圖標籤</dt>
                      <dd className="mt-1 text-[var(--color-text-muted)]">
                        {profile.publicMapLabel}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="font-bold text-[var(--color-text)]">狀態</dt>
                    <dd className="mt-1 text-[var(--color-text-muted)]">
                      {publicStatusLabel(profile.publicStatus)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}

            <div className="rounded-md bg-[var(--color-panel)] p-5 text-white shadow-soft">
              <Heart className="h-6 w-6 text-[var(--color-secondary)]" aria-hidden="true" />
              <h2 className="mt-3 font-display text-2xl font-bold">支持救援個案醫療</h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                你的捐助會用於醫療、暫托、糧食與日常照護，讓更多動物等到安全的一天。
              </p>
              <a
                href="/donate?purpose=medical"
                className="btn-primary min-h-11 mt-4 w-full text-sm!"
              >
                支援醫療費用 ｜ 立即捐助
              </a>
            </div>
          </aside>
        </div>
      </section>
    </PublicPageFrame>
  );
}
