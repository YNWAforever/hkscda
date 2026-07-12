export type GoogleMapsListener = unknown;

export type GoogleMapsNamespace = {
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => {
    fitBounds(bounds: unknown): void;
  };
  Marker: new (options: Record<string, unknown>) => {
    addListener(eventName: string, handler: () => void): GoogleMapsListener;
    setMap(map: null): void;
  };
  InfoWindow: new () => {
    setContent(content: HTMLElement): void;
    open(options: Record<string, unknown>): void;
  };
  LatLngBounds: new () => { extend(position: { lat: number; lng: number }): void };
  event: { removeListener(listener: GoogleMapsListener): void };
};

type MapsWindow = Window & { google?: { maps?: GoogleMapsNamespace } };

const SCRIPT_ID = "hkscda-google-maps";
let loaderPromise: Promise<GoogleMapsNamespace> | null = null;

export function googleMapsScriptUrl(apiKey: string) {
  return `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
}

export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Google Maps requires a browser"));
  }
  const mapsWindow = window as MapsWindow;
  if (mapsWindow.google?.maps) return Promise.resolve(mapsWindow.google.maps);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = googleMapsScriptUrl(apiKey);
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const maps = mapsWindow.google?.maps;
      if (maps) resolve(maps);
      else reject(new Error("Google Maps did not initialize"));
    };
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.append(script);
  });

  loaderPromise = loaderPromise.catch((error: unknown) => {
    loaderPromise = null;
    document.getElementById(SCRIPT_ID)?.remove();
    throw error;
  });

  return loaderPromise;
}
