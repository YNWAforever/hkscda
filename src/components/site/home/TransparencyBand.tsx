import { Link } from "@tanstack/react-router";

import { brand } from "../../../lib/brand/brand";

/**
 * Ported from hkscdagpt app/page.tsx (transparency-section). Every figure in the
 * trust panel comes from the brand constants, so this panel and the footer cannot
 * state the registration identity differently (plan section 9, WP-1).
 */
export function TransparencyBand() {
  return (
    <section className="section transparency-section" aria-labelledby="transparency-title">
      <div className="public-container transparency-grid">
        <div className="transparency-copy">
          <p className="eyebrow eyebrow-light">透明與問責</p>
          <h2 id="transparency-title">善意需要信任，信任需要資料。</h2>
          <p>查看協會的年報、審計與工作成效；如需核實捐助、領養或求助安排，可直接聯絡團隊。</p>
          <div className="transparency-actions">
            <Link className="button button-light" to="/report/audit">
              查看年報及審計
            </Link>
            <Link className="text-link text-link-light" to="/report/adoption">
              領養工作成效 <span aria-hidden="true">→</span>
            </Link>
            <a className="text-link text-link-light" href={"mailto:" + brand.org.email}>
              {brand.org.email}
            </a>
          </div>
        </div>
        <aside className="trust-panel" aria-label="協會資料">
          <dl>
            <div>
              <dt>成立</dt>
              <dd>2007 年 4 月 1 日</dd>
            </div>
            <div>
              <dt>慈善檔案</dt>
              <dd>{brand.org.charityFileNumber}</dd>
            </div>
            <div>
              <dt>漁護署機構編號</dt>
              <dd>{brand.org.afcdLicenceNumber}</dd>
            </div>
            <div>
              <dt>原則</dt>
              <dd>No Kill · 不殺機構</dd>
            </div>
          </dl>
          <Link className="button button-accent" to="/donate">
            前往捐助頁面
          </Link>
        </aside>
      </div>
    </section>
  );
}
