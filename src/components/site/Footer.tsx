import {
  BadgeCheck,
  Building2,
  Facebook,
  Instagram,
  Mail,
  ReceiptText,
  Smartphone,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";

export function Footer() {
  return (
    <footer
      id="contact"
      className="border-t border-[var(--color-divider)] bg-[var(--color-footer-bg)] px-4 pt-14 text-[var(--color-text)] sm:px-6 lg:px-8"
    >
      <div className="container-wide grid gap-10 pb-10 md:grid-cols-4">
        <div>
          <BrandLogo className="h-16 w-16 rounded-[var(--public-radius-sm)] border border-[var(--color-divider)] bg-white p-1" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-[var(--color-text-muted)]">
            「支持領養等於拯救生命」，為流浪貓狗提供糧食、醫療、絕育及領養服務的「不殺」機構。
          </p>
        </div>

        <div>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--color-text)]">
            聯絡我們
          </h2>
          <ul className="space-y-3 text-sm text-[var(--color-text-muted)]">
            <li>
              <a
                href="mailto:info@hkscda.com"
                className="public-footer-link flex min-h-11 items-center gap-2"
              >
                <Mail className="h-4 w-4 opacity-80" aria-hidden="true" /> info@hkscda.com
              </a>
            </li>
            <li>
              <a
                href="tel:+85298641089"
                className="public-footer-link flex min-h-11 items-center gap-2"
              >
                <Smartphone className="h-4 w-4 opacity-80" aria-hidden="true" /> WhatsApp / 電話：
                9864 1089
              </a>
            </li>
            <li className="flex min-h-11 items-center gap-2">
              <BadgeCheck className="h-4 w-4 opacity-80" aria-hidden="true" /> 慈善牌照：91/14493
            </li>
            <li className="flex min-h-11 items-center gap-2">
              <Building2 className="h-4 w-4 opacity-80" aria-hidden="true" /> 漁農署 ORG-00041
            </li>
            <li className="flex min-h-11 items-center gap-2">
              <ReceiptText className="h-4 w-4 opacity-80" aria-hidden="true" /> IRD §88 免稅機構
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--color-text)]">
            追蹤我們
          </h2>
          <div className="flex gap-3">
            <a
              href="https://www.facebook.com/HKSCDA"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-divider)] bg-[var(--color-surface)] text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)]"
              aria-label="Facebook 專頁"
            >
              <Facebook className="h-5 w-5" aria-hidden="true" />
            </a>
            <a
              href="https://www.instagram.com/hkscda/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-divider)] bg-[var(--color-surface)] text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)]"
              aria-label="Instagram 專頁"
            >
              <Instagram className="h-5 w-5" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-5 max-w-xs text-xs leading-relaxed text-[var(--color-text-muted)]">
            每月25日前提交退稅收條申請，正式收條於次月中發出。
          </p>
        </div>

        <div>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--color-text)]">
            透明度
          </h2>
          <ul className="space-y-1 text-sm text-[var(--color-text-muted)]">
            <li>
              <a href="/report/adoption" className="public-footer-link flex min-h-11 items-center">
                每月領養報告
              </a>
            </li>
            <li>
              <a href="/report/audit" className="public-footer-link flex min-h-11 items-center">
                年度報告
              </a>
            </li>
            <li>
              <a href="/knowledge" className="public-footer-link flex min-h-11 items-center">
                知識資源
              </a>
            </li>
            <li>
              <a href="/donate" className="public-footer-link flex min-h-11 items-center">
                捐助我們
              </a>
            </li>
            <li>
              <a href="/volunteer" className="public-footer-link flex min-h-11 items-center">
                加入義工團隊
              </a>
            </li>
            <li>
              <a href="/volunteer/group" className="public-footer-link flex min-h-11 items-center">
                團體義工查詢
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="container-wide flex flex-wrap justify-between gap-3 border-t border-[var(--color-divider)] py-6 text-xs text-[var(--color-text-muted)]">
        <span>© 2007-{new Date().getFullYear()} HK Saving Cat And Dog Association Limited</span>
        <span>支持領養 · 拯救生命</span>
      </div>
    </footer>
  );
}
