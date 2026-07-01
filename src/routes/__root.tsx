import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Header } from "../components/site/Header";
import { Footer } from "../components/site/Footer";
import { ShortlistProvider } from "../components/site/ShortlistProvider";
import { ShortlistTray } from "../components/site/ShortlistTray";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { organizationSchema, websiteSchema } from "../lib/schema";
import { initGA4 } from "../lib/analytics";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-[var(--color-text)]">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-[var(--color-text)]">找不到頁面</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">您要找的頁面不存在或已移動。</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-[var(--color-primary)] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          >
            返回主頁
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">
          頁面未能載入
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          系統出現問題。您可以嘗試重新整理或返回主頁。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-[var(--color-primary)] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          >
            重新整理
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-offset)]"
          >
            返回主頁
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "香港拯救貓狗協會 HKSCDA · 領養代替購買" },
      {
        name: "description",
        content:
          "香港拯救貓狗協會（HKSCDA）成立於2007年，致力為流浪貓狗提供糧食、醫療、絕育及領養服務。支持領養等於拯救生命。",
      },
      { name: "author", content: "HKSCDA" },
      { property: "og:title", content: "香港拯救貓狗協會 HKSCDA" },
      {
        property: "og:description",
        content: "支持領養 · 拯救生命 · 不殺機構 · 每年救助超過600隻毛孩",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "香港拯救貓狗協會 HKSCDA" },
      {
        name: "twitter:description",
        content: "支持領養 · 拯救生命 · 不殺機構",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Noto+Sans+HK:wght@300;400;500;700;900&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(organizationSchema()),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(websiteSchema()),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--color-primary)] focus:text-white focus:rounded-md focus:font-bold focus:text-sm"
        >
          跳至主要內容
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { location } = useRouterState();
  const isAdmin = location.pathname.startsWith("/admin");

  useEffect(() => {
    initGA4(import.meta.env.VITE_GA_MEASUREMENT_ID ?? "G-XXXXXXXXXX");
  }, []);

  const publicContent = (
    <>
      <Header />
      <div id="main-content" tabIndex={-1}>
        <Outlet />
      </div>
      <Footer />
      <ShortlistTray />
    </>
  );

  return (
    <QueryClientProvider client={queryClient}>
      {isAdmin ? (
        <div id="main-content" tabIndex={-1}>
          <Outlet />
        </div>
      ) : (
        <ShortlistProvider>{publicContent}</ShortlistProvider>
      )}
    </QueryClientProvider>
  );
}
