import { Link } from "@tanstack/react-router";
import { Cat, Dog, MapPinned } from "lucide-react";

import type { PublicStoryMapPoint } from "../../../lib/content/types";
import { DeferredGoogleRescueMap } from "./DeferredGoogleRescueMap";
import { publicStatusLabel } from "./storyPublicLogic";

type RescueMapProps = { points: PublicStoryMapPoint[]; apiKey?: string };

export function RescueMap({ points, apiKey }: RescueMapProps) {
  const resolvedApiKey = apiKey ?? import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  return (
    <section className="bg-[var(--color-surface-offset)] px-4 py-10 sm:py-12">
      <div className="container-wide grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--color-primary)]">
            <MapPinned className="h-4 w-4" aria-hidden="true" />
            Rescue Map
          </div>
          <h2 className="font-display text-3xl font-bold text-[var(--color-panel)]">
            公開救援地圖
          </h2>
          <p className="mt-2 max-w-[52ch] text-sm leading-7 text-[var(--color-text-muted)]">
            地圖只顯示區域或公開標籤，不顯示精確地址、暫托地址或內部位置備註。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
          {resolvedApiKey && points.length > 0 ? (
            <DeferredGoogleRescueMap apiKey={resolvedApiKey} points={points} />
          ) : (
            <div className="rounded-md border border-[var(--color-border)] flex min-h-[300px] items-center justify-center bg-[var(--color-surface)] p-5 text-center text-sm text-[var(--color-text-muted)]">
              地圖暫時未能載入，請使用救援地點清單。
            </div>
          )}

          <div className="space-y-3">
            {points.length === 0 ? (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]">
                暫時沒有公開地圖故事。
              </div>
            ) : (
              points.map((point, index) => {
                const Icon = point.animalType === "dog" ? Dog : Cat;
                return (
                  <Link
                    key={point.id}
                    to="/stories/$slug"
                    params={{ slug: point.slug }}
                    className="rounded-md border border-[var(--color-border)] flex gap-3 bg-[var(--color-surface)] p-4 transition hover:shadow-sm"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-highlight)] text-[var(--color-primary)]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-primary)]">
                        <span>{index + 1}</span>
                        <span>{point.publicMapLabel}</span>
                      </div>
                      <h3 className="mt-1 truncate font-display text-lg font-bold text-[var(--color-panel)]">
                        {point.title}
                      </h3>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                        {point.rescueRegion} · {publicStatusLabel(point.publicStatus)}
                      </p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
