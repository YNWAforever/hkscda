import { useEffect, useRef, useState } from "react";

import type { PublicStoryMapPoint } from "../../../lib/content/types";
import { loadGoogleMaps, type GoogleMapsListener } from "./googleMapsLoader";

type GoogleRescueMapProps = { apiKey: string; points: PublicStoryMapPoint[] };

export function GoogleRescueMap({ apiKey, points }: GoogleRescueMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let listeners: GoogleMapsListener[] = [];
    let markers: Array<{ setMap(map: null): void }> = [];
    let removeListener: ((listener: GoogleMapsListener) => void) | null = null;

    void loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const map = new maps.Map(containerRef.current, {
          center: { lat: 22.3193, lng: 114.1694 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        const bounds = new maps.LatLngBounds();
        const infoWindow = new maps.InfoWindow();
        removeListener = maps.event.removeListener;

        markers = points.map((point) => {
          const position = { lat: point.lat, lng: point.lng };
          bounds.extend(position);
          const marker = new maps.Marker({ map, position, title: point.publicMapLabel });
          const listener = marker.addListener("click", () => {
            const content = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = point.title;
            const link = document.createElement("a");
            link.href = `/stories/${encodeURIComponent(point.slug)}`;
            link.textContent = point.publicMapLabel;
            link.style.display = "block";
            content.append(title, link);
            infoWindow.setContent(content);
            infoWindow.open({ map, anchor: marker });
          });
          listeners.push(listener);
          return marker;
        });
        if (points.length > 1) map.fitBounds(bounds);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (removeListener) listeners.forEach(removeListener);
      markers.forEach((marker) => marker.setMap(null));
      listeners = [];
      markers = [];
    };
  }, [apiKey, points]);

  return (
    <div className="relative min-h-[300px] overflow-hidden rounded-md bg-[var(--color-surface-offset)]">
      <div ref={containerRef} data-google-rescue-map="ready" className="absolute inset-0" />
      {failed ? (
        <p
          role="status"
          className="relative z-10 m-4 bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]"
        >
          地圖暫時未能載入，請使用旁邊的救援地點清單。
        </p>
      ) : null}
    </div>
  );
}
