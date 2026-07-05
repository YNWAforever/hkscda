import { Cat, Dog, MapPinned } from "lucide-react";

import type { PublicStoryMapPoint } from "../../../lib/content/types";
import { publicStatusLabel } from "./storyPublicLogic";

type RescueMapProps = {
  points: PublicStoryMapPoint[];
};

export function RescueMap({ points }: RescueMapProps) {
  return (
    <section className="bg-[var(--color-lavender)] px-4 py-10 sm:py-12">
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
          <div className="card-dashed relative min-h-[260px] overflow-hidden bg-[var(--color-surface)] p-5">
            <svg
              viewBox="0 0 320 240"
              role="img"
              aria-label="香港救援區域示意圖"
              className="h-full w-full"
            >
              <path
                d="M52 130 C74 86 119 73 158 98 C187 70 240 81 267 124 C244 158 198 176 154 154 C116 181 75 171 52 130Z"
                fill="var(--color-primary-highlight)"
                stroke="var(--color-primary)"
                strokeWidth="3"
              />
              <path
                d="M91 125 C113 109 139 112 155 132 C132 145 112 146 91 125Z"
                fill="var(--color-surface-offset)"
                stroke="var(--color-border)"
                strokeWidth="2"
              />
              <path
                d="M172 125 C197 108 226 113 241 137 C217 151 190 149 172 125Z"
                fill="var(--color-surface-offset)"
                stroke="var(--color-border)"
                strokeWidth="2"
              />
              {points.slice(0, 8).map((point, index) => {
                const x = 74 + ((index * 37) % 172);
                const y = 91 + ((index * 29) % 82);
                return (
                  <g key={point.id}>
                    <circle cx={x} cy={y} r="9" fill="var(--color-cta)" />
                    <text
                      x={x}
                      y={y + 4}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="white"
                    >
                      {index + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="space-y-3">
            {points.length === 0 ? (
              <div className="card-dashed bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]">
                暫時未有可公開顯示的地圖故事。
              </div>
            ) : (
              points.map((point, index) => {
                const Icon = point.animalType === "dog" ? Dog : Cat;
                return (
                  <a
                    key={point.id}
                    href={`/stories/${point.slug}`}
                    className="card-dashed flex gap-3 bg-[var(--color-surface)] p-4 transition hover:shadow-sm"
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
                  </a>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
