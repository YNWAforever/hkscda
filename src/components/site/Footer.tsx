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
    <footer id="contact" className="bg-[var(--color-primary)] px-4 pt-14 text-white sm:px-6 lg:px-8">
      <div className="container-wide grid gap-10 pb-10 md:grid-cols-4">
        <div>
          <BrandLogo className="h-16 w-16 bg-white p-1" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/80">
            「支持領養等於拯救生命」，為流浪貓狗提供糧食、醫療、絕育及領養服務的「不殺」機構。
          </p>
        </div>

        <div>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">聯絡我們</h2>
          <ul className="space-y-3 text-sm text-white/85">
            <li>
              <a href="mailto:info@hkscda.com" className="flex min-h-11 items-center gap-2 hover:text-white">
                <Mail className="h-4 w-4 opacity-80" aria-hidden="true" /> info@hkscda.com
              </a>
            </li>
            <li>
              <a href="tel:+85298641089" className="flex min-h-11 items-center gap-2 hover:text-white">
                <Smartphone className="h-4 w-4 opacity-80" aria-hidden="true" /> WhatsApp / FPS: 9864 1089
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
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">追蹤我們</h2>
          <div className="flex gap-3">
            <a href="https://www.facebook.com/HKSCDA" target="_blank" rel="noopener noreferrer" className="flex h-11 w-11 items-center justify-center bg-white/10 hover:bg-white/20" aria-label="Facebook 專頁">
              <Facebook className="h-5 w-5" aria-hidden="true" />
            </a>
            <a href="https://www.instagram.com/hkscda/" target="_blank" rel="noopener noreferrer" className="flex h-11 w-11 items-center justify-center bg-white/10 hover:bg-white/20" aria-label="Instagram 專頁">
              <Instagram className="h-5 w-5" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-5 max-w-xs text-xs leading-relaxed text-white/70">
            每月25日前提交退稅收條申請，正式收條於次月中發出。
          </p>
        </div>

        <div>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">透明度</h2>
          <ul className="space-y-1 text-sm text-white/85">
            <li><a href="/report/adoption" className="flex min-h-11 items-center hover:text-white">每月領養報告</a></li>
            <li><a href="/report/audit" className="flex min-h-11 items-center hover:text-white">年度報告</a></li>
            <li><a href="/knowledge" className="flex min-h-11 items-center hover:text-white">知識資源</a></li>
            <li><a href="/donate" className="flex min-h-11 items-center hover:text-white">捐助我們</a></li>
            <li><a href="/volunteer" className="flex min-h-11 items-center hover:text-white">加入義工團隊</a></li>
            <li><a href="/volunteer/group" className="flex min-h-11 items-center hover:text-white">團體義工查詢</a></li>
          </ul>
        </div>
      </div>
      <div className="container-wide flex flex-wrap justify-between gap-3 border-t border-white/20 py-6 text-xs text-white/65">
        <span>© 2007-{new Date().getFullYear()} HK Saving Cat And Dog Association Limited</span>
        <span>支持領養 · 拯救生命</span>
      </div>
    </footer>
  );
}