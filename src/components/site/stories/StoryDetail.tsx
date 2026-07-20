import { Link } from "@tanstack/react-router";
import { ArrowLeft, Cat, Dog, Heart, MapPin } from "lucide-react";

import type { ContentDetail } from "../../../lib/content/types";
import { publicStatusLabel } from "./storyPublicLogic";

type StoryDetailProps = {
  content: ContentDetail;
};

export function StoryDetail({ content }: StoryDetailProps) {
  const profile = content.storyProfile;
  const PlaceholderIcon = profile?.animalType === "dog" ? Dog : Cat;
  const publicUpdates = content.updates.filter((update) => update.visibility === "public");
  const gallery = content.media.filter((media) => !media.isCover).slice(0, 6);

  return (
    <main className="bg-[var(--color-surface)]">
      <article>
        <section className="bg-[var(--color-surface-offset)] px-4 py-8 sm:py-10">
          <div className="container-wide">
            <Link
              to="/stories"
              className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--color-primary)]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回救援個案
            </Link>
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {profile ? (
                    <span className="rounded-full bg-[var(--color-secondary)] px-3 py-1 text-xs font-bold text-white">
                      {publicStatusLabel(profile.publicStatus)}
                    </span>
                  ) : null}
                  {profile ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-[var(--color-text-muted)]">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {profile.publicMapLabel ?? profile.rescueRegion}
                    </span>
                  ) : null}
                </div>
                <h1 className="font-display text-4xl font-bold leading-tight text-[var(--color-panel)] sm:text-5xl">
                  {content.title}
                </h1>
                {content.subtitle ? (
                  <p className="mt-3 text-lg font-medium text-[var(--color-primary)]">
                    {content.subtitle}
                  </p>
                ) : null}
                <p className="mt-4 max-w-[62ch] text-base leading-8 text-[var(--color-text-muted)]">
                  {content.summary}
                </p>
              </div>
              {content.coverImageUrl ? (
                <img
                  src={content.coverImageUrl}
                  alt={content.title}
                  className="aspect-[4/3] w-full rounded-md border border-[var(--color-border)] object-cover shadow-soft"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-primary-highlight)] shadow-soft">
                  <PlaceholderIcon
                    className="h-20 w-20 text-[var(--color-primary)] opacity-45"
                    strokeWidth={1.2}
                    aria-hidden="true"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="px-4 py-10">
          <div className="container-wide grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                      <dd className="mt-1 text-[var(--color-text-muted)]">
                        {profile.rescueRegion}
                      </dd>
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
      </article>
    </main>
  );
}
