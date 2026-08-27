import { Link } from "@tanstack/react-router";

import { BrandLogo } from "./BrandLogo";
import { brand } from "../../lib/brand/brand";

/**
 * Ported from the hkscdagpt design source (components/site-footer.tsx @953ecba)
 * and merged with main's footer per plan section 4.1: the source's column layout,
 * with main's social links and registration line retained.
 *
 * The source's existingApp("/donate") cross-origin handoff becomes a router link.
 * Registration and contact details come from the brand constants so the footer and
 * the home trust panel cannot drift apart.
 *
 * data-site-footer is required: the header's drawer marks it inert while open.
 */
export function Footer() {
  return (
    <footer className="site-footer" data-site-footer>
      <div className="public-container footer-grid">
        <div className="footer-brand">
          <BrandLogo />
          <div>
            <strong>{brand.nameZh}</strong>
            <p>以救援、醫療、絕育與負責任領養，守護香港流浪貓狗。</p>
          </div>
        </div>

        <div className="footer-column">
          <h2>立即行動</h2>
          <Link to="/animals/cat" className="public-footer-link">
            待領養貓隻
          </Link>
          <Link to="/animals/dog" className="public-footer-link">
            待領養狗隻
          </Link>
          <Link to="/adoption/instructions" className="public-footer-link">
            領養流程
          </Link>
          <Link to="/donate" className="public-footer-link">
            安全捐助
          </Link>
          <Link to="/volunteer" className="public-footer-link">
            成為義工
          </Link>
          <Link to="/volunteer/group" className="public-footer-link">
            企業及團體參與
          </Link>
        </div>

        <div className="footer-column">
          <h2>資料與聯絡</h2>
          <Link to="/report/adoption" className="public-footer-link">
            每月領養報告
          </Link>
          <Link to="/report/audit" className="public-footer-link">
            年報及審計報告
          </Link>
          <Link to="/knowledge" className="public-footer-link">
            飼養知識
          </Link>
          <Link to="/help" className="public-footer-link">
            求助及常見問題
          </Link>
          <a className="public-footer-link" href={`mailto:${brand.org.email}`}>
            {brand.org.email}
          </a>
          <a className="public-footer-link" href={brand.org.phoneHref}>
            {brand.org.phone}
          </a>
          <Link to="/about/privacy" className="public-footer-link">
            私隱政策
          </Link>
        </div>

        <div className="footer-column">
          <h2>追蹤我們</h2>
          <a
            className="public-footer-link"
            href={brand.social.facebook}
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook
          </a>
          <a
            className="public-footer-link"
            href={brand.social.instagram}
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram
          </a>
        </div>
      </div>

      <div className="public-container footer-bottom">
        <span>
          香港註冊慈善機構 · 檔案 {brand.org.charityFileNumber} · 漁農署{" "}
          {brand.org.afcdLicenceNumber}
        </span>
        <span>
          © {new Date().getFullYear()} {brand.acronym}
        </span>
      </div>
    </footer>
  );
}
