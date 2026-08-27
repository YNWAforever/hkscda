import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export type PublicPageAction = {
  label: string;
  /** Same-origin router destination. */
  to?: string;
  /** Only for mailto: and tel:; every page destination is same-origin. */
  href?: string;
  accent?: boolean;
};

export type PublicPageHighlight = { kicker: string; title: string; description: string };

export type PublicPageChapter = {
  eyebrow?: string;
  title: string;
  description: string;
  bullets?: string[];
};

export type PublicPageCta = {
  eyebrow: string;
  title: string;
  description: string;
  points?: string[];
  action?: PublicPageAction;
};

function ActionLink({ action, className }: { action: PublicPageAction; className: string }) {
  if (action.href) {
    return (
      <a className={className} href={action.href}>
        {action.label}
      </a>
    );
  }
  return (
    <Link className={className} to={action.to ?? "/"}>
      {action.label}
    </Link>
  );
}

/**
 * Shared frame for the content routes, ported from the design source
 * components/public-page.tsx @953ecba per plan section 4.2.
 *
 * Two changes from the source. It takes props rather than reading a central page
 * config, because each route here has its own loader. And the secure-handoff
 * band becomes an optional cta: after the merge there is no other origin to hand
 * off to, so the safeguard wording about leaving the site is gone.
 */
export function PublicPageFrame({
  eyebrow,
  title,
  description,
  actions = [],
  image,
  imageAlt,
  highlights = [],
  chapters = [],
  cta,
  lang,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: PublicPageAction[];
  image?: string;
  imageAlt?: string;
  highlights?: PublicPageHighlight[];
  chapters?: PublicPageChapter[];
  cta?: PublicPageCta;
  /** Set when a page serves a language other than the document default. */
  lang?: string;
  children?: ReactNode;
}) {
  return (
    <main className="public-page" lang={lang}>
      <section className="page-hero" aria-labelledby="page-title">
        <div className="public-container page-hero-grid">
          <div className="page-hero-copy">
            <p className="eyebrow">{eyebrow}</p>
            <h1 id="page-title">{title}</h1>
            <p>{description}</p>
            {actions.length ? (
              <div className="hero-actions">
                {actions.map((action, index) => (
                  <ActionLink
                    key={action.label}
                    action={action}
                    className={
                      "button " +
                      (action.accent
                        ? "button-accent"
                        : index === 0
                          ? "button-primary"
                          : "button-secondary")
                    }
                  />
                ))}
              </div>
            ) : null}
          </div>
          {image ? (
            <figure className="page-hero-photo">
              <img src={image} alt={imageAlt ?? ""} />
              <figcaption>HKSCDA 救援相片</figcaption>
            </figure>
          ) : null}
        </div>
      </section>

      {children}

      {highlights.length ? (
        <section className="page-highlights" aria-label={eyebrow + "重點"}>
          <div className="public-container highlight-grid">
            {highlights.map((item) => (
              <article key={item.title}>
                <span>{item.kicker}</span>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {chapters.length ? (
        <section className="section page-content-section">
          <div className="public-container page-content-grid">
            <div className="page-content-main">
              {chapters.map((chapter) => (
                <section className="content-chapter" key={chapter.title}>
                  {chapter.eyebrow ? <p className="eyebrow">{chapter.eyebrow}</p> : null}
                  <h2>{chapter.title}</h2>
                  <p>{chapter.description}</p>
                  {chapter.bullets?.length ? (
                    <ul className="check-list">
                      {chapter.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>

            <aside className="page-context-panel" aria-label="協助與資料提示">
              <p className="eyebrow">安心瀏覽</p>
              <h2>最新資料，清楚指引。</h2>
              <p>
                動物狀態、活動安排及正式申請均以協會最新公開資料為準；如有疑問，可先查看常見問題或直接聯絡團隊。
              </p>
              <dl>
                <div>
                  <dt>動物</dt>
                  <dd>以最新公開狀態為準</dd>
                </div>
                <div>
                  <dt>申請</dt>
                  <dd>經正式安全表格提交</dd>
                </div>
                <div>
                  <dt>捐助</dt>
                  <dd>使用協會安全流程</dd>
                </div>
              </dl>
              <Link className="text-link" to="/help">
                查看常見問題與聯絡 <span aria-hidden="true">→</span>
              </Link>
            </aside>
          </div>
        </section>
      ) : null}

      {cta ? (
        <section className="secure-handoff" aria-labelledby="cta-title">
          <div className="public-container handoff-grid">
            <div>
              <p className="eyebrow eyebrow-light">{cta.eyebrow}</p>
              <h2 id="cta-title">{cta.title}</h2>
              <p>{cta.description}</p>
            </div>
            <div className="handoff-actions">
              {cta.points?.length ? (
                <ul>
                  {cta.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              ) : null}
              {cta.action ? (
                <ActionLink action={cta.action} className="button button-accent" />
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="page-next-step">
        <div className="public-container next-step-shell">
          <div>
            <p className="eyebrow">下一步</p>
            <h2>選擇適合你的參與方式。</h2>
          </div>
          <div className="section-actions">
            <Link className="text-link" to="/animals/cat">
              尋找領養動物 <span aria-hidden="true">→</span>
            </Link>
            <Link className="text-link" to="/volunteer">
              成為義工 <span aria-hidden="true">→</span>
            </Link>
            <Link className="text-link" to="/donate">
              支持救援 <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
