import { Link } from "@tanstack/react-router";
import { Cat, Dog, Filter, Heart, MapPin } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  AnimalStoryType,
  ContentSummary,
  RescuePublicStatus,
} from "../../../lib/content/types";
import { filterStoryCards, publicStatusLabel } from "./storyPublicLogic";

type StoryWallProps = {
  stories: ContentSummary[];
};

const animalFilters: { value: AnimalStoryType | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "cat", label: "貓" },
  { value: "dog", label: "狗" },
  { value: "mixed", label: "貓狗" },
];

const statusFilters: { value: RescuePublicStatus | "all"; label: string }[] = [
  { value: "all", label: "全部狀態" },
  { value: "medical_care", label: "醫療照護" },
  { value: "ready_for_adoption", label: "準備領養" },
  { value: "adopted", label: "已領養" },
  { value: "sponsor_needed", label: "需要助養" },
];

export function StoryWall({ stories }: StoryWallProps) {
  const [animalType, setAnimalType] = useState<AnimalStoryType | "all">("all");
  const [publicStatus, setPublicStatus] = useState<RescuePublicStatus | "all">("all");
  const [rescueRegion, setRescueRegion] = useState("all");

  const regions = useMemo(
    () =>
      Array.from(
        new Set(
          stories
            .filter((story) => story.type === "rescue_story" && story.storyProfile)
            .map((story) => story.storyProfile?.rescueRegion)
            .filter((region): region is string => Boolean(region)),
        ),
      ).sort((a, b) => a.localeCompare(b, "zh-HK")),
    [stories],
  );

  const filteredStories = filterStoryCards(stories, { animalType, publicStatus, rescueRegion });

  return (
    <section className="bg-[var(--color-surface)] px-4 py-10 sm:py-12">
      <div className="container-wide space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--color-primary)]">
              <Heart className="h-4 w-4" aria-hidden="true" />
              Public Stories
            </div>
            <h1 className="font-display text-3xl font-bold leading-tight text-[var(--color-panel)] sm:text-4xl">
              救援故事牆
            </h1>
            <p className="mt-2 max-w-[58ch] text-sm leading-7 text-[var(--color-text-muted)]">
              追蹤正在康復、等待家庭或已展開新生活的貓狗故事。位置只顯示公開安全區域。
            </p>
          </div>

          <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-2">
            <Filter className="mt-2 h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />
            <select
              aria-label="動物類型"
              value={animalType}
              onChange={(event) => setAnimalType(event.target.value as AnimalStoryType | "all")}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
            >
              {animalFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
            <select
              aria-label="公開狀態"
              value={publicStatus}
              onChange={(event) =>
                setPublicStatus(event.target.value as RescuePublicStatus | "all")
              }
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
            >
              {statusFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
            <select
              aria-label="救援區域"
              value={rescueRegion}
              onChange={(event) => setRescueRegion(event.target.value)}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
            >
              <option value="all">全部地區</option>
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredStories.length === 0 ? (
          <div className="card-dashed bg-[var(--color-surface-offset)] p-8 text-center text-sm text-[var(--color-text-muted)]">
            暫時未有符合篩選的公開救援故事。
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStories.map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StoryCard({ story }: { story: ContentSummary }) {
  const profile = story.storyProfile;
  if (!profile) return null;
  const PlaceholderIcon = profile.animalType === "dog" ? Dog : Cat;

  return (
    <article className="card-dashed flex h-full flex-col overflow-hidden bg-[var(--color-surface)] transition hover:shadow-md">
      <Link to="/stories/$slug" params={{ slug: story.slug }} className="block">
        {story.coverImageUrl ? (
          <img
            src={story.coverImageUrl}
            alt={story.title}
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-[var(--color-primary-highlight)]">
            <PlaceholderIcon
              className="h-16 w-16 text-[var(--color-primary)] opacity-40"
              strokeWidth={1.2}
              aria-hidden="true"
            />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--color-accent-warm)] px-3 py-1 text-xs font-bold text-white">
            {publicStatusLabel(profile.publicStatus)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-offset)] px-3 py-1 text-xs font-bold text-[var(--color-text-muted)]">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {profile.rescueRegion}
          </span>
        </div>
        <div>
          <h2 className="font-display text-xl font-bold leading-snug text-[var(--color-panel)]">
            <Link to="/stories/$slug" params={{ slug: story.slug }}>
              {story.title}
            </Link>
          </h2>
          {story.subtitle ? (
            <p className="mt-1 text-sm font-medium text-[var(--color-primary)]">{story.subtitle}</p>
          ) : null}
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-[var(--color-text-muted)]">
          {story.summary}
        </p>
        {story.latestPublicUpdate ? (
          <p className="mt-auto rounded-xl bg-[var(--color-surface-offset)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]">
            最新：{story.latestPublicUpdate.title}
          </p>
        ) : null}
      </div>
    </article>
  );
}
