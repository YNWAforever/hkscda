declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

let gaInitialized = false;

export function initGA4(measurementId: string, options: { pagePath?: string } = {}) {
  if (typeof window === "undefined") return;

  const scriptId = `ga4-${measurementId}`;
  if (!document.getElementById(scriptId)) {
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.async = true;
    document.head.appendChild(script);
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    ((...args: unknown[]) => {
      window.dataLayer.push(args);
    });
  if (!gaInitialized) {
    window.gtag("js", new Date());
    gaInitialized = true;
  }
  if (options.pagePath) {
    window.gtag("config", measurementId, {
      page_location: `${window.location.origin}${options.pagePath}`,
      page_path: options.pagePath,
      page_title: document.title,
    });
    return;
  }
  window.gtag("config", measurementId);
}

export function gtagEvent(action: string, params?: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", action, params);
  }
}
