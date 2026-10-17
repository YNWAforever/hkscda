import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { publicUrl } from "@/lib/publicOrigin";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { RouteError } from "../components/site/RouteError";

import appCss from "../styles.css?url";
import publicCss from "../styles/public.css?url";
import publicFontsCss from "../styles/fonts.css?url";
import { organizationSchema, websiteSchema } from "../lib/schema";
import { brand } from "../lib/brand/brand";
import { initGA4, redactSensitivePagePath } from "../lib/analytics";
import { resolveHeadPathname, shouldIncludePublicStyles } from "../lib/publicHeadAssets";

const PublicSiteShell = lazy(() => import("../components/site/PublicSiteShell"));

function NotFoundComponent() {
  return (
    <main>
      <section className="page-hero not-found-hero" aria-labelledby="not-found-title">
        <div className="public-container page-hero-grid">
          <div className="page-hero-copy">
            <p className="eyebrow">404 · 找不到頁面</p>
            <h1 id="not-found-title">這一頁走失了。</h1>
            <p>您要找的頁面不存在或已移動。可以由主頁重新開始，或直接前往以下常用頁面。</p>
            <div className="hero-actions">
              <Link to="/" className="button button-primary">
                返回主頁
              </Link>
              <Link to="/help" className="button button-secondary">
                求助及常見問題
              </Link>
            </div>
            <nav className="next-step-links not-found-links" aria-label="常用頁面">
              <Link className="pill-link" to="/animals/cat">
                <span>待領養貓貓</span>
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="pill-link" to="/animals/dog">
                <span>待領養狗狗</span>
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="pill-link" to="/donate">
                <span>支持救援</span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </nav>
          </div>
        </div>
      </section>
    </main>
  );
}
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ match, matches }) => ({
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
        content: "支持領養 · 拯救生命 · 為流浪貓狗提供糧食、醫療、絕育及領養服務",
      },
      { property: "og:type", content: "website" },
      {
        property: "og:image",
        content: publicUrl("/brand/hkscda-logo-primary.jpg"),
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "香港拯救貓狗協會 HKSCDA" },
      {
        name: "twitter:description",
        content: "支持領養 · 拯救生命 · 不殺機構",
      },
      {
        name: "twitter:image",
        content: publicUrl("/brand/hkscda-logo-primary.jpg"),
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      ...(shouldIncludePublicStyles(resolveHeadPathname(matches, match.pathname))
        ? [
            { rel: "stylesheet", href: publicFontsCss },
            { rel: "stylesheet", href: publicCss },
          ]
        : []),
      // Icons use the 192px copy: browsers fetch them on every page, and the
      // 960px primary is ten times the bytes for a tab or home-screen mark.
      { rel: "icon", type: "image/jpeg", sizes: "192x192", href: brand.logo.smallSrc },
      { rel: "apple-touch-icon", href: brand.logo.smallSrc },
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
  errorComponent: RouteError,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <HeadContent />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
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
  const analyticsPagePath = redactSensitivePagePath(location.pathname);

  useEffect(() => {
    const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
    if (!measurementId) return;

    initGA4(measurementId, {
      pagePath: analyticsPagePath,
    });
  }, [analyticsPagePath]);

  return (
    <QueryClientProvider client={queryClient}>
      {isAdmin ? (
        <div className="admin-shell min-h-dvh" id="main-content" tabIndex={-1}>
          <Outlet />
        </div>
      ) : (
        <Suspense fallback={null}>
          <PublicSiteShell pathname={location.pathname}>
            <Outlet />
          </PublicSiteShell>
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
