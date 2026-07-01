export type PhotoWindowHandle = {
  opener: unknown;
  location: { href: string };
  close: () => void;
};

export type PhotoWindowOpen = (
  url?: string,
  target?: string,
  features?: string,
) => PhotoWindowHandle | null;

function defaultOpenWindow(...args: Parameters<PhotoWindowOpen>) {
  return window.open(...args) as PhotoWindowHandle | null;
}

export function openPendingPhotoWindow(openWindow: PhotoWindowOpen = defaultOpenWindow) {
  const opened = openWindow("", "_blank");
  if (opened) opened.opener = null;
  return opened;
}

export function openSignedPhotoUrl(
  url: string,
  opened: PhotoWindowHandle | null,
  openWindow: PhotoWindowOpen = defaultOpenWindow,
) {
  if (opened) {
    opened.location.href = url;
    return;
  }

  const fallback = openWindow(url, "_blank", "noopener,noreferrer");
  if (fallback) fallback.opener = null;
}
