import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ShieldCheck } from "lucide-react";

import { brand } from "../../../lib/brand/brand";
import { keepTail } from "../keepTail";
import heroImg from "@/assets/dog-smiling.jpg";
import heroImg480 from "@/assets/dog-smiling-480.jpg";
import heroImg768 from "@/assets/dog-smiling-768.jpg";
import heroImg1024 from "@/assets/dog-smiling-1024.jpg";

/**
 * Ported from hkscdagpt app/page.tsx (home-hero), with same-origin links.
 *
 * The headline is set phrase by phrase. Chinese has no spaces, so a browser
 * left to itself breaks wherever the measure runs out (購/買, 救/援); each line
 * here is a whole phrase, and the text content stays the one sentence.
 */
export function HomeHero() {
  return (
    <section className="home-hero" aria-labelledby="home-title">
      <div className="public-container hero-grid">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow">
            <span className="hero-eyebrow-rule" aria-hidden="true" />
            香港本地動物救援慈善機構
          </p>
          <h1 id="home-title" className="hero-title">
            <span className="hero-line">領養代替購買，</span>
            <span className="hero-line">讓每次救援</span>
            <span className="hero-line">
              連接
              <span className="hero-mark">
                一個家
                <svg viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M3 13.5C42 6 96 3.5 197 8.5" pathLength={1} />
                </svg>
              </span>
              。
            </span>
          </h1>
          <p className="hero-lead">
            {keepTail("從即時救援、醫療與絕育，到負責任領養，讓流浪貓狗重新得到安全、照顧與歸屬。")}
          </p>
          <div className="hero-actions">
            <a className="button button-primary button-arrow" href="#featured-animals">
              尋找領養動物
              <ArrowDown aria-hidden="true" />
            </a>
            <Link className="button button-secondary button-arrow" to="/donate">
              支持救援
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <p className="trust-cue">
            <ShieldCheck aria-hidden="true" />
            <span>
              成立於 {brand.org.foundedYear} 年 · 香港註冊慈善機構 {brand.org.charityFileNumber}
            </span>
          </p>
        </div>
        <div className="hero-visual">
          <figure className="hero-photo">
            <img
              src={heroImg1024}
              srcSet={`${heroImg480} 480w, ${heroImg768} 768w, ${heroImg1024} 1024w, ${heroImg} 1500w`}
              sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1200px) 45vw, 540px"
              width={1500}
              height={2000}
              alt="在協會犬舍外開心迎接訪客的獲救唐狗"
              fetchPriority="high"
            />
            <figcaption>真實 HKSCDA 救援相片</figcaption>
          </figure>
          <HeroSeal />
        </div>
      </div>
    </section>
  );
}

/**
 * The circular seal states the association's principle, not a statistic. The
 * ring is Latin only: set on a circle, Chinese characters turn upside down
 * along the bottom, so the Chinese sits upright in the centre instead. Its
 * ring turns with the page scroll where scroll-driven animation is supported
 * and motion is welcome; everywhere else it is a still mark.
 */
function HeroSeal() {
  return (
    <div className="hero-seal" aria-hidden="true">
      <svg viewBox="0 0 160 160">
        <defs>
          <path id="hero-seal-ring" d="M80 80m-58 0a58 58 0 1 1 116 0a58 58 0 1 1-116 0" />
        </defs>
        <g className="hero-seal-ring">
          <text>
            <textPath href="#hero-seal-ring" textLength="364">
              ADOPT · DON’T SHOP · HKSCDA · SINCE {brand.org.foundedYear} ·
            </textPath>
          </text>
        </g>
      </svg>
      <span className="hero-seal-core">
        <strong>No Kill</strong>
        <small>不殺機構</small>
      </span>
    </div>
  );
}
