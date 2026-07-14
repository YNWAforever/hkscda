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
import { HelpWidget } from "../components/site/help/HelpWidget";
import { PublicStateShell } from "../components/site/PublicStateShell";
import { ShortlistProvider } from "../components/site/ShortlistProvider";
import { ShortlistTray } from "../components/site/ShortlistTray";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { organizationSchema, websiteSchema } from "../lib/schema";
import { initGA4 } from "../lib/analytics";

function NotFoundComponent() {
  return (
    <PublicStateShell
      title="找不到頁面"
      description="您要找的頁面不存在或已移動。"
      action={<Link to="/" className="btn-primary min-h-11 px-5">返回主頁</Link>}
    />
  );
}
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <PublicStateShell
      role="alert"
      title="頁面未能載入"
      description="系統出現問題。您可以嘗試重新整理或返回主頁。"
      action={(
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => { router.invalidate(); reset(); }} className="btn-primary min-h-11 px-5">
            重新整理
          </button>
          <Link to="/" className="btn-secondary min-h-11 px-5">返回主頁</Link>
        </div>
      )}
    />
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
      { property: "og:image", content: "https://hkscda.com/brand/hkscda-logo-primary.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "香港拯救貓狗協會 HKSCDA" },
      {
        name: "twitter:description",
        content: "支持領養 · 拯救生命 · 不殺機構",
      },
      { name: "twitter:image", content: "https://hkscda.com/brand/hkscda-logo-primary.jpg" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/jpeg", href: "/brand/hkscda-logo-primary.jpg" },
      { rel: "apple-touch-icon", href: "/brand/hkscda-logo-primary.jpg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Sans+HK:wght@300;400;500;700;900&display=swap",
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
  const analyticsPagePath = location.pathname.startsWith("/adoption/status/")
    ? "/adoption/status/[token]"
    : undefined;

  useEffect(() => {
    initGA4(import.meta.env.VITE_GA_MEASUREMENT_ID ?? "G-XXXXXXXXXX", {
      pagePath: analyticsPagePath,
    });
  }, [analyticsPagePath]);

  const publicContent = (
    <>
      <Header />
      <div id="main-content" tabIndex={-1}>
        <Outlet />
      </div>
      <Footer />
      <ShortlistTray />
      <HelpWidget />
    </>
  );

  return (
    <QueryClientProvider client={queryClient}>
      {isAdmin ? (
        <div className="admin-shell min-h-dvh" id="main-content" tabIndex={-1}>
          <Outlet />
        </div>
      ) : (
        <ShortlistProvider>
          <div className="site-shell min-h-dvh">{publicContent}</div>
        </ShortlistProvider>
      )}
    </QueryClientProvider>
  );
}
