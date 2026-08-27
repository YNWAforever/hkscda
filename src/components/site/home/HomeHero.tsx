import { Link } from "@tanstack/react-router";

import { brand } from "../../../lib/brand/brand";
import heroImg from "@/assets/dog-smiling.jpg";

/** Ported from hkscdagpt app/page.tsx (home-hero), with same-origin links. */
export function HomeHero() {
  return (
    <section className="home-hero" aria-labelledby="home-title">
      <div className="public-container hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">香港本地動物救援慈善機構</p>
          <h1 id="home-title">領養代替購買，讓每次救援連接一個家。</h1>
          <p className="hero-lead">
            從即時救援、醫療與絕育，到負責任領養，讓流浪貓狗重新得到安全、照顧與歸屬。
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#featured-animals">
              尋找領養動物
            </a>
            <Link className="button button-secondary" to="/donate">
              支持救援
            </Link>
          </div>
          <p className="trust-cue">
            成立於 {brand.org.foundedYear} 年 · 香港註冊慈善機構 {brand.org.charityFileNumber}
          </p>
        </div>
        <figure className="hero-photo">
          <img src={heroImg} alt="在協會犬舍外開心迎接訪客的獲救唐狗" fetchPriority="high" />
          <figcaption>真實 HKSCDA 救援相片</figcaption>
        </figure>
      </div>
    </section>
  );
}
