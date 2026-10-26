declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

let gaInitialized = false;

const sensitiveStatusPaths: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/adoption\/status\/[^/]+\/?$/i, "/adoption/status/[token]"],
  [/^\/sponsors\/status\/[^/]+\/?$/i, "/sponsors/status/[token]"],
  [/^\/volunteer\/status\/[^/]+\/?$/i, "/volunteer/status/[token]"],
];

export function redactSensitivePagePath(pathname: string): string | undefined {
  for (const [pattern, replacement] of sensitiveStatusPaths) {
    if (pattern.test(pathname)) return replacement;
  }
  return undefined;
}

/** Override GA's URL defaults for bearer links, including custom events and referrers. */
function sensitivePageFields(): Record<string, string> {
  const fields: Record<string, string> = {};
  const pagePath = redactSensitivePagePath(window.location.pathname);
  if (pagePath) {
    fields.page_location = `${window.location.origin}${pagePath}`;
    fields.page_path = pagePath;
  }
  try {
    const referrer = new URL(document.referrer);
    const referrerPath = redactSensitivePagePath(referrer.pathname);
    if (referrerPath) fields.page_referrer = `${referrer.origin}${referrerPath}`;
  } catch {
    // An absent or malformed referrer must not interrupt the page or an event.
  }
  return fields;
}

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
  const fields = {
    ...(options.pagePath
      ? {
          page_location: `${window.location.origin}${options.pagePath}`,
          page_path: options.pagePath,
          page_title: document.title,
        }
      : {}),
    ...sensitivePageFields(),
  };
  if (Object.keys(fields).length > 0) {
    window.gtag("config", measurementId, fields);
    return;
  }
  window.gtag("config", measurementId);
}

export function gtagEvent(action: string, params?: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.gtag) {
    const fields = sensitivePageFields();
    window.gtag("event", action, Object.keys(fields).length ? { ...params, ...fields } : params);
  }
}
