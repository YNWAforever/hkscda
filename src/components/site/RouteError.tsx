import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";

import { reportLovableError } from "../../lib/lovable-error-reporting";

/**
 * The router's default error boundary as well as the root's. As the default,
 * a page that throws keeps the header, footer and navigation around it; the
 * root boundary only shows this on its own when the shell itself failed, which
 * is why it carries .site-shell for the public tokens.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="site-shell">
      <section className="page-hero not-found-hero" role="alert" aria-live="assertive">
        <div className="public-container page-hero-grid">
          <div className="page-hero-copy">
            <p className="eyebrow">系統訊息</p>
            <h1>頁面未能載入</h1>
            <p>系統出現問題。您可以嘗試重新整理或返回主頁。</p>
            <div className="hero-actions">
              <button
                type="button"
                onClick={() => {
                  router.invalidate();
                  reset();
                }}
                className="button button-primary"
              >
                重新整理
              </button>
              <Link to="/" className="button button-secondary">
                返回主頁
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
