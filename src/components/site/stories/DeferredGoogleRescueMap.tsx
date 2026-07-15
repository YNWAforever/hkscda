import { useEffect, useMemo, useRef, useState } from "react";

import type { PublicStoryMapPoint } from "../../../lib/content/types";
import {
  createBrowserDeferredMapEnvironment,
  observeNearViewport,
  scheduleIdlePreload,
} from "./deferredMapScheduling";
import { GoogleRescueMap } from "./GoogleRescueMap";
import { loadGoogleMaps } from "./googleMapsLoader";

type DeferredGoogleRescueMapProps = {
  apiKey: string;
  points: PublicStoryMapPoint[];
};

export function DeferredGoogleRescueMap({ apiKey, points }: DeferredGoogleRescueMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const environment = useMemo(() => createBrowserDeferredMapEnvironment(), []);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    return observeNearViewport(target, () => setNearViewport(true), environment);
  }, [environment]);

  useEffect(
    () =>
      scheduleIdlePreload(() => {
        void loadGoogleMaps(apiKey).catch(() => undefined);
      }, environment),
    [apiKey, environment],
  );

  return (
    <div
      ref={containerRef}
      data-google-rescue-map="deferred"
      className="relative min-h-[300px] overflow-hidden rounded-md bg-[var(--color-surface-offset)]"
    >
      {nearViewport ? (
        <GoogleRescueMap apiKey={apiKey} points={points} />
      ) : (
        <p className="sr-only" role="status">
          救援地圖準備載入
        </p>
      )}
    </div>
  );
}
