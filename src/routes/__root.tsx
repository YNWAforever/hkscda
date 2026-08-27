import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { publicUrl } from "@/lib/publicOrigin";
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
import { PublicFixedActionsProvider } from "../components/site/fixedActions/PublicFixedActions";
import { ContextualDonationPrompt } from "../components/site/donations/ContextualDonationPrompt";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { organizationSchema, websiteSchema } from "../lib/schema";
import { initGA4, redactSensitivePagePath } from "../lib/analytics";

function NotFoundComponent() {
  return (
    <PublicStateShell
      title="找不到頁面"
      description="您要找的頁面不存在或已移動。"
      action={
        <Link to="/" className="btn-primary min-h-11 px-5">
          返回主頁
        </Link>
      }
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
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="btn-primary min-h-11 px-5"
          >
            重新整理
          </button>
          <Link to="/" className="btn-secondary min-h-11 px-5">
            返回主頁
          </Link>
        </div>
      }
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
      { rel: "icon", type: "image/jpeg", href: "/brand/hkscda-logo-primary.jpg" },
      { rel: "apple-touch-icon", href: "/brand/hkscda-logo-primary.jpg" },
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

  const publicContent = (
    <div className="site-shell min-h-dvh">
      <Header />
      <div id="main-content" tabIndex={-1} data-site-content>
        <Outlet />
      </div>
      <Footer />
      <ShortlistTray />
      <ContextualDonationPrompt pathname={location.pathname} />
      <HelpWidget />
    </div>
  );

  return (
    <QueryClientProvider client={queryClient}>
      {isAdmin ? (
        <div className="admin-shell min-h-dvh" id="main-content" tabIndex={-1}>
          <Outlet />
        </div>
      ) : (
        <ShortlistProvider>
          <PublicFixedActionsProvider>{publicContent}</PublicFixedActionsProvider>
        </ShortlistProvider>
      )}
    </QueryClientProvider>
  );
}
